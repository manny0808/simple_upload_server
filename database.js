const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'users.db');

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
        this.init();
    }

    init() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                user_folder TEXT,
                storage_quota_mb INTEGER DEFAULT 100,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create default admin user if none exists
        this.getUserByUsername('admin', (err, user) => {
            if (!user) {
                this.createUser('admin', 'manni', 'admin', () => {
                    console.log('✓ Default admin user created: admin/manni');
                });
            }
        });
    }

    createUser(username, password, role = 'user', storageQuotaMB = 100, callback) {
        // First check if username already exists
        this.getUserByUsername(username, (err, existingUser) => {
            if (err) return callback(err);
            
            if (existingUser) {
                return callback(new Error(`Username '${username}' already exists`));
            }
            
            // Username is available, proceed with creation
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return callback(err);
                
                // User folder is exactly the username
                const userFolder = username;
                
                const sql = `INSERT INTO users (username, password_hash, role, user_folder, storage_quota_mb) VALUES (?, ?, ?, ?, ?)`;
                this.db.run(sql, [username, hash, role, userFolder, storageQuotaMB], function(err) {
                    if (err) return callback(err);
                    
                    // Create the user's directory
                    const fs = require('fs');
                    const path = require('path');
                    const userDir = path.join(__dirname, 'uploads', userFolder);
                    
                    try {
                        if (!fs.existsSync(userDir)) {
                            fs.mkdirSync(userDir, { recursive: true });
                            console.log(`✓ Created user directory: ${userDir}`);
                        }
                    } catch (dirErr) {
                        console.error(`Error creating user directory: ${dirErr.message}`);
                        // Continue anyway - directory will be created on first login
                    }
                    
                    callback(null, { 
                        id: this.lastID, 
                        username, 
                        role, 
                        user_folder: userFolder,
                        storage_quota_mb: storageQuotaMB 
                    });
                });
            });
        });
    }

    getUserByUsername(username, callback) {
        const sql = `SELECT * FROM users WHERE username = ?`;
        this.db.get(sql, [username], callback);
    }

    getUserById(id, callback) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        this.db.get(sql, [id], callback);
    }

    getAllUsers(callback) {
        const sql = `SELECT id, username, role, user_folder, storage_quota_mb, created_at FROM users ORDER BY id`;
        this.db.all(sql, [], callback);
    }

    updateUserQuota(userId, quotaMB, callback) {
        const sql = `UPDATE users SET storage_quota_mb = ? WHERE id = ?`;
        this.db.run(sql, [quotaMB, userId], callback);
    }

    deleteUser(id, callback) {
        // First get user info to find their folder
        this.getUserById(id, (err, user) => {
            if (err) return callback(err);
            
            const sql = `DELETE FROM users WHERE id = ?`;
            this.db.run(sql, [id], (err) => {
                if (err) return callback(err);
                
                // Delete user's upload directory if it exists
                if (user && user.user_folder) {
                    const fs = require('fs');
                    const path = require('path');
                    const userDir = path.join(__dirname, 'uploads', user.user_folder);
                    
                    try {
                        if (fs.existsSync(userDir)) {
                            // Remove all files in the directory first
                            const files = fs.readdirSync(userDir);
                            files.forEach(file => {
                                const filePath = path.join(userDir, file);
                                fs.unlinkSync(filePath);
                            });
                            // Remove the directory itself
                            fs.rmdirSync(userDir);
                            console.log(`✓ Deleted user directory: ${userDir}`);
                        }
                    } catch (dirErr) {
                        console.error(`Error deleting user directory: ${dirErr.message}`);
                        // Continue anyway - user is deleted from DB
                    }
                }
                
                callback(null);
            });
        });
    }

    updatePassword(id, newPassword, callback) {
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) return callback(err);
            
            const sql = `UPDATE users SET password_hash = ? WHERE id = ?`;
            this.db.run(sql, [hash, id], callback);
        });
    }

    verifyPassword(username, password, callback) {
        this.getUserByUsername(username, (err, user) => {
            if (err) return callback(err);
            if (!user) return callback(null, false);
            
            bcrypt.compare(password, user.password_hash, (err, match) => {
                if (err) return callback(err);
                callback(null, match ? user : false);
            });
        });
    }
}

module.exports = new Database();