import os


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/notes_app",
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")
