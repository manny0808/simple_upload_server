# Simple Upload Server

A minimal but robust file upload server with Web UI and REST API. Supports both session-based authentication (web) and Bearer token authentication (API).

## Features

- ✅ **Web UI**: Drag & drop upload, progress tracking, file management
- ✅ **REST API**: Standardized endpoints for programmatic access
- ✅ **Dual Auth**: Session (web) + Bearer Token (API)
- ✅ **File Management**: Upload, list, download, delete
- ✅ **Security**: File type validation, size limits, path traversal protection
- ✅ **Storage**: SQLite for metadata + filesystem for files
- ✅ **User Management**: Multi-user with roles (admin/user) and quotas

## Quick Start

### 1. Installation
```bash
# Clone repository
git clone <your-repo>
cd simple_upload_server

# Install dependencies
npm install

# Configure (copy and edit .env)
cp .env.example .env
# Edit .env with your settings
```

### 2. Start Server
```bash
# Development
npm start

# Production (with PM2)
npm install -g pm2
pm2 start server.js --name upload-server
```

### 3. Access Web UI
- Open: `http://localhost:8080`
- Default admin: `admin` / `manni`

## API Reference

### Authentication
- **Web UI**: Session-based (login form)
- **API**: Bearer Token (`Authorization: Bearer <TOKEN>`)

### Endpoints

#### 1. Upload Files
```bash
POST /upload
Content-Type: multipart/form-data
Authorization: Bearer <TOKEN>

# Parameters:
# - files: File(s) to upload (array)
# - bucket: Optional bucket name (default: "default")
# - calculate_hash: "true" to compute SHA256 (optional)

# Response:
{
  "uploaded": [
    {
      "id": "uuid",
      "original_name": "file.pdf",
      "stored_name": "uuid.pdf",
      "size": 12345,
      "mime": "application/pdf",
      "sha256": "abc123...",
      "bucket": "default",
      "download_url": "/files/uuid"
    }
  ]
}
```

#### 2. List Files
```bash
GET /files
Authorization: Bearer <TOKEN>

# Query parameters:
# - page: Page number (default: 1)
# - limit: Items per page (max: 200, default: 50)
# - q: Search in filename
# - bucket: Filter by bucket
# - from/to: Date range (ISO format)

# Response:
{
  "page": 1,
  "limit": 50,
  "total": 123,
  "items": [
    {
      "id": "uuid",
      "original_name": "file.pdf",
      "size": 12345,
      "mime": "application/pdf",
      "bucket": "default",
      "created_at": "2026-02-14T10:00:00Z"
    }
  ]
}
```

#### 3. Download File
```bash
GET /files/{id}
# Auth optional (configurable via REQUIRE_AUTH_FOR_DOWNLOAD)

# Response: File binary with headers:
# - Content-Disposition: attachment; filename="original_name"
# - Content-Type: mime_type
```

#### 4. Delete File
```bash
DELETE /files/{id}
Authorization: Bearer <TOKEN>

# Response: 204 No Content
```

#### 5. Health Check
```bash
GET /health

# Response:
{
  "status": "ok",
  "timestamp": "2026-02-14T10:00:00Z",
  "service": "upload-server",
  "version": "1.0.0"
}
```

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |
| `UPLOAD_DIR` | ./uploads | Base upload directory |
| `DB_PATH` | ./users.db | SQLite database path |
| `AUTH_TOKEN` | (required) | Bearer token for API auth |
| `SESSION_SECRET` | (required) | Secret for session encryption |
| `MAX_FILE_SIZE_MB` | 100 | Maximum file size in MB |
| `MAX_FILES_PER_UPLOAD` | 10 | Maximum files per request |
| `ALLOWED_EXTENSIONS` | (all) | Comma-separated list of allowed extensions |
| `REQUIRE_AUTH_FOR_DOWNLOAD` | true | Require auth for downloads |
| `ENABLE_DELETE` | true | Enable delete functionality |

## Example Usage

### Upload with curl
```bash
# Single file
curl -X POST http://localhost:8080/upload \
  -H "Authorization: Bearer your-token" \
  -F "files=@/path/to/file.pdf"

# Multiple files
curl -X POST http://localhost:8080/upload \
  -H "Authorization: Bearer your-token" \
  -F "files=@file1.pdf" \
  -F "files=@file2.jpg"

# With bucket and hash calculation
curl -X POST http://localhost:8080/upload \
  -H "Authorization: Bearer your-token" \
  -F "files=@file.pdf" \
  -F "bucket=documents" \
  -F "calculate_hash=true"
```

### List files
```bash
curl -X GET "http://localhost:8080/files?page=1&limit=10&bucket=documents" \
  -H "Authorization: Bearer your-token"
```

### Download file
```bash
curl -X GET http://localhost:8080/files/{uuid} \
  -H "Authorization: Bearer your-token" \
  -o downloaded_file.pdf
```

## File Storage Structure

```
uploads/
├── default/           # Default bucket
│   ├── uuid1.pdf     # Stored with UUID filename
│   └── uuid2.jpg
├── documents/        # Custom bucket
│   └── uuid3.docx
└── images/          # Another bucket
    └── uuid4.png
```

## Database Schema

### `users` table
- `id` INTEGER PRIMARY KEY
- `username` TEXT UNIQUE
- `password_hash` TEXT
- `role` TEXT (admin/user)
- `user_folder` TEXT
- `storage_quota_mb` INTEGER
- `created_at` DATETIME

### `files` table
- `id` TEXT PRIMARY KEY (UUID)
- `bucket` TEXT
- `original_name` TEXT
- `stored_name` TEXT ({uuid}{ext})
- `size` INTEGER
- `mime` TEXT
- `sha256` TEXT (optional)
- `created_at` DATETIME
- `uploader_ip` TEXT
- `user_id` INTEGER (foreign key to users)

## Security Features

1. **Path Traversal Protection**: Never trust user-provided paths
2. **File Type Validation**: Optional extension/MIME whitelist
3. **Size Limits**: Configurable per-file and per-request limits
4. **Authentication**: Dual auth system (session + token)
5. **Input Sanitization**: Bucket name validation (a-zA-Z0-9-_)
6. **Error Handling**: Clean error responses without sensitive info

## Development

```bash
# Install dependencies
npm install

# Run tests (if available)
npm test

# Run with nodemon for development
npm run dev

# Check code style
npm run lint
```

## License

MIT