const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOAD_BASE_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 100;
const MAX_FILES_PER_UPLOAD = parseInt(process.env.MAX_FILES_PER_UPLOAD) || 10;

// Ensure base upload directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
    fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

// Get user's upload directory (username-based)
function getUserUploadDir(username) {
    return path.join(UPLOAD_BASE_DIR, username);
}

// Create user directory if it doesn't exist
function ensureUserDirectory(username) {
    const userDir = getUserUploadDir(username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
}

// Format file size helper
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'upload-server-secret-fixed-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Configure multer for file uploads (dynamic destination based on user)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (req.session.username) {
            const userDir = ensureUserDirectory(req.session.username);
            cb(null, userDir);
        } else {
            cb(new Error('User not authenticated'));
        }
    },
    filename: (req, file, cb) => {
        // Keep original filename (overwrites if exists)
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
        files: MAX_FILES_PER_UPLOAD
    }
});

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
        
        // Create user directory if it doesn't exist
        ensureUserDirectory(user.username);
        
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
        
        // Create user directory
        ensureUserDirectory(username);
        
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
    
    // Get user info first to delete directory
    db.getUserById(id, (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Delete user directory if it exists
        const userDir = getUserUploadDir(user.username);
        if (fs.existsSync(userDir)) {
            // Delete all files in directory
            const files = fs.readdirSync(userDir);
            files.forEach(file => {
                const filePath = path.join(userDir, file);
                fs.unlinkSync(filePath);
            });
            // Delete directory
            fs.rmdirSync(userDir);
        }
        
        // Delete user from database
        db.deleteUser(id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
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

// ========== MAIN APP ROUTES ==========

// Main app (requires login)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload UI (requires login)
app.get('/upload-ui', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload-ui.html'));
});

// Browse files (requires login)
app.get('/files', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'files.html'));
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
    const userDir = getUserUploadDir(req.session.username);
    
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

// Get user storage usage (for admin)
app.get('/api/users/:id/usage', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    
    // Get user info first
    db.getUserById(id, (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        // Calculate size of files in user's directory
        const userDir = getUserUploadDir(user.username);
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

// Get current user storage usage (for user dashboard)
app.get('/api/me/usage', requireAuth, (req, res) => {
    const userId = req.session.userId;
    
    // Get user info first
    db.getUserById(userId, (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        // Calculate size of files in user's directory
        const userDir = getUserUploadDir(user.username);
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

// Download file
app.get('/download/:filename', requireAuth, (req, res) => {
    const userDir = getUserUploadDir(req.session.username);
    const filePath = path.join(userDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    res.download(filePath);
});

// Delete file
app.delete('/api/files/:filename', requireAuth, (req, res) => {
    const userDir = getUserUploadDir(req.session.username);
    const filePath = path.join(userDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete file' });
        res.json({ success: true });
    });
});

// ========== SIMPLE UPLOAD ENDPOINT ==========

// Upload endpoint (POST /upload) - Simple version
app.post('/upload', requireAuth, upload.array('files', MAX_FILES_PER_UPLOAD), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = [];
    let totalSize = 0;
    
    req.files.forEach(file => {
        uploadedFiles.push({
            originalname: file.originalname,
            filename: file.originalname,
            size: file.size
        });
        totalSize += file.size;
    });
    
    // Get user info for quota check
    db.getUserById(req.session.userId, (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userDir = getUserUploadDir(user.username);
        const quotaBytes = user.storage_quota_mb * 1024 * 1024;
        
        // Calculate current usage in user's directory
        let currentUsage = 0;
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            files.forEach(file => {
                const filePath = path.join(userDir, file);
                const stats = fs.statSync(filePath);
                currentUsage += stats.size;
            });
        }
        
        // Check quota
        if (currentUsage + totalSize > quotaBytes) {
            const available = quotaBytes - currentUsage;
            return res.status(400).json({ 
                error: `Quota exceeded. You have ${formatFileSize(available)} available, need ${formatFileSize(totalSize)}` 
            });
        }
        
        const newUsage = currentUsage + totalSize;
        const usagePercentage = quotaBytes > 0 ? Math.min(100, (newUsage / quotaBytes) * 100) : 0;
        
        res.json({
            success: true,
            files: uploadedFiles,
            total_size: totalSize,
            file_count: uploadedFiles.length,
            storage_used: newUsage,
            storage_quota: quotaBytes,
            usage_percentage: usagePercentage
        });
    });
});

// ========== HEALTH ENDPOINT ==========

// Health endpoint (GET /health)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'upload-server',
        version: '1.0.0'
    });
});

// Static files (served after routes, before error handler)
app.use(express.static('public'));

// Error handling for file uploads
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
                error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB` 
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                error: `Too many files. Maximum is ${MAX_FILES_PER_UPLOAD} files per upload` 
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ 
                error: 'Unexpected file field. Use "file" field for uploads' 
            });
        }
        return res.status(400).json({ error: 'Upload error: ' + err.message });
    }
    
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 File Upload Server running on port ${PORT}`);
    console.log(`📁 Upload base directory: ${UPLOAD_BASE_DIR}`);
    console.log(`👤 User directories: ${UPLOAD_BASE_DIR}/<username>/`);
    console.log(`🔐 Login: http://[IP]:${PORT}/login`);
    console.log(`👤 Default admin: admin/manni`);
    console.log(`📤 Upload endpoint: POST /upload`);
    console.log(`📥 Download endpoint: GET /download/:filename`);
    console.log(`📋 File list: GET /api/files (user-specific)`);
    console.log(`❤️  Health check: GET /health`);
});