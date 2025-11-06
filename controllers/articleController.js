const url = require("url");
const fs = require("fs");
const path = require("path");
const authController = require('./authController');

// file path
const file = "articles.json";
if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
}

//  create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

function generateFileName(originalName) {
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    return `${base}-${timestamp}${ext}`;
}

// GET
function getArticles(req, res) {
    fs.readFile(file, "utf8", (err, data) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Internal server error" }));
        }

        let articles = [];
        try {
            articles = JSON.parse(data);
            if (!Array.isArray(articles)) articles = [];
        } catch (e) {
            articles = [];
        }

        // newest first
        const sortedArticles = articles.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        const fullUrl = new URL(req.url, `http://${req.headers.host}`);
        const page = Math.max(1, parseInt(fullUrl.searchParams.get("page")) || 1);
        const limit = Math.max(1, parseInt(fullUrl.searchParams.get("limit")) || 10);

        // --- VALIDATION FOR FILTERS ---
        const filters = Object.fromEntries(fullUrl.searchParams.entries());
        for (const key in filters) {
            const value = filters[key].toLowerCase();

            if (!["page", "limit", "category", "status", "tags", "search"].includes(key)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid query key: ${key}` }));
            }

            if (key === "category" && !allowedCategories.map(c => c.toLowerCase()).includes(value)) {
                return res.end(JSON.stringify({ totalData: 0, totalPages: 0, currentPage: page, limit, data: [] }));
            }

            if (key === "status" && !allowedStatuses.map(s => s.toLowerCase()).includes(value)) {
                return res.end(JSON.stringify({ totalData: 0, totalPages: 0, currentPage: page, limit, data: [] }));
            }

            if (key === "tags" && !allowedTags.map(t => t.toLowerCase()).includes(value)) {
                return res.end(JSON.stringify({ totalData: 0, totalPages: 0, currentPage: page, limit, data: [] }));
            }
        }

        // Apply filtering (if any)
        let filteredArticles = [...sortedArticles];
        for (const key in filters) {
            const value = filters[key].toLowerCase();

            if (key === "search") {
                filteredArticles = filteredArticles.filter(a =>
                    a.title.toLowerCase().includes(value) ||
                    a.content.toLowerCase().includes(value) ||
                    (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(value)))
                );
            } else if (key === "tags") {
                filteredArticles = filteredArticles.filter(a =>
                    Array.isArray(a.tags) &&
                    a.tags.map(tag => tag.toLowerCase()).includes(value)
                );
            } else if (key === "category" || key === "status") {
                filteredArticles = filteredArticles.filter(a =>
                    a[key] && a[key].toString().toLowerCase() === value
                );
            }
        }

        const totalData = filteredArticles.length;
        const totalPages = totalData === 0 ? 0 : Math.ceil(totalData / limit);

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const dataSlice = startIndex < totalData ? filteredArticles.slice(startIndex, endIndex) : [];

        const response = {
            totalData,
            totalPages,
            currentPage: page,
            limit,
            data: dataSlice,
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
    });
}


// Allowed categories, tags, and status
const allowedCategories = ["Programming", "Technology", "Design", "Web Developement"];
const allowedStatuses = ["draft", "published", "achieve"];
const allowedTags = ["api", "node", "frontend", "backend"];

// POST
function createArticle(req, res) {
    // Authenticate user first
    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    // Check content type
    const contentType = req.headers["content-type"] || "";
    const isFormData = contentType.includes("multipart/form-data");

    if (!isFormData) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Content-Type must be multipart/form-data" }));
    }

    let data = Buffer.alloc(0);
    req.on("data", chunk => (data = Buffer.concat([data, chunk])));
    req.on("end", () => {
        const boundary = "--" + contentType.split("boundary=")[1];
        const parts = data.toString().split(boundary).filter(p => p.includes("Content-Disposition"));

        let articleData = {};
        let imagePath = null;

        for (const part of parts) {
            const nameMatch = part.match(/name="([^"]+)"/);
            const fieldName = nameMatch && nameMatch[1];

            if (part.includes("filename=")) {
                // handle file upload
                const filenameMatch = part.match(/filename="([^"]+)"/);
                const originalName = filenameMatch && filenameMatch[1];
                const fileData = part.split("\r\n\r\n")[1].split("\r\n--")[0];
                const buffer = Buffer.from(fileData, "binary");

                const savedName = generateFileName(originalName);
                const filePath = path.join(uploadsDir, savedName);
                fs.writeFileSync(filePath, buffer);

                imagePath = `/uploads/${savedName}`;
            } else if (fieldName) {
                const value = part.split("\r\n\r\n")[1].split("\r\n--")[0].trim();
                try {
                    articleData[fieldName] = JSON.parse(value);
                } catch {
                    articleData[fieldName] = value;
                }
            }
        }

        const { title, content, category, status, tags } = articleData;

        //  VALIDATIONS 
        if (!title?.trim()) {
            return sendError(res, "Title is required.");
        }

        if (!content?.trim()) {
            return sendError(res, "Content is required.");
        }

        if (!category?.trim()) {
            return sendError(res, "Category is required.");
        }
        if (!allowedCategories.includes(category)) {
            return sendError(res, "Invalid category provided.");
        }

        if (!status?.trim()) {
            return sendError(res, "Status is required.");
        }
        if (!allowedStatuses.includes(status)) {
            return sendError(res, "Invalid status provided.");
        }

        if (!tags || tags.length === 0) {
            return sendError(res, "At least one tag is required.");
        }
        if (!tags.every(tag => allowedTags.includes(tag))) {
            return sendError(res, "Invalid tag(s) provided.");
        }

        if (!imagePath) {
            return sendError(res, "Image upload is required.");
        }


        // === Save new article ===
        const articles = JSON.parse(fs.readFileSync(file, "utf8"));

        const newArticle = {
            id: articles.length ? articles[articles.length - 1].id + 1 : 1,
            title,
            content,
            author: user.username,
            category,
            status,
            tags,
            image: imagePath,
            likes: 0,
            comments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        articles.push(newArticle);
        fs.writeFileSync(file, JSON.stringify(articles, null, 2));

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article created successfully", article: newArticle }));
    });
}

// helper for sending validation errors
function sendError(res, msg) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
}



// GET article by ID
function getArticleById(req, res) {
    const id = parseInt(req.url.split("/")[3]);

    const data = fs.readFileSync(file, "utf8");
    const articles = JSON.parse(data);

    const article = articles.find((a) => a.id === id);

    if (!article) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(article));
}

// update
function updateArticle(req, res) {
    // Authenticate user first
    const user = authController.authenticate(req);
    ;
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3]);
    let body = "";

    req.on("data", (chunk) => {
        body += chunk;
    });

    req.on("end", () => {
        const updatedData = JSON.parse(body);

        const data = fs.readFileSync(file, "utf8");
        const articles = JSON.parse(data);

        const index = articles.findIndex((article) => article.id === id);

        if (index === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        // Check if the authenticated user is the author
        if (articles[index].author !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Forbidden: You can only update your own articles" }));
        }

        const updatedArticle = {
            ...articles[index],
            ...updatedData,
            updatedAt: new Date().toISOString()
        };
        articles[index] = updatedArticle;

        fs.writeFileSync(file, JSON.stringify(articles, null, 2));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(updatedArticle));
    });
}

// delete
function deleteArticle(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/").pop());
    const data = fs.readFileSync(file, "utf8");
    let articles = JSON.parse(data);

    const index = articles.findIndex((a) => a.id === id);
    if (index === -1) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }


    if (articles[index].author !== user.username) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Forbidden: You can only delete your own articles" }));
    }

    const deleted = articles.splice(index, 1);
    fs.writeFileSync(file, JSON.stringify(articles, null, 2));

    res.writeHead(204, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Article deleted", deleted }));
}

// filtering
function filterArticles(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const filters = Object.fromEntries(url.searchParams.entries());

    fs.readFile(file, "utf8", (err, data) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Error reading file" }));
        }

        let articles = JSON.parse(data);

        for (const key in filters) {
            const value = filters[key].toLowerCase();

            //  Validate keys
            if (!["search", "category", "status", "tags"].includes(key)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid filter key: ${key}` }));
            }

            // Validate allowed values 

            if (key === "category" && !allowedCategories.map(c => c.toLowerCase()).includes(value)) {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify([]));
            }

            if (key === "status" && !allowedStatuses.map(s => s.toLowerCase()).includes(value)) {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify([]));
            }

            if (key === "tags" && !allowedTags.map(t => t.toLowerCase()).includes(value)) {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify([]));
            }

            //  Apply the filtering
            if (key === "search") {
                articles = articles.filter(a =>
                    a.title.toLowerCase().includes(value) ||
                    a.content.toLowerCase().includes(value) ||
                    (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(value)))
                );
            } else if (key === "tags") {
                articles = articles.filter(a =>
                    Array.isArray(a.tags) &&
                    a.tags.map(tag => tag.toLowerCase()).includes(value)
                );
            } else {
                articles = articles.filter(a =>
                    a[key] && a[key].toString().toLowerCase().includes(value)
                );
            }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(articles.length ? articles : []));
    });
}


// Like Article
function likeArticle(req, res) {
    const id = parseInt(req.url.split("/")[3]);
    const data = fs.readFileSync(file, "utf8");
    const articles = JSON.parse(data);

    const index = articles.findIndex((a) => a.id === id);
    if (index === -1) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    // articles[index].likes += 1;

    if (typeof articles[index].liked === "undefined") {
        articles[index].liked = false;
    }

    // Toggle like
    if (articles[index].liked) {
        articles[index].likes = Math.max(articles[index].likes - 1, 0);
        articles[index].liked = false;
        message = "Article unliked!";
    } else {
        articles[index].likes += 1;
        articles[index].liked = true;
        message = "Article liked!";
    }

    fs.writeFileSync(file, JSON.stringify(articles, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Article liked!", article: articles[index] }));
}

// post comment
function postComment(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3]);
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        const { text } = JSON.parse(body);

        if (!text || text.trim() === "") {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment text is required" }));
        }

        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const article = data.find(a => a.id === id);

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        const comment = {
            id: Date.now(),
            user: user.username,
            text,
            date: new Date().toISOString(),
            replies: []
        };

        if (!Array.isArray(article.comments)) {
            article.comments = [];
        }


        article.comments.push(comment);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(comment));
    });
}

// get comment
function getComments(req, res) {
    const id = parseInt(req.url.split("/")[3]);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === id);

    if (!article) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(article.comments));
}

// reply comment
function replyComment(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }


    const parts = req.url.split("/");
    const articleId = parseInt(parts[3]);
    const commentId = parseInt(parts[5]);
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {

        const { text } = JSON.parse(body);

        if (!text || text.trim() === "") {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply text is required" }));
        }
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const article = data.find(a => a.id === articleId);

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        const comment = article.comments.find(c => c.id === commentId);

        if (!comment) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment not found" }));
        }

        const reply = {
            id: Date.now(),
            user: user.username,
            text,
            date: new Date().toISOString()
        };

        if (comment.user !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "You are not allowed to reply to this comment" }));
        }


        comment.replies = comment.replies || [];
        comment.replies.push(reply);

        fs.writeFileSync(file, JSON.stringify(data, null, 2));

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply));
    });
}


// like/unlike a comment
function likeComment(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === articleId);

    if (!article) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    const comment = article.comments.find(c => c.id === commentId);
    if (!comment) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Comment not found" }));
    }

    // Initialize liked if not present
    if (typeof comment.liked === "undefined") comment.liked = false;

    let message;
    if (comment.liked) {
        comment.liked = false;
        message = "Comment unliked!";
    } else {
        comment.liked = true;
        message = "Comment liked!";
    }

    if (comment.user !== user.username) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "You are not allowed to like to this comment" }));
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message, comment }));
}

// like/unlike a reply
function likeReply(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);
    const replyId = parseInt(urlParts[7]);

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === articleId);
    if (!article) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    const comment = article.comments.find(c => c.id === commentId);
    if (!comment) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Comment not found" }));
    }

    const reply = comment.replies.find(r => r.id === replyId);
    if (!reply) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Reply not found" }));
    }

    console.log("Reply user:", reply.user);
    console.log("Token user:", user.username);


    if (reply.user !== user.username) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "You are not allowed to like to this reply" }));
    }


    // Initialize liked if not present
    if (typeof reply.liked === "undefined") reply.liked = false;

    let message;
    if (reply.liked) {
        reply.liked = false;
        message = "Reply unliked!";
    } else {
        reply.liked = true;
        message = "Reply liked!";
    }



    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message, reply }));
}


//  Edit a comment or reply
function editCommentOrReply(req, res) {

    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);
    const isReply = urlParts.includes("replies");
    const replyId = isReply ? parseInt(urlParts[7]) : null;

    let body = "";
    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", () => {
        const { text } = JSON.parse(body);
        if (!text?.trim()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Text cannot be empty." }));
        }

        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const article = data.find(a => a.id === articleId);
        if (!article) return res.writeHead(404).end(JSON.stringify({ message: "Article not found" }));

        const comment = article.comments.find(c => c.id === commentId);

        if (!comment) return res.writeHead(404).end(JSON.stringify({ message: "Comment not found" }));

        // if (comment.user !== user.username) {
        //     res.writeHead(403, { "Content-Type": "application/json" });
        //     return res.end(JSON.stringify({ message: "You are not allowed to edit to this comment" }));
        // }



        if (isReply) {
            const reply = comment.replies.find(r => r.id === replyId);

            if (!reply) return res.writeHead(404).end(JSON.stringify({ message: "Reply not found" }));


            if (reply.user !== user.username) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "You are not allowed to edit this reply" }));
            }

            reply.text = text;

            reply.updatedAt = new Date().toISOString();

            fs.writeFileSync(file, JSON.stringify(data, null, 2));

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply updated!", reply }));


        }

        if (comment.user !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "You are not allowed to edit this comment" }));
        }
        else {
            comment.text = text;
            comment.updatedAt = new Date().toISOString();
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment updated!", comment }));
        }
    });
}

//  Delete a comment or reply
function deleteCommentOrReply(req, res) {
    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);
    const isReply = urlParts.includes("replies");
    const replyId = isReply ? parseInt(urlParts[7]) : null;

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === articleId);
    if (!article) return res.writeHead(404).end(JSON.stringify({ message: "Article not found" }));

    const comment = article.comments.find(c => c.id === commentId);
    if (!comment) return res.writeHead(404).end(JSON.stringify({ message: "Comment not found" }));

    if (isReply) {
        const replyIndex = comment.replies.findIndex(r => r.id === replyId);
        if (replyIndex === -1) return res.writeHead(404).end(JSON.stringify({ message: "Reply not found" }));
        comment.replies.splice(replyIndex, 1);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        res.writeHead(204, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Reply deleted!" }));
    } else {
        const commentIndex = article.comments.findIndex(c => c.id === commentId);
        article.comments.splice(commentIndex, 1);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        res.writeHead(204, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Comment deleted!" }));
    }
}




//  Unlike an article
function unlikeArticle(req, res) {
    const id = parseInt(req.url.split("/")[3]);

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === id);

    if (!article) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Article not found" }));
    }

    if (article.likes > 0) {
        article.likes -= 1;
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Article unliked successfully", likes: article.likes }));
}





module.exports = { getArticles, createArticle, getArticleById, updateArticle, deleteArticle, filterArticles, likeArticle, postComment, getComments, unlikeArticle, replyComment, likeComment, likeReply, editCommentOrReply, deleteCommentOrReply };