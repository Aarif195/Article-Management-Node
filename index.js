const http = require('http');
const fs = require("fs");
const PORT = 8000;

// file path
const file = "articles.json";

if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]");
}

const server = http.createServer((req, res) => {

    if (req.url === "/articles" && req.method === "GET") {
        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Error reading file" }));
            }

            const articles = JSON.parse(data);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(articles));
        });
    }

    // POST
    else if (req.url === "/articles" && req.method === "POST") {
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

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Article deleted", deleted }));
    }

    // filtering
    else if (req.url.startsWith("/api/articles") && req.method === "GET") {
        const url = new URL(req.url, `http://${req.headers.host}`);
        // console.log(
        //     url
        // );

        const category = url.searchParams.get("category");
        const tag = url.searchParams.get("tags");
        const status = url.searchParams.get("status");
        const search = url.searchParams.get("search");

        const data = fs.readFileSync(file, "utf8");
        let articles = JSON.parse(data);

        if (category) {
            articles = articles.filter(
                (a) => a.category.toLowerCase() === category.toLowerCase()
            );
        }
        if (tag) {
            articles = articles.filter(
                (a) => a.tags && a.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
            );
        }
        if (status) {
            articles = articles.filter(
                (a) => a.status.toLowerCase() === status.toLowerCase()
            );
        }

        if (search) {
            const keyword = search.toLowerCase();
            articles = articles.filter((a) =>
                a.title.toLowerCase().includes(keyword) ||
                a.content.toLowerCase().includes(keyword) ||
                (Array.isArray(a.tags) && a.tags.some(tag => tag.toLowerCase().includes(keyword)))
            );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(articles, null, 2));
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