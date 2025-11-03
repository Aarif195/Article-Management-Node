const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = path.join(__dirname, "../users.json");

// Helper to read users
function readUsers() {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data);
}

// Helper to write users
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

// authenticate
function authenticate(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  const token = parts[1];
  const users = readUsers();
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

        // Simple token (just an example)
        const token = crypto.randomBytes(24).toString("hex");

        // Save token to user
        user.token = token;
        writeUsers(users);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            message: "Login successful",
            token,
            user: { id: user.id, username: user.username, email: user.email }
        }));
    });
}



// Delete user by ID
//  const deleteUser = (req, res) => {
//   const { id } = req.params;

//   try {
//     const users = JSON.parse(fs.readFileSync(file, "utf8"));

//     const userIndex = users.findIndex((u) => u.id == id);
//     if (userIndex === -1) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     users.splice(userIndex, 1);

//     fs.writeFileSync(file, JSON.stringify(users, null, 2));

//     res.status(200).json({ message: `User with ID ${id} deleted successfully.` });
//   } catch (error) {
//     res.status(500).json({ message: "Error deleting user", error: error.message });
//   }
// };


module.exports = { register, login, authenticate };
