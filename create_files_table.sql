-- Create files table for upload server
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,                    -- UUID
    bucket TEXT NOT NULL DEFAULT 'default', -- Bucket name (sanitized)
    original_name TEXT NOT NULL,            -- Original filename
    stored_name TEXT NOT NULL,              -- {uuid}{ext}
    size INTEGER NOT NULL,                  -- File size in bytes
    mime TEXT NOT NULL,                     -- MIME type
    sha256 TEXT,                            -- SHA256 hash (optional)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploader_ip TEXT,                       -- IP address of uploader
    user_id INTEGER,                        -- Reference to users table (optional)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_files_bucket ON files(bucket);
CREATE INDEX IF NOT EXISTS idx_files_original_name ON files(original_name);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- Add user_id column to files table if it doesn't exist
-- (for backward compatibility with existing data)