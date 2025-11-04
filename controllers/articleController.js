const fs = require("fs");

// file path
const file = "articles.json";
if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
}

// GET
function getArticles(req, res) {
    fs.readFile(file, "utf8", (err, data) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Internal server error" }));
        }

        const articles = JSON.parse(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(articles));
    });
}

// Allowed categories, tags, and status
const allowedCategories = ["Programming", "Technology", "Design", "Web Developement"];
const allowedStatuses = ["draft", "published", "achieve"];
const allowedTags = ["api", "node", "frontend", "backend"];

// POST
function createArticle(req, res) {
    // Authenticate user first
    const user = require('./authController').authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        try {
            const { title, content, category, status, tags } = JSON.parse(body);

            // choose an image based on title or category
            const query = category || (title ? title.split(" ")[0] : "random");

            // generate an Unsplash image URL
            const imageURL = `https://unsplash.com/800x600/?${encodeURIComponent(query)}`;


            // validating for title 
            if (!title?.trim() || "") {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Title is required." }));
            }

            // validating for content 
            if (!content?.trim() || "") {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Content is required." }));
            }


            if (!category?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Category is required." }));
            }
            if (!allowedCategories.includes(category)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid category provided." }));
            }

            if (!status?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Status is required." }));
            }
            if (!allowedStatuses.includes(status)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid status provided." }));
            }

            if (!tags || tags.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "At least one tag is required." }));
            }
            if (!tags.every(tag => allowedTags.includes(tag))) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid tag(s) provided." }));
            }

            const data = fs.readFileSync(file, "utf8");
            const articles = JSON.parse(data);

            const newArticle = {
                id: articles.length ? articles[articles.length - 1].id + 1 : 1,
                title,
                content,
                author: user.username,
                category: category || "",
                status: status || "draft",
                tags: tags || [],
                image: imageURL,
                likes: 0,
                comments: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            articles.push(newArticle);
            fs.writeFileSync(file, JSON.stringify(articles, null, 2));

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Article created successfully", article: newArticle }));
        } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON format." }));
        }
    });
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
    const user = require('./authController').authenticate(req);
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

    const user = require('./authController').authenticate(req);
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

            const hasMatch = articles.some(a => {
                if (key === "search") {
                    return (
                        a.title.toLowerCase().includes(value) ||
                        a.content.toLowerCase().includes(value) ||
                        (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(value)))
                    );
                } else if (key === "tags" && Array.isArray(a.tags)) {
                    return a.tags.map(tag => tag.toLowerCase()).includes(value);
                } else {
                    return a[key]?.toString().toLowerCase() === value;
                }
            });

            if (!hasMatch) {
                res.writeHead(404, { "Content-Type": "application/json" });
                const errorMessages = {
                    category: `No articles found for this category: ${value}`,
                    status: `No articles found for this status: ${value}`,
                    tags: `No articles found for this tag: ${value}`,
                    search: `No articles match the search term: ${value}`
                };
                return res.end(JSON.stringify({ error: errorMessages[key] || "No matching articles found." }));
            }

            //  Validate filter keys
            if (!["search", "category", "status", "tags"].includes(key)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid filter key: ${key}` }));
            }

            if (key === "category" && !allowedCategories.map(c => c.toLowerCase()).includes(value)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid category: ${value}` }));
            }

            if (key === "status" && !allowedStatuses.map(s => s.toLowerCase()).includes(value)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid status: ${value}` }));
            }

            if (key === "tags" && !allowedTags.map(t => t.toLowerCase()).includes(value)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: `Invalid tag: ${value}` }));
            }


            if (key === "search") {
                articles = articles.filter(a =>
                    a.title.toLowerCase().includes(value) ||
                    a.content.toLowerCase().includes(value) ||
                    (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(value)))
                );
            } else {
                articles = articles.filter(a =>
                    a[key] && a[key].toString().toLowerCase().includes(value)
                );
            }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(articles));
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
    const id = parseInt(req.url.split("/")[3]);
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        const { user, text } = JSON.parse(body);

        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const article = data.find(a => a.id === id);

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        const comment = {
            id: Date.now(),
            user,
            text,
            date: new Date().toISOString(),
            replies: []
        };

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
    const parts = req.url.split("/");
    const articleId = parseInt(parts[3]);
    const commentId = parseInt(parts[5]);
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        const { user, text } = JSON.parse(body);

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
            user,
            text,
            date: new Date().toISOString()
        };

        comment.replies = comment.replies || [];
        comment.replies.push(reply);

        fs.writeFileSync(file, JSON.stringify(data, null, 2));

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply));
    });
}


// like/unlike a comment
function likeComment(req, res) {
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

    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message, comment }));
}

// like/unlike a reply
function likeReply(req, res) {
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

        if (isReply) {
            const reply = comment.replies.find(r => r.id === replyId);
            if (!reply) return res.writeHead(404).end(JSON.stringify({ message: "Reply not found" }));
            reply.text = text;
            reply.updatedAt = new Date().toISOString();
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply updated!", reply }));
        } else {
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





module.exports = { getArticles, createArticle, getArticleById, updateArticle, deleteArticle, filterArticles, likeArticle, postComment, getComments, unlikeArticle, replyComment , likeComment, likeReply, editCommentOrReply, deleteCommentOrReply};