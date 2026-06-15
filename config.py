import os

# Set postgresql database URL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/notes_app",
)

# Location to store uploaded files
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# Location for storing the DB backups
BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")
