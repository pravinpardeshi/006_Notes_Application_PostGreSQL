# Notes Application

A sleek, modern notes-taking application built with **FastAPI** (backend) and vanilla **HTML/CSS/JavaScript** (frontend), backed by **PostgreSQL**.

Create and store notes with images, organize with categories and sub-categories, search through your notes, and keep your data safe with automated daily backups.

## Features

- **Categories & Sub-Categories** — Organize notes hierarchically
- **Rich Note Fields** — Title, text, priority (Low/Medium/High), tags, color labels, images, archived flag
- **Image Attachments** — Upload multiple images per note, with drag-and-drop support, thumbnail previews, and click-to-enlarge lightbox
- **Full CRUD** — Create, read, update, and archive/delete notes
- **Search & Filter** — Filter by category, sub-category, priority, archived status, or full-text search on title + body + tags
- **Dark / Light Theme** — Toggle with Sun/Moon icon, persisted in `localStorage`
- **Backup & Restore** — Manual download/restore from sidebar; supports both `.sql` and `.zip` (includes images) formats
- **Automated Daily Backups** — Runs on server start and hourly thereafter; renames existing backup to today's date if data hasn't changed (no duplicate bloat)
- **System Health Check** — Sidebar button shows live status of application, database, and timestamp
- **Responsive** — Works on desktop and mobile
- **Collapsible Sidebar** — Pin/unpin sidebar for more workspace; main content animates smoothly

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Backend  | Python 3.11+, FastAPI, SQLAlchemy           |
| Frontend | HTML5, CSS3 (custom properties), Vanilla JS |
| Database | PostgreSQL                                  |
| OS       | Linux (tested), macOS, WSL                  |

## Getting Started

### 1. Prerequisites

- Python 3.11+
- PostgreSQL running locally
- `pg_dump` and `psql` installed (for backup/restore)

### 2. Create the database

```bash
createdb notes_app
```

### 3. Configure the connection

Set the `DATABASE_URL` environment variable (defaults to `postgresql://postgres:postgres@localhost:5432/notes_app`):

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/notes_app"
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Run the application

```bash
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### 6. API documentation

FastAPI auto-generates interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs).

## Backup & Restore

Both features are accessible from the **Manage Data** section in the sidebar.

### Manual Backup

Click **Take Backup** to download a `.zip` file containing:
- `notes_backup.sql` — full PostgreSQL dump (`pg_dump --clean --if-exists`)
- `uploads/` — all attached images

### Restore

Click **Restore** and select a `.sql` or `.zip` backup file. The file is uploaded, and data is restored via `psql`. Zip archives are automatically extracted — images are copied back into the `uploads/` directory.

The restore process:
1. Truncates all tables with `CASCADE`
2. Disables foreign-key checks (`session_replication_role = replica`)
3. Applies the SQL (pre-processed to make `CREATE TYPE`/`TABLE`/`SEQUENCE`/`INDEX`/`FUNCTION`/`TRIGGER`/`CONSTRAINT` idempotent)
4. Re-enables constraints
5. Syncs `SERIAL` sequences

> **Warning:** Restoring overwrites existing data. There is no undo.

### Automated Daily Backup

On server start, a background thread creates a daily backup in `backups/` and checks every hour. The naming is smart:

- **Data unchanged** → renames the most recent backup to today's date (single file, no duplicates)
- **Data changed** → creates a new backup

Backups are stored as:
```
backups/
├── backup_2026-06-04.zip
├── backup_2026-06-04.zip.meta   # change-detection hash
```

### Health Check

Click **Health Check** in the sidebar to see the current status of:
- Application (always healthy if reachable)
- Database (`SELECT 1` connectivity check)
- Timestamp (24-hour local time)

## Project Structure

```
notes_app/
├── main.py              # FastAPI application, routes, backup & restore
├── database.py          # SQLAlchemy engine & session
├── models.py            # ORM models (Category, SubCategory, Note, NoteImage)
├── schemas.py           # Pydantic request/response schemas
├── requirements.txt
├── README.md
├── uploads/             # User-uploaded images (auto-created)
├── backups/             # Automated daily backups (auto-created)
├── templates/
│   └── index.html       # Single-page application UI
└── static/
    ├── style.css        # Theme-aware styles
    ├── script.js        # Frontend logic
    └── favicon.ico
```

## Database Schema

### categories
| Column      | Type         |
| ----------- | ------------ |
| id          | PK           |
| name        | varchar(100) |
| description | text         |
| created_at  | timestamp    |

### sub_categories
| Column      | Type            |
| ----------- | --------------- |
| id          | PK              |
| name        | varchar(100)    |
| description | text            |
| category_id | FK → categories |
| created_at  | timestamp       |

### notes
| Column          | Type                |
| --------------- | ------------------- |
| id              | PK                  |
| title           | varchar(200)        |
| note_text       | text                |
| priority        | enum                |
| is_archived     | boolean             |
| tags            | varchar(500)        |
| color           | varchar(7)          |
| category_id     | FK → categories     |
| sub_category_id | FK → sub_categories |
| note_date       | date                |
| created_at      | timestamp           |
| updated_at      | timestamp           |

### note_images
| Column     | Type            |
| ---------- | --------------- |
| id         | PK              |
| note_id    | FK → notes      |
| filename   | varchar(255)    |
| filepath   | varchar(512)    |
| created_at | timestamp       |

## Image Attachments

Images can be uploaded when creating or editing a note:

1. Open the note modal (click **+ New Note** or the edit icon on any note)
2. In the **Images** section, click the upload area or drag-and-drop image files
3. Thumbnails appear immediately in the grid
4. Click **Save** — the note is created/updated and all images are uploaded
5. Click any thumbnail to open a full-size lightbox preview
6. Click the **×** on a thumbnail to remove an image

Images are stored on disk in the `uploads/` directory and served via `/uploads/`.

## API Endpoints

| Method | Path                                   | Description                 |
| ------ | -------------------------------------- | --------------------------- |
| GET    | `/`                                    | SPA entry point             |
| GET    | `/health`                              | System health check         |
| GET    | `/api/notes`                           | List notes (with filters)   |
| POST   | `/api/notes`                           | Create a note               |
| GET    | `/api/notes/{id}`                      | Get a single note           |
| PUT    | `/api/notes/{id}`                      | Update a note               |
| DELETE | `/api/notes/{id}`                      | Delete a note               |
| GET    | `/api/notes/{id}/images`               | List images for a note      |
| POST   | `/api/notes/{id}/images`               | Upload images (multipart)   |
| DELETE | `/api/notes/{id}/images/{image_id}`    | Delete a single image       |
| GET    | `/api/backup`                          | Download full backup (.zip) |
| POST   | `/api/restore`                         | Restore backup (.sql/.zip)  |
| GET    | `/api/categories`                      | List categories             |
| POST   | `/api/categories`                      | Create category             |
| DELETE | `/api/categories/{id}`                 | Delete category             |
| GET    | `/api/sub_categories`                  | List sub-categories         |
| POST   | `/api/sub_categories`                  | Create sub-category         |
| DELETE | `/api/sub_categories/{id}`             | Delete sub-category         |

## Additional Note Fields

| Field         | Type    | Description                                |
| ------------- | ------- | ------------------------------------------ |
| `title`       | string  | Descriptive title for quick identification |
| `priority`    | enum    | `low`, `medium`, `high`                    |
| `is_archived` | boolean | Archive instead of delete                  |
| `tags`        | string  | Comma-separated tags for organization      |
| `color`       | string  | Hex color for visual categorization        |
| `images`      | array   | Attached image files (uploaded via modal)  |

## License

MIT
