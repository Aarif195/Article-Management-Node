# Article Management Node
Article Management Node is a simple Blog API built entirely with Node.js core modules, without using any external frameworks or databases.
It allows users to create, read, update, and delete blog articles stored locally in a JSON file.
This project demonstrates strong understanding of HTTP server handling, file system operations (fs), JSON manipulation, and routing logic — all built manually using Node.js core.

# Features
Create, Read, Update, and Delete (CRUD) articles
Filter articles by category, status, or tags
Search articles by title, content, or tags
Like and Unlike articles
Add and view comments with user details and timestamps
Works entirely with Node.js core modules (no frameworks)
Testable via Postman or Thunder Client


# API Endpoints
Below are the example endpoint structures used in this project:
Create an Article
POST /api/articles

Get Single Article
GET /api/articles/:id

Update an Article
PUT /api/articles/:id
Update an existing article.

Delete an Article
DELETE /api/articles/:id

Like an Article
POST /api/articles/:id/like

Unlike an Article
DELETE /api/articles/:id/like

Add a Comment
POST /api/articles/:id/comments

# Testing the API

All routes can be tested using:
Thunder Client (VS Code extension)
Postman

# Concepts Demonstrated
Core HTTP server creation using Node.js
Routing without frameworks
Working with JSON files as a mock database
File reading/writing using fs
Parsing URL and query parameters
Handling different HTTP methods (GET, POST, PUT, DELETE)


# Conclusion
This project provides a strong foundation for understanding backend fundamentals using pure Node.js.
It’s a great starting point before progressing to frameworks like Express.js or integrating real databases like MongoDB.




# URL for published documentation
https://documenter.getpostman.com/view/44452359/2sB3WsPzqa