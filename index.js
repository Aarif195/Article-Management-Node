const http = require('http');
const fs = require("fs");
const PORT = process.env.PORT || 8000;

// file path
const file = "articles.json";

if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
}

const server = http.createServer((req, res) => {

    // First GET
    if (req.url === "/api/articles" && req.method === "GET") {
        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Error reading file" }));
            }

            const articles = JSON.parse(data);
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(articles));
        });
    }

    // POST
    else if (req.url === "/api/articles" && req.method === "POST") {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            try {
                const newArticle = JSON.parse(body);
                const data = fs.readFileSync(file, "utf8");
                const articles = JSON.parse(data);

                newArticle.id = articles.length ? articles[articles.length - 1].id + 1 : 1;

                newArticle.likes = 0;
                newArticle.comments = newArticle.comments || [];

                // Push new article and save
                articles.push(newArticle);
                fs.writeFileSync(file, JSON.stringify(articles, null, 2));

                res.writeHead(201, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Article created successfully", article: newArticle }));
            } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON or request format" }));
            }
        });
    }


    // GET article by ID
    if (req.url.startsWith("/api/articles/") && req.method === "GET") {
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
    else if (req.url.startsWith("/api/articles/") && req.method === "PUT") {
        const id = parseInt(req.url.split("/")[3]);
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            const updatedData = JSON.parse(body);

            const data = fs.readFileSync(file, "utf8");
            const articles = JSON.parse(data);

            // Find index of article
            const index = articles.findIndex(article => article.id === id);

            if (index === -1) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Article not found" }));
                return;
            }

            const updatedArticle = { ...articles[index], ...updatedData };
            articles[index] = updatedArticle;

            fs.writeFileSync(file, JSON.stringify(articles, null, 2));

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(updatedArticle));
        });
    }

    // delete
    else if (req.url.startsWith("/api/articles/") && req.method === "DELETE") {
        const id = parseInt(req.url.split("/").pop());
        const data = fs.readFileSync(file, "utf8");
        let articles = JSON.parse(data);

        const index = articles.findIndex((a) => a.id === id);
        if (index === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        const deleted = articles.splice(index, 1);

        fs.writeFileSync(file, JSON.stringify(articles, null, 2));

        res.writeHead(204, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article deleted", deleted }));
    }

    // filtering
    else if (req.url.startsWith("/api/articles") && req.method === "GET" && req.url !== "/api/articles") {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filters = Object.fromEntries(url.searchParams.entries());

        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Error reading file" }));
            }

            let articles = JSON.parse(data);

            // Apply filters dynamically
            for (const key in filters) {
                const value = filters[key].toLowerCase();

                // search should check title, content, and tags
                if (key === "search") {
                    articles = articles.filter(a =>
                        a.title.toLowerCase().includes(value) ||
                        a.content.toLowerCase().includes(value) ||
                        (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(value)))
                    );
                }
                // otherwise, match by property (e.g., category, status, author, etc.)
                else {
                    articles = articles.filter(a =>
                        a[key] && a[key].toString().toLowerCase().includes(value)
                    );
                }
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(articles));
        });
    }

    // like
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/like") && req.method === "POST") {
        console.log(req.url.split("/"));

        const id = parseInt(req.url.split("/")[3]);
        const data = fs.readFileSync(file, "utf8");
        const articles = JSON.parse(data);

        const index = articles.findIndex((a) => a.id === id);
        if (index === -1) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Article not found" }));
        }

        articles[index].likes += 1;

        fs.writeFileSync(file, JSON.stringify(articles, null, 2));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article liked!", article: articles[index] }));
    }


    // post comment
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/comments") && req.method === "POST") {
        const id = parseInt(req.url.split("/")[3]);
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            const { user, text } = JSON.parse(body);
            console.log(user, text);


            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            const article = data.find(a => a.id === id);

            if (!article) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Article not found" }));
            }

            const comment = {
                user,
                text,
                date: new Date().toISOString()
            };

            article.comments.push(comment);
            fs.writeFileSync(file, JSON.stringify(data, null, 2));

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify(comment));
        });
    }

    // get comment
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/comments") && req.method === "GET") {
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


    //  Unlike an article
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/unlike") && req.method === "POST") {
        const id = parseInt(req.url.split("/")[3]);

        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const article = data.find(a => a.id === id);

        if (!article) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Article not found" }));
            return;
        }

        if (article.likes > 0) {
            article.likes -= 1;
        }

        fs.writeFileSync(file, JSON.stringify(data, null, 2));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article unliked successfully", likes: article.likes }));
    }

})


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} `);
});