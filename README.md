# Modern File Upload Server

A secure, modern file upload server with drag & drop interface, user management, and isolated user folders.

## Features

- ✅ **Modern UI** - Dark theme with green accents, responsive design
- ✅ **Drag & Drop** - HTML5 file upload with progress bars
- ✅ **User Management** - Admin panel for creating/managing users
- ✅ **Password Security** - bcrypt hashing, password change functionality
- ✅ **File Isolation** - Each user gets their own folder
- ✅ **Session-based Auth** - Secure login/logout
- ✅ **Admin Panel** - Full user management interface
- ✅ **Systemd Service** - Auto-start on boot

## Quick Start

### 1. Installation
```bash
# Clone repository
git clone https://github.com/manny0808/modern-file-upload-server.git
cd modern-file-upload-server

# Install dependencies
npm install

# Create uploads directory
mkdir -p uploads
```

### 2. Configuration
```bash
# Copy systemd service file
sudo cp systemd/modern-file-upload.service /etc/systemd/system/

# Edit service file if needed
sudo nano /etc/systemd/system/modern-file-upload.service
```

### 3. Start Server
```bash
# Start service
sudo systemctl start modern-file-upload.service

# Enable auto-start
sudo systemctl enable modern-file-upload.service

# Check status
sudo systemctl status modern-file-upload.service
```

## Default Credentials

On first run, a default admin user is created:
- **Username:** `admin`
- **Password:** `manni`

**⚠️ Security Note:** Change the password immediately after first login!

## Access URLs

- **Login:** `http://your-server:8080/login`
- **Main App:** `http://your-server:8080/`
- **Admin Panel:** `http://your-server:8080/admin` (admin role required)

## User Management

### Admin Features
1. **Create Users** - Add new users with role (admin/user)
2. **Delete Users** - Remove users (cannot delete yourself)
3. **View All Users** - See all registered users
4. **Change Passwords** - Reset user passwords

### User Features
1. **Change Own Password** - Self-service password change
2. **File Upload** - Drag & drop interface
3. **File Management** - View, download, delete files
4. **Isolated Storage** - Each user has private folder

## File Structure

```
/opt/uploadserver/
├── server.js              # Main server file
├── database.js           # SQLite database wrapper
├── package.json          # Dependencies
├── uploads/              # Base upload directory
│   ├── user_123_admin/   # Admin user folder
│   └── user_456_user1/   # Regular user folder
├── public/               # Static files (CSS, JS)
├── views/                # HTML templates
│   ├── login.html       # Login page
│   └── admin.html       # Admin panel
└── users.db             # SQLite database
```

## Security Features

- **bcrypt Password Hashing** - Secure password storage
- **Session Management** - Express-session with cookies
- **User Isolation** - Files separated by user
- **Role-based Access** - Admin vs user permissions
- **Input Validation** - Server-side validation
- **XSS Protection** - Built-in Express security

## API Endpoints

### Authentication
- `POST /login` - User login
- `GET /logout` - User logout
- `GET /api/me` - Get current user info
- `POST /api/change-password` - Change own password

### File Management
- `GET /api/files` - List user's files
- `POST /api/upload` - Upload file
- `GET /download/:filename` - Download file
- `DELETE /api/files/:filename` - Delete file

### Admin (admin role required)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `DELETE /api/users/:id` - Delete user
- `PUT /api/users/:id/password` - Reset user password

## System Requirements

- **Node.js:** 14.x or higher
- **npm:** 6.x or higher
- **SQLite3:** Built-in (no separate installation)
- **Storage:** Depends on upload needs
- **Memory:** 50MB+ for basic operation

## Deployment

### Manual Deployment
```bash
# 1. Install Node.js
sudo apt update
sudo apt install nodejs npm

# 2. Clone and setup
sudo mkdir -p /opt/uploadserver
sudo chown -R $USER:$USER /opt/uploadserver
cd /opt/uploadserver
git clone https://github.com/manny0808/modern-file-upload-server.git .

# 3. Install and start
npm install
sudo systemctl start modern-file-upload.service
```

### Docker (Coming Soon)
```bash
docker run -p 8080:8080 -v ./uploads:/app/uploads manny0808/upload-server
```

## Troubleshooting

### Server won't start
```bash
# Check logs
sudo journalctl -u modern-file-upload.service -f

# Check port 8080
sudo netstat -tulpn | grep :8080
```

### Login issues
1. Check if users.db exists
2. Verify database schema
3. Check bcrypt compatibility

### File upload issues
1. Verify uploads directory permissions
2. Check disk space
3. Verify file size limits

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and feature requests, please use the GitHub Issues page.