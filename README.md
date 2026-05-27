# Notes App

A sleek, modern notes-taking application built with **FastAPI** (backend) and vanilla **HTML/CSS/JavaScript** (frontend), backed by **PostgreSQL**.

## Features

- **Categories & Sub-Categories** — Organize notes hierarchically
- **Rich Note Fields** — Title, text, priority (Low/Medium/High), tags, color labels, archived flag
- **Auto Date** — Current date is pre-filled when creating a note
- **Full CRUD** — Create, read, update, and archive/delete notes
- **Search & Filter** — Filter by category, sub-category, priority, archived status, or full-text search
- **Dark / Light Theme** — Toggle with Sun/Moon icon, persisted in localStorage
- **Responsive** — Works on desktop and mobile
- **Structured Data** - Uses SQL Database to stored data. PostGreSQL is used in current implementation.  

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Backend  | Python 3.11+, FastAPI, SQLAlchemy,          |
| Frontend | HTML5, CSS3 (custom properties), vanilla JS |
| Database | PostgreSQL                                  |

## Additional Note Fields (suggested)

| Field         | Type    | Description                                |
| ------------- | ------- | ------------------------------------------ |
| `title`       | string  | Descriptive title for quick identification |
| `priority`    | enum    | `low`, `medium`, `high`                    |
| `is_archived` | boolean | Archive instead of delete                  |
| `tags`        | string  | Comma-separated tags for organization      |
| `color`       | string  | Hex color for visual categorization        |

## Getting Started

### 1. Prerequisites

- Python 3.11+
- PostgreSQL running locally

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

## Project Structure

```
notes_app/
├── main.py              # FastAPI application & routes
├── database.py          # SQLAlchemy engine & session
├── models.py            # ORM models (Category, SubCategory, Note)
├── schemas.py           # Pydantic request/response schemas
├── requirements.txt
├── README.md
├── templates/
│   └── index.html       # Single-page application UI
└── static/
    ├── style.css        # Theme-aware styles
    ├── script.js    # Frontend logic
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

## License

MIT
