const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = path.join(__dirname, "../users.json");

function readUsers() {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data);
}

function writeUsers(users) {
    fs.writeFileSync(file, JSON.stringify(users, null, 2));
}

// Helper to hash password (simple, not real bcrypt)
function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

// REGISTER USER
function register(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        const { username, email, password } = JSON.parse(body);
        if (!username || !email || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "All fields are required" }));
        }

        const users = readUsers();
        const exists = users.find(u => u.email === email);
        if (exists) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Email already exists" }));
        }

        const newUser = {
            id: users.length ? users[users.length - 1].id + 1 : 1,
            username,
            email,
            password: hashPassword(password),
        };

        users.push(newUser);
        writeUsers(users);

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "User registered successfully" }));
    });
}



function authenticate(req) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return null; 

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;

    const token = parts[1];

    // Load users
    const users = JSON.parse(fs.readFileSync(file, "utf8"));
    const user = users.find(u => u.token === token);

    return user || null; 
}


// LOGIN USER
function login(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        const { email, password } = JSON.parse(body);
        const users = readUsers();

        const user = users.find(
            u => u.email === email && u.password === hashPassword(password)
        );

        if (!user) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid credentials" }));
        }

        // Generate a new token for current login
        const token = crypto.randomBytes(24).toString("hex");

        // Overwrite all other users' tokens
        users.forEach(u => {
            u.token = u.id === user.id ? token : null;
        });

        // Save users back to file
        writeUsers(users);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            message: "Login successful",
            token,
            user: { id: user.id, username: user.username, email: user.email }
        }));
    });
}




// DELETE USER
function deleteUser(req, res) {
    // Authenticate user first
    const user = authenticate(req);
    if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Unauthorized" }));
    }

    // Get user ID from URL
    const id = parseInt(req.url.split("/")[3]);

    const users = readUsers();
    const index = users.findIndex(u => u.id === id);

    if (index === -1) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "User not found" }));
    }

    
    if (users[index].id !== user.id) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Forbidden: You can only delete your own account" }));
    }

    const deletedUser = users.splice(index, 1);
    writeUsers(users);

    res.writeHead(204, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "User deleted successfully", deletedUser }));
}

// Test@1234

module.exports = { register, login, deleteUser, authenticate };
