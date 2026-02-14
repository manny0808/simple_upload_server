const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = 8080;
const UPLOAD_BASE_DIR = path.join(__dirname, 'uploads');

// Ensure base upload directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
    fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

// Get user's upload directory
function getUserUploadDir(userId, userFolder) {
    if (!userFolder) {
        return path.join(UPLOAD_BASE_DIR, `user_${userId}`);
    }
    return path.join(UPLOAD_BASE_DIR, userFolder);
}

// Session middleware
app.use(session({
    secret: 'upload-server-secret-' + Date.now(),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Check if user is logged in
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Check if user is admin
function requireAdmin(req, res, next) {
    if (req.session.role === 'admin') {
        next();
    } else {
        res.status(403).send('Access denied. Admin only.');
    }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = getUserUploadDir(req.session.userId, req.session.userFolder);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ========== LOGIN/LOGOUT ROUTES ==========

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Login POST
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    db.verifyPassword(username, password, (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        req.session.userFolder = user.user_folder;
        
        // Create user directory if it doesn't exist
        const userDir = getUserUploadDir(user.id, user.user_folder);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        
        res.json({ success: true, role: user.role });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ========== ADMIN ROUTES ==========

// Admin panel
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Change password page
app.get('/change-password', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'change-password.html'));
});

// Get all users (API)
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
    db.getAllUsers((err, users) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(users);
    });
});

// Create user
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { username, password, role, storage_quota_mb = 100 } = req.body;
    
    db.createUser(username, password, role, storage_quota_mb, (err, user) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true, user });
    });
});

// Delete user
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    
    // Prevent deleting yourself
    if (id === req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    db.deleteUser(id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update user password
app.put('/api/users/:id/password', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { password } = req.body;
    
    db.updatePassword(id, password, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update user quota
app.put('/api/users/:id/quota', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { storage_quota_mb } = req.body;
    
    if (!storage_quota_mb || storage_quota_mb < 1) {
        return res.status(400).json({ error: 'Valid quota required (min 1MB)' });
    }
    
    db.updateUserQuota(id, storage_quota_mb, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ========== FILE MANAGEMENT ROUTES ==========

// Main app (requires login)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get current user info
app.get('/api/me', requireAuth, (req, res) => {
    res.json({
        username: req.session.username,
        role: req.session.role,
        userId: req.session.userId
    });
});

// Change own password
app.post('/api/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    
    // Verify current password
    db.verifyPassword(req.session.username, currentPassword, (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Update password
        db.updatePassword(req.session.userId, newPassword, (err) => {
            if (err) return res.status(500).json({ error: 'Failed to update password' });
            res.json({ success: true });
        });
    });
});

// Get files for current user
app.get('/api/files', requireAuth, (req, res) => {
    const userDir = getUserUploadDir(req.session.userId, req.session.userFolder);
    
    if (!fs.existsSync(userDir)) {
        return res.json([]);
    }
    
    fs.readdir(userDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read directory' });
        
        const fileList = files.map(file => {
            const filePath = path.join(userDir, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                modified: stats.mtime,
                url: `/download/${file}`
            };
        }).sort((a, b) => b.modified - a.modified);
        
        res.json(fileList);
    });
});

// Get user storage usage
app.get('/api/users/:id/usage', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    
    // Get user info first
    db.getUserById(id, (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        const userDir = getUserUploadDir(user.id, user.user_folder);
        let totalSize = 0;
        
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            files.forEach(file => {
                const filePath = path.join(userDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });
        }
        
        res.json({
            user_id: user.id,
            username: user.username,
            storage_used_bytes: totalSize,
            storage_used_formatted: formatFileSize(totalSize),
            storage_quota_bytes: user.storage_quota_mb * 1024 * 1024,
            storage_quota_formatted: `${user.storage_quota_mb} MB`,
            usage_percentage: user.storage_quota_mb > 0 ? 
                Math.min(100, (totalSize / (user.storage_quota_mb * 1024 * 1024)) * 100) : 0
        });
    });
});

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload file with quota check - supports single and multiple files
app.post('/api/upload', requireAuth, (req, res, next) => {
    // Use array for multiple files, but check quota first
    const uploadHandler = upload.array('file');
    
    uploadHandler(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: 'Upload failed: ' + err.message });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        // Check quota before accepting files
        const userDir = getUserUploadDir(req.session.userId, req.session.userFolder);
        let currentUsage = 0;
        
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            files.forEach(file => {
                const filePath = path.join(userDir, file);
                const stats = fs.statSync(filePath);
                currentUsage += stats.size;
            });
        }
        
        // Get user quota
        db.getUserById(req.session.userId, (err, user) => {
            if (err || !user) {
                // Clean up uploaded files
                req.files.forEach(file => fs.unlinkSync(file.path));
                return res.status(500).json({ error: 'Failed to check quota' });
            }
            
            const quotaBytes = user.storage_quota_mb * 1024 * 1024;
            const totalNewSize = req.files.reduce((sum, file) => sum + file.size, 0);
            const newTotal = currentUsage + totalNewSize;
            
            if (newTotal > quotaBytes) {
                // Delete all uploaded files since they exceed quota
                req.files.forEach(file => fs.unlinkSync(file.path));
                return res.status(400).json({ 
                    error: `Storage quota exceeded. You have ${formatFileSize(currentUsage)} of ${user.storage_quota_mb}MB used. Files would exceed quota by ${formatFileSize(newTotal - quotaBytes)}.`
                });
            }
            
            res.json({ 
                success: true, 
                files: req.files.map(file => ({
                    originalname: file.originalname,
                    filename: file.filename,
                    size: file.size,
                    mimetype: file.mimetype
                })),
                total_size: totalNewSize,
                file_count: req.files.length,
                storage_used: newTotal,
                storage_quota: quotaBytes,
                usage_percentage: Math.min(100, (newTotal / quotaBytes) * 100)
            });
        });
    });
});

// Download file
app.get('/download/:filename', requireAuth, (req, res) => {
    const userDir = getUserUploadDir(req.session.userId, req.session.userFolder);
    const filePath = path.join(userDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    res.download(filePath);
});

// Delete file
app.delete('/api/files/:filename', requireAuth, (req, res) => {
    const userDir = getUserUploadDir(req.session.userId, req.session.userFolder);
    const filePath = path.join(userDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete file' });
        res.json({ success: true });
    });
});

// Static files (after auth check in routes)
app.use(express.static('public'));

// Start server
app.listen(PORT, () => {
    console.log(`🚀 File Upload Server running on port ${PORT}`);
    console.log(`📁 Upload base directory: ${UPLOAD_BASE_DIR}`);
    console.log(`🔐 Login: http://[IP]:${PORT}/login`);
    console.log(`👤 Default admin: admin/manni`);
});