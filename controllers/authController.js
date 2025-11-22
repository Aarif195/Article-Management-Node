
const bcrypt = require("bcrypt");
const { pool } = require("../db"); //  PostgreSQL pool from db.js
const crypto = require("crypto");


// REGISTER 
async function register(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            const { username, email, password } = JSON.parse(body);

            // Basic validation
            if (!username || !email || !password) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "All fields are required" }));
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Invalid email format" }));
            }

            // Password strength validation
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
            if (!passwordRegex.test(password)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character"
                }));
            }

            // Unique email check
            const emailCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
            if (emailCheck.rows.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Email already exists" }));
            }

            // Unique username check
            const usernameCheck = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
            if (usernameCheck.rows.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Username already exists" }));
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            await pool.query(
                "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
                [username, email, hashedPassword]
            );

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "User registered successfully" }));

        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Server error" }));
        }
    });
}

// LOGIN 
async function login(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            const { email, password } = JSON.parse(body);

            // Validate required fields
            if (!email || !password) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Email and password are required" }));
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Invalid email format" }));
            }

            // Check if user exists
            const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
            const user = result.rows[0];

            if (!user) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Invalid credentials" }));
            }

            // Compare password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Invalid credentials" }));
            }

            // Generate a new token for current login
            const token = crypto.randomBytes(24).toString("hex");

            // Store token in the database (optional) or skip if you don't persist
            await pool.query("UPDATE users SET token = $1, updated_at = NOW() WHERE id = $2", [token, user.id]);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                message: "Login successful",
                token,
                user: { id: user.id, username: user.username, email: user.email }
            }));

        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Server error" }));
        }
    });
}

// AUTHENTICATION
async function authenticate(req) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return null;

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;

    const token = parts[1];

    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE token = $1",
            [token]
        );
        const user = result.rows[0];
        return user || null;
    } catch (err) {
        console.error("Authentication error:", err);
        return null;
    }
}




module.exports = { register, login, authenticate };
