const url = require("url");
const fs = require("fs");
const path = require("path");
// const authController = require('./articleController');
const { pool } = require("../db"); //  PostgreSQL pool from db.js
const authController = require("./authController");
const { authenticate } = require("./authController");


//  create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// helper for sending validation errors
function sendError(res, msg) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
}

function generateFileName(originalName) {
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    return `${base}-${timestamp}${ext}`;
}


// Allowed categories, tags, and status
const allowedCategories = ["Programming", "Technology", "Design", "Web Developement"];
const allowedStatuses = ["draft", "published", "achieve"];
const allowedTags = ["api", "node", "frontend", "backend"];



// CREATE ARTICLES
async function createArticle(req, res) {
    // Authenticate user first
    const user = await authController.authenticate(req);
    console.log("Creating article for user:", user.username);


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
    req.on("end", async () => {
        try {
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
            if (!title?.trim()) return sendError(res, "Title is required.");
            if (!content?.trim()) return sendError(res, "Content is required.");
            if (!category?.trim()) return sendError(res, "Category is required.");
            if (!allowedCategories.includes(category)) return sendError(res, "Invalid category provided.");
            if (!status?.trim()) return sendError(res, "Status is required.");
            if (!allowedStatuses.includes(status)) return sendError(res, "Invalid status provided.");
            if (!tags || tags.length === 0) return sendError(res, "At least one tag is required.");
            if (!tags.every(tag => allowedTags.includes(tag))) return sendError(res, "Invalid tag(s) provided.");
            if (!imagePath) return sendError(res, "Image upload is required.");

            // === Save new article in PostgreSQL ===
            const result = await pool.query(
                `INSERT INTO articles 
                (title, content, author, category, status, tags, image, likes, comments, created_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,0,'[]',NOW(),NOW())
                RETURNING *`,
                [title, content, user.username, category, status, tags, imagePath]
            );

            const newArticle = result.rows[0];

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Article created successfully", article: newArticle }));

        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Server error" }));
        }
    });
}


// GET ALL ARTICLES
async function getArticles(req, res) {
    try {
        const fullUrl = new URL(req.url, `http://${req.headers.host}`);
        const page = Math.max(1, parseInt(fullUrl.searchParams.get("page")) || 1);
        const limit = Math.max(1, parseInt(fullUrl.searchParams.get("limit")) || 10);
        const offset = (page - 1) * limit;

        const filters = Object.fromEntries(fullUrl.searchParams.entries());

        // Validate filters
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

        // Build SQL query
        let query = `SELECT * FROM articles`;
        const values = [];
        const conditions = [];

        if (filters.search) {
            values.push(`%${filters.search}%`);
            conditions.push(`(LOWER(title) LIKE $${values.length} OR LOWER(content) LIKE $${values.length})`);
        }
        if (filters.category) {
            values.push(filters.category);
            conditions.push(`LOWER(category) = LOWER($${values.length})`);
        }
        if (filters.status) {
            values.push(filters.status);
            conditions.push(`LOWER(status) = LOWER($${values.length})`);
        }
        if (filters.tags) {
            values.push(filters.tags);
            conditions.push(`$${values.length} = ANY(tags)`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(" AND ");
        }

        // Total count for pagination
        const countResult = await pool.query(query.replace("*", "COUNT(*) AS total"), values);
        const totalData = parseInt(countResult.rows[0].total, 10);
        const totalPages = totalData === 0 ? 0 : Math.ceil(totalData / limit);

        // Apply sorting, limit, and offset
        query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        const dataSlice = result.rows;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            totalData,
            totalPages,
            currentPage: page,
            limit,
            data: dataSlice
        }));
    } catch (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
}

// GET article by ID
async function getArticleById(req, res) {
    const id = parseInt(req.url.split("/")[3]);

    try {
        const result = await pool.query("SELECT * FROM articles WHERE id = $1", [id]);
        const article = result.rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(article));
    } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
}

// update Article
async function updateArticle(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3]);
    let body = "";

    req.on("data", chunk => (body += chunk));

    req.on("end", async () => {
        let updatedData;
        try {
            updatedData = JSON.parse(body);
        } catch {
            return sendError(res, "Invalid JSON data");
        }

        // VALIDATION
        if (updatedData.title !== undefined) {
            if (!updatedData.title.trim()) return sendError(res, "Title cannot be empty.");
        }

        if (updatedData.content !== undefined) {
            if (!updatedData.content.trim()) return sendError(res, "Content cannot be empty.");
        }

        if (updatedData.category !== undefined) {
            if (!updatedData.category.trim()) return sendError(res, "Category cannot be empty.");
            if (!allowedCategories.includes(updatedData.category)) {
                return sendError(res, "Invalid category.");
            }
        }

        if (updatedData.status !== undefined) {
            if (!updatedData.status.trim()) return sendError(res, "Status cannot be empty.");
            if (!allowedStatuses.includes(updatedData.status)) {
                return sendError(res, "Invalid status.");
            }
        }

        if (updatedData.tags !== undefined) {
            if (!Array.isArray(updatedData.tags) || updatedData.tags.length === 0) {
                return sendError(res, "Tags must be a non-empty array.");
            }
            if (!updatedData.tags.every(t => allowedTags.includes(t))) {
                return sendError(res, "Invalid tag(s).");
            }
        }

        try {
            // Check if article exists and belongs to user
            const result = await pool.query(
                "SELECT * FROM articles WHERE id = $1",
                [id]
            );

            if (result.rows.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Article not found" }));
            }

            const article = result.rows[0];

            if (article.author !== user.username) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Forbidden: You can only update your own articles" }));
            }

            const fields = [];
            const values = [];
            let i = 1;

            for (const key in updatedData) {
                fields.push(`${key} = $${i}`);
                values.push(updatedData[key]);
                i++;
            }

            values.push(id);
            const updateSql = `
                UPDATE articles
                SET ${fields.join(", ")}, updated_at = NOW()
                WHERE id = $${i}
                RETURNING *
            `;

            const updated = await pool.query(updateSql, values);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                message: "Update successfully",
                article: updated.rows[0]
            }));

        } catch (err) {
            console.log(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
        }
    });
}

// DELTE ARTICLE
async function deleteArticle(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/").pop());

    try {
        // Check if the article exists
        const { rows } = await pool.query("SELECT * FROM articles WHERE id = $1", [id]);
        const article = rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        // Verify author
        if (article.author !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Forbidden: You can only delete your own articles" }));
        }

        // Delete the article
        const deleted = await pool.query("DELETE FROM articles WHERE id = $1 RETURNING *", [id]);

        res.writeHead(204, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article deleted", deleted: deleted.rows[0] }));
    } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error", details: err.message }));
    }
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
async function likeArticle(req, res) {
    const user = await authController.authenticate(req);


    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3], 10);

    try {
        // fetch article row
        const q = await pool.query("SELECT * FROM articles WHERE id = $1", [id]);
        const article = q.rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        //  author checking
        if (String(article.author) !== String(user.username)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "You are not allowed to like this article" }));
        }

        // Determine current liked state:
        const hasLikedColumn = Object.prototype.hasOwnProperty.call(article, "liked");
        const currentLiked = hasLikedColumn ? Boolean(article.liked) : false;

        // Toggle exactly as your JSON logic
        let newLikes = Number(article.likes || 0);
        let newLiked = currentLiked;
        let message;

        if (currentLiked) {
            // currently liked -> unlike
            newLikes = Math.max(newLikes - 1, 0);
            newLiked = false;
            message = "Article unliked!";
        } else {
            // currently not liked -> like
            newLikes = newLikes + 1;
            newLiked = true;
            message = "Article liked!";
        }

        // Update DB: update likes always; update liked only if column exists.
        let updated;
        if (hasLikedColumn) {
            updated = await pool.query(
                "UPDATE articles SET likes = $1, liked = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
                [newLikes, newLiked, id]
            );
        } else {
            updated = await pool.query(
                "UPDATE articles SET likes = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [newLikes, id]
            );
        }
        console.log({ tokenUser: user.username, articleAuthor: article.author, articleLikes: article.likes, articleLiked: article.liked });

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message, article: updated.rows[0] }));
    } catch (err) {
        console.error("likeArticle error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Internal server error" }));
    }
}

// add comment
async function postComment(req, res) {
    const user = await authController.authenticate(req);
    console.log(user);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3]);
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        const { text } = JSON.parse(body);

        if (!text || text.trim() === "") {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment text is required" }));
        }

        try {
            // Get article from PostgreSQL
            const { rows } = await pool.query("SELECT * FROM articles WHERE id = $1", [id]);
            const article = rows[0];


            if (!article) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Article not found" }));
            }


            // PRIVATE: Only article author can have comments added
            const articleAuthor = (article.author || "").trim().toLowerCase();
            const tokenUser = (user.username || "").trim().toLowerCase();

            if (articleAuthor !== tokenUser) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "You can only comment on your own article" }));
            }


            const newComment = {
                id: Date.now(),
                user: user.username,
                text,
                date: new Date().toISOString(),
                replies: []
            };

            const updatedComments = article.comments ? [...article.comments, newComment] : [newComment];

            await pool.query(
                "UPDATE articles SET comments = $1 WHERE id = $2 RETURNING *",
                [JSON.stringify(updatedComments), id]
            );

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify(newComment));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
        }
    });
}

// get comments
async function getComments(req, res) {
    const user = authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const id = parseInt(req.url.split("/")[3]);

    try {
        const { rows } = await pool.query("SELECT author, comments FROM articles WHERE id = $1", [id]);
        const article = rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }
        
      
        if (article.author !== user.username) {
             res.writeHead(403, { "Content-Type": "application/json" });
             return res.end(JSON.stringify({ message: "Forbidden: Access to comments is restricted to the article's author." }));
        }

      
        const userComments = (article.comments || []).filter(c => c.user === user.username);
        
        
        if (userComments.length === 0) {
           
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Forbidden: You have not made any comments on this article." }));
        }

        // 5. Success: Return only the authenticated user's comments.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(userComments)); 
        
    } catch (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
}

// reply comment
async function replyComment(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const parts = req.url.split("/");
    const articleId = parseInt(parts[3]);
    const commentId = parseInt(parts[5]);

    let body = "";
    req.on("data", chunk => body += chunk.toString());

    req.on("end", async () => {
        const { text } = JSON.parse(body);

        if (!text || text.trim() === "") {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply text is required" }));
        }

        try {
            // Fetch article from Postgres
            const articleResult = await pool.query(
                `SELECT * FROM articles WHERE id = $1`,
                [articleId]
            );
            const article = articleResult.rows[0];

            if (!article) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Article not found" }));
            }

            // STRICT PRIVATE: only article owner can act
            if (article.author !== user.username) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Forbidden: Only the article owner can perform this action" }));
            }

            // Parse comments JSONB
            const comments = article.comments || [];
            const commentIndex = comments.findIndex(c => c.id === commentId);

            if (commentIndex === -1) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Comment not found" }));
            }

            // Create reply
            const reply = {
                id: Date.now(),
                user: user.username,
                text,
                date: new Date().toISOString()
            };

            comments[commentIndex].replies = comments[commentIndex].replies || [];
            comments[commentIndex].replies.push(reply);

            // Update article in Postgres
            await pool.query(
                `UPDATE articles SET comments = $1 WHERE id = $2`,
                [JSON.stringify(comments), articleId]
            );

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify(reply));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Server error" }));
        }
    });
}

// like/unlike a comment
async function likeComment(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);

    try {
        // Fetch article
        const articleResult = await pool.query(
            `SELECT * FROM articles WHERE id = $1`,
            [articleId]
        );
        const article = articleResult.rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        // STRICT PRIVATE: only article owner can like/unlike
        if (article.author !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Forbidden: Only the article owner can like/unlike comments" }));
        }

        // Parse comments JSONB
        const comments = article.comments || [];
        const commentIndex = comments.findIndex(c => c.id === commentId);

        if (commentIndex === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment not found" }));
        }

        // Toggle like/unlike
        if (typeof comments[commentIndex].liked === "undefined") comments[commentIndex].liked = false;

        let message;
        if (comments[commentIndex].liked) {
            comments[commentIndex].liked = false;
            message = "Comment unliked!";
        } else {
            comments[commentIndex].liked = true;
            message = "Comment liked!";
        }

        // Update article in Postgres
        await pool.query(
            `UPDATE articles SET comments = $1 WHERE id = $2`,
            [JSON.stringify(comments), articleId]
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message, comment: comments[commentIndex] }));
    } catch (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Server error" }));
    }
}

// like/unlike a reply
async function likeReply(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    const urlParts = req.url.split("/");
    const articleId = parseInt(urlParts[3]);
    const commentId = parseInt(urlParts[5]);
    const replyId = parseInt(urlParts[7]);

    try {
        // Fetch article
        const articleResult = await pool.query(
            `SELECT * FROM articles WHERE id = $1`,
            [articleId]
        );
        const article = articleResult.rows[0];

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        // STRICT PRIVATE: only article owner can act
        if (article.author !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Forbidden: Only the article owner can like/unlike replies" }));
        }

        // Parse comments JSONB
        const comments = article.comments || [];
        const commentIndex = comments.findIndex(c => c.id === commentId);

        if (commentIndex === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Comment not found" }));
        }

        const replies = comments[commentIndex].replies || [];
        const replyIndex = replies.findIndex(r => r.id === replyId);

        if (replyIndex === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply not found" }));
        }

        // Toggle like/unlike
        if (typeof replies[replyIndex].liked === "undefined") replies[replyIndex].liked = false;

        let message;
        if (replies[replyIndex].liked) {
            replies[replyIndex].liked = false;
            message = "Reply unliked!";
        } else {
            replies[replyIndex].liked = true;
            message = "Reply liked!";
        }

        // Update the reply back into comments
        comments[commentIndex].replies = replies;

        // Update article in Postgres
        await pool.query(
            `UPDATE articles SET comments = $1 WHERE id = $2`,
            [JSON.stringify(comments), articleId]
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message, reply: replies[replyIndex] }));
    } catch (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Server error" }));
    }
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

        else {
            if (comment.user !== user.username) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "You are not allowed to edit this comment" }));
            }

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

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const article = data.find(a => a.id === articleId);
    if (!article) return res.writeHead(404).end(JSON.stringify({ message: "Article not found" }));

    const comment = article.comments.find(c => c.id === commentId);
    if (!comment) return res.writeHead(404).end(JSON.stringify({ message: "Comment not found" }));

    if (isReply) {
        const replyIndex = comment.replies.findIndex(r => r.id === replyId);

        if (replyIndex === -1) return res.writeHead(404).end(JSON.stringify({ message: "Reply not found" }));

        const reply = comment.replies.find(r => r.id === replyId);
        if (!reply) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Reply not found" }));
        }

        if (reply.user !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "You are not allowed to delete this reply" }));
        }

        comment.replies.splice(replyIndex, 1);

        fs.writeFileSync(file, JSON.stringify(data, null, 2));

        res.writeHead(204, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Reply deleted!" }));
    } else {
        if (comment.user !== user.username) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "You are not allowed to delete this comment" }));
        }

        const commentIndex = article.comments.findIndex(c => c.id === commentId);
        article.comments.splice(commentIndex, 1);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        res.writeHead(204, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Comment deleted!" }));
    }
}

//  Get articles created by the logged-in user
async function getMyArticles(req, res) {
    const user = await authController.authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    try {
        const fullUrl = new URL(req.url, `http://${req.headers.host}`);
        const page = Math.max(1, parseInt(fullUrl.searchParams.get("page")) || 1);
        const limit = Math.max(1, parseInt(fullUrl.searchParams.get("limit")) || 10);

        // Filters
        const filters = Object.fromEntries(fullUrl.searchParams.entries());
        const values = [user.username];
        let filterQuery = "WHERE author = $1";

        for (const key in filters) {
            const value = filters[key].toLowerCase();
            if (key === "category" && allowedCategories.map(c => c.toLowerCase()).includes(value)) {
                values.push(value);
                filterQuery += ` AND LOWER(category) = $${values.length}`;
            } else if (key === "status" && allowedStatuses.map(s => s.toLowerCase()).includes(value)) {
                values.push(value);
                filterQuery += ` AND LOWER(status) = $${values.length}`;
            } else if (key === "tags" && allowedTags.map(t => t.toLowerCase()).includes(value)) {
                values.push(`%${value}%`);
                filterQuery += ` AND tags::text ILIKE $${values.length}`;
            } else if (key === "search") {
                values.push(`%${value}%`, `%${value}%`);
                filterQuery += ` AND (LOWER(title) ILIKE $${values.length - 1} OR LOWER(content) ILIKE $${values.length})`;
            }
        }

        // Count total articles
        const totalResult = await pool.query(`SELECT COUNT(*) FROM articles ${filterQuery}`, values);
        const totalData = parseInt(totalResult.rows[0].count);
        const totalPages = totalData === 0 ? 0 : Math.ceil(totalData / limit);

        // Pagination
        const offset = (page - 1) * limit;
        const articlesResult = await pool.query(
            `SELECT * FROM articles ${filterQuery} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            totalData,
            totalPages,
            currentPage: page,
            limit,
            data: articlesResult.rows
        }));
    } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
}


module.exports = { getArticles, createArticle, getArticleById, updateArticle, deleteArticle, filterArticles, likeArticle, postComment, getComments, replyComment, likeComment, likeReply, editCommentOrReply, deleteCommentOrReply, getMyArticles };