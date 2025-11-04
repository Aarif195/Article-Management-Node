const http = require('http');
// const fs = require("fs");
const PORT = process.env.PORT || 8000;
const { getArticles, createArticle, getArticleById, updateArticle, deleteArticle, filterArticles, likeArticle, postComment, getComments, unlikeArticle, replyComment, likeComment } = require('./controllers/articleController');

const { register, login } = require("./controllers/authController");



const server = http.createServer((req, res) => {

    // Register
    if (req.url === "/api/register" && req.method === "POST") {
        return register(req, res);
    }

    // Login
    else if (req.url === "/api/login" && req.method === "POST") {
        return login(req, res);
    }


    

        // like/unlike a comment
     if (
        req.url.startsWith("/api/articles/") &&
        req.url.includes("/comments/") &&
        req.url.endsWith("/like") &&
        req.method === "POST"
    ) {
        return likeComment(req, res);
    }

    // GET
   else if (req.url === "/api/articles" && req.method === "GET") {
        return getArticles(req, res);

    }

    // POST
    else if (req.url === "/api/articles" && req.method === "POST") {
        return createArticle(req, res);

    }

    // GET article by ID
    if (req.url.startsWith("/api/articles/") && req.method === "GET") {
        console.log("Get by id called");

        return getArticleById(req, res);

    }

    // update
    else if (req.url.startsWith("/api/articles/") && req.method === "PUT") {
        console.log("Update by id called");
        return updateArticle(req, res);
    }

    // delete
    else if (req.url.startsWith("/api/articles/") && req.method === "DELETE") {
        return deleteArticle(req, res);
    }

    // filtering
    else if (req.url.startsWith("/api/articles") && req.method === "GET" && req.url !== "/api/articles") {
        return filterArticles(req, res);

    }



    // like
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/like") && req.method === "POST") {
        console.log(req.url.split("/"));
        return likeArticle(req, res);
    }

    // post comment
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/comments") && req.method === "POST") {
        return postComment(req, res);
    }

    // get comment
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/comments") && req.method === "GET") {
        return getComments(req, rea)
    }

    // reply to a comment
    else if (req.url.startsWith("/api/articles/") && req.url.includes("/comment/") && req.url.endsWith("/reply") && req.method === "POST") {
        return replyComment(req, res);
    }


   


    //  Unlike an article
    else if (req.url.startsWith("/api/articles/") && req.url.endsWith("/unlike") && req.method === "POST") {
        return unlikeArticle(req, res)
    }


    // Delete user
    else if (req.url.startsWith("/api/users/") && req.method === "DELETE") {
        return require('./controllers/authController').deleteUser(req, res);
    }


})




server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} `);
});