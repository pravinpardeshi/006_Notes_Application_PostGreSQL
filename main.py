import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from datetime import date, datetime
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from config import BACKUP_DIR, DATABASE_URL, UPLOAD_DIR
from database import Base, engine, get_db, SessionLocal
from models import Category, Note, NoteImage, SubCategory
from schemas import (
    CategoryCreate,
    CategoryResponse,
    NoteCreate,
    NoteImageResponse,
    NoteResponse,
    NoteUpdate,
    SubCategoryCreate,
    SubCategoryResponse,
)

Base.metadata.create_all(bind=engine)

# Sync all SERIAL sequences to prevent duplicate-key errors after restore/manual inserts
with engine.connect() as conn:
    for tbl in ["categories", "sub_categories", "notes", "note_images"]:
        try:
            conn.execute(
                text(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), COALESCE(MAX(id), 1)) FROM {tbl}")
            )
        except Exception:
            pass
    # Add note_time column if missing (schema migration for existing databases)
    try:
        conn.execute(text("ALTER TABLE notes ADD COLUMN note_time VARCHAR(5)"))
    except Exception:
        pass
    conn.commit()

app = FastAPI(title="Notes App")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory="templates")

os.makedirs(BACKUP_DIR, exist_ok=True)


# ── Scheduled Daily Backup ────────────────────────────────────────────────────


def _compute_change_key() -> str:
    """Hash of latest timestamps and record counts to detect data changes."""
    db = SessionLocal()
    try:
        latest_updated = db.query(func.max(Note.updated_at)).scalar()
        note_count = db.query(func.count(Note.id)).scalar()
        image_count = db.query(func.count(NoteImage.id)).scalar()
        cat_count = db.query(func.count(Category.id)).scalar()
        return hashlib.sha256(
            f"{latest_updated}:{note_count}:{image_count}:{cat_count}".encode()
        ).hexdigest()
    finally:
        db.close()


def _create_backup_zip(path: str):
    """Run pg_dump and write a zip archive to *path*."""
    result = subprocess.run(
        ["pg_dump", "--no-owner", "--no-acl", "--clean", "--if-exists", f"--dbname={DATABASE_URL}"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr}")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("notes_backup.sql", result.stdout)
        if os.path.isdir(UPLOAD_DIR):
            for root, _dirs, files in os.walk(UPLOAD_DIR):
                for fn in files:
                    fp = os.path.join(root, fn)
                    zf.write(fp, os.path.join("uploads", fn))


def _last_backup_path() -> str | None:
    """Return the most recent backup_YYYY-MM-DD.zip path, or None."""
    entries = [f for f in os.listdir(BACKUP_DIR)
               if re.match(r"backup_\d{4}-\d{2}-\d{2}\.zip$", f)]
    if not entries:
        return None
    entries.sort(reverse=True)
    return os.path.join(BACKUP_DIR, entries[0])


def _read_meta(backup_path: str) -> dict | None:
    meta_path = backup_path + ".meta"
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            return json.load(f)
    return None


def _write_meta(backup_path: str, meta: dict):
    with open(backup_path + ".meta", "w") as f:
        json.dump(meta, f)


def run_scheduled_backup():
    """Create today's backup if needed; rename previous if data unchanged."""
    today = date.today().isoformat()
    today_path = os.path.join(BACKUP_DIR, f"backup_{today}.zip")
    if os.path.exists(today_path):
        return

    current_key = _compute_change_key()
    latest = _last_backup_path()

    if latest and os.path.exists(latest):
        meta = _read_meta(latest)
        if meta and meta.get("key") == current_key:
            os.rename(latest, today_path)
            os.rename(latest + ".meta", today_path + ".meta")
            return

    _create_backup_zip(today_path)
    _write_meta(today_path, {"key": current_key})


def _backup_loop():
    """Background loop: run immediately, then check every hour."""
    while True:
        try:
            run_scheduled_backup()
        except Exception as exc:
            print(f"[auto-backup] {exc}")
        time.sleep(3600)


threading.Thread(target=_backup_loop, daemon=True).start()


# ── Health Check ──────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    status = "healthy"
    db_status = "healthy"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "unhealthy"
        status = "unhealthy"
    return {
        "Status": status,
        "Application": "healthy",
        "Database": db_status,
        "Timestamp": datetime.now().strftime("%H:%M:%S"),
    }


# ── Pages ────────────────────────────────────────────────────────────────────


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse("static/favicon.ico")


# ── Backup ────────────────────────────────────────────────────────────────────


@app.get("/api/backup")
def backup():
    today = date.today().isoformat()
    result = subprocess.run(
        ["pg_dump", "--no-owner", "--no-acl", "--clean", "--if-exists", f"--dbname={DATABASE_URL}"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(500, f"pg_dump failed: {result.stderr}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("notes_backup.sql", result.stdout)
        if os.path.isdir(UPLOAD_DIR):
            for root, _dirs, files in os.walk(UPLOAD_DIR):
                for fn in files:
                    fp = os.path.join(root, fn)
                    zf.write(fp, os.path.join("uploads", fn))
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="notes_backup_{today}.zip"'},
    )


def _make_sql_idempotent(sql: str) -> str:
    """Pre-process SQL to prevent "already exists" errors on restore."""

    def _wrap_enum_safe(sql: str) -> str:
        lines = sql.split("\n")
        result = []
        in_do_block = 0
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            if re.match(r"DO\s+\$\$\s+BEGIN", stripped, re.IGNORECASE):
                in_do_block += 1
                result.append(line)
                i += 1
                continue
            if stripped == "END $$;" and in_do_block:
                in_do_block -= 1
                result.append(line)
                i += 1
                continue
            if not in_do_block and re.match(
                r"CREATE\s+TYPE\s+((?:public\.)?\w+)\s+AS\s+ENUM",
                stripped,
                re.IGNORECASE,
            ):
                type_lines = [line]
                j = i + 1
                if ";" not in line:
                    while j < len(lines) and ";" not in lines[j]:
                        type_lines.append(lines[j])
                        j += 1
                    if j < len(lines):
                        type_lines.append(lines[j])
                        j += 1
                full = " ".join(l.strip() for l in type_lines)
                m = re.match(
                    r"CREATE\s+TYPE\s+((?:public\.)?\w+)\s+AS\s+ENUM\s*\((.*)\)\s*;",
                    full,
                    re.IGNORECASE,
                )
                if m:
                    result.append("DO $$ BEGIN")
                    result.append(
                        f"    CREATE TYPE {m.group(1)} AS ENUM ({m.group(2)});"
                    )
                    result.append("EXCEPTION")
                    result.append("    WHEN duplicate_object THEN NULL;")
                    result.append("END $$;")
                    i = j
                    continue
            result.append(line)
            i += 1
        return "\n".join(result)

    sql = _wrap_enum_safe(sql)
    sql = re.sub(
        r'\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b',
        'CREATE OR REPLACE FUNCTION',
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(
        r'\bCREATE\s+TABLE\b(?!\s+IF\s+NOT\s+EXISTS)',
        'CREATE TABLE IF NOT EXISTS',
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(
        r'\bCREATE\s+SEQUENCE\b(?!\s+IF\s+NOT\s+EXISTS)',
        'CREATE SEQUENCE IF NOT EXISTS',
        sql,
        flags=re.IGNORECASE,
    )
    table_names = [
        m.group(1)
        for m in re.finditer(
            r'COPY\s+((?:public\.)?\w+)\s*(?:\([^)]*\))?\s+FROM\s+stdin;',
            sql,
            flags=re.IGNORECASE,
        )
    ]
    seen = set()
    truncate_stmt = ""
    for t in table_names:
        if t not in seen:
            truncate_stmt += f"TRUNCATE TABLE {t} CASCADE;\n"
            seen.add(t)
    sql = truncate_stmt + sql
    sql = re.sub(
        r'CREATE\s+TRIGGER\s+(\w+)\s+.*?\s+ON\s+((?:public\.)?\w+)',
        lambda m: f"DROP TRIGGER IF EXISTS {m.group(1)} ON {m.group(2)};\n{m.group(0)}",
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(
        r'ALTER\s+TABLE\s+(?:ONLY\s+)?((?:public\.)?\w+)\s+ADD\s+CONSTRAINT\s+(\w+)',
        lambda m: f"ALTER TABLE {m.group(1)} DROP CONSTRAINT IF EXISTS {m.group(2)} CASCADE;\n{m.group(0)}",
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(
        r'\bCREATE\s+INDEX\b(?!\s+IF\s+NOT\s+EXISTS)',
        'CREATE INDEX IF NOT EXISTS',
        sql,
        flags=re.IGNORECASE,
    )
    sql = (
        "SET session_replication_role = replica;\n\n"
        + sql
        + "\n\nSET session_replication_role = default;"
    )
    return sql


@app.post("/api/restore")
def restore(file: UploadFile = File(...)):
    name = file.filename or ""
    if not (name.endswith(".sql") or name.endswith(".zip")):
        raise HTTPException(400, "Only .sql or .zip files are accepted")
    try:
        data = file.file.read()
    except Exception as e:
        raise HTTPException(400, f"Failed to read file: {e}")

    restore_dir = tempfile.mkdtemp()
    sql_path = None
    try:
        if name.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                zf.extractall(restore_dir)
            for fn in os.listdir(restore_dir):
                if fn.endswith(".sql"):
                    sql_path = os.path.join(restore_dir, fn)
                    break
            if not sql_path:
                raise HTTPException(400, "No .sql file found in zip archive")
            raw_sql = open(sql_path, encoding="utf-8").read()
        else:
            raw_sql = data.decode("utf-8")

        safe_sql = _make_sql_idempotent(raw_sql)
        tmp_sql = tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8")
        try:
            tmp_sql.write(safe_sql)
            tmp_sql.close()
            result = subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "--dbname", DATABASE_URL, "--file", tmp_sql.name, "--echo-errors"],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                raise HTTPException(500, f"Restore failed: {result.stderr[:500]}")
        finally:
            try:
                os.unlink(tmp_sql.name)
            except Exception:
                pass

        uploads_src = os.path.join(restore_dir, "uploads")
        if os.path.isdir(uploads_src):
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            for fn in os.listdir(uploads_src):
                src = os.path.join(uploads_src, fn)
                if os.path.isfile(src):
                    shutil.copy2(src, os.path.join(UPLOAD_DIR, fn))

        return {"message": "Restore successful"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Restore failed: {str(e)}")
    finally:
        try:
            shutil.rmtree(restore_dir, ignore_errors=True)
        except Exception:
            pass


# ── Category CRUD ────────────────────────────────────────────────────────────

@app.get("/api/categories", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name).all()


@app.post("/api/categories", response_model=CategoryResponse, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == payload.name).first()
    if existing:
        raise HTTPException(409, "Category already exists")
    cat = Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    db.delete(cat)
    db.commit()


# ── SubCategory CRUD ─────────────────────────────────────────────────────────

@app.get("/api/sub_categories", response_model=List[SubCategoryResponse])
def list_sub_categories(
    category_id: Optional[int] = Query(None), db: Session = Depends(get_db)
):
    q = db.query(SubCategory)
    if category_id is not None:
        q = q.filter(SubCategory.category_id == category_id)
    return q.order_by(SubCategory.name).all()


@app.post("/api/sub_categories", response_model=SubCategoryResponse, status_code=201)
def create_sub_category(payload: SubCategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == payload.category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    sub = SubCategory(**payload.model_dump())
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@app.delete("/api/sub_categories/{sub_category_id}", status_code=204)
def delete_sub_category(sub_category_id: int, db: Session = Depends(get_db)):
    sub = db.query(SubCategory).filter(SubCategory.id == sub_category_id).first()
    if not sub:
        raise HTTPException(404, "SubCategory not found")
    db.delete(sub)
    db.commit()


# ── Note CRUD ────────────────────────────────────────────────────────────────

@app.get("/api/notes", response_model=List[NoteResponse])
def list_notes(
    archived: Optional[bool] = Query(False),
    category_id: Optional[int] = Query(None),
    sub_category_id: Optional[int] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Note)
    if not archived:
        q = q.filter(Note.is_archived == False)
    if category_id is not None:
        q = q.filter(Note.category_id == category_id)
    if sub_category_id is not None:
        q = q.filter(Note.sub_category_id == sub_category_id)
    if priority:
        q = q.filter(Note.priority == priority)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            Note.title.ilike(pattern) | Note.note_text.ilike(pattern) | Note.tags.ilike(pattern)
        )
    return q.order_by(Note.created_at.desc()).all()


@app.post("/api/notes", response_model=NoteResponse, status_code=201)
def create_note(payload: NoteCreate, db: Session = Depends(get_db)):
    note = Note(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@app.get("/api/notes/{note_id}", response_model=NoteResponse)
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    return note


@app.put("/api/notes/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    _cleanup_note_images(note.images)
    db.delete(note)
    db.commit()


def _cleanup_note_images(images: list[NoteImage]):
    for img in images:
        try:
            if os.path.exists(img.filepath):
                os.remove(img.filepath)
        except Exception:
            pass


def _image_url(img: NoteImage) -> str:
    return f"/uploads/{os.path.basename(img.filepath)}"


# ── Note Image CRUD ──────────────────────────────────────────────────────────


@app.get("/api/notes/{note_id}/images", response_model=List[NoteImageResponse])
def list_note_images(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    return [
        NoteImageResponse(
            id=img.id,
            note_id=img.note_id,
            filename=img.filename,
            url=_image_url(img),
            created_at=img.created_at,
        )
        for img in note.images
    ]


@app.post("/api/notes/{note_id}/images", response_model=List[NoteImageResponse], status_code=201)
def upload_note_images(
    note_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")

    saved = []
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(400, f"File '{file.filename}' is not an image")

        ts = datetime.now().strftime("%Y%m%d%H%M%S%f")
        safe_name = f"{ts}_{file.filename}"
        filepath = os.path.join(UPLOAD_DIR, safe_name)

        with open(filepath, "wb") as f:
            shutil.copyfileobj(file.file, f)

        img = NoteImage(note_id=note_id, filename=file.filename, filepath=filepath)
        db.add(img)
        db.commit()
        db.refresh(img)
        saved.append(
            NoteImageResponse(
                id=img.id,
                note_id=img.note_id,
                filename=img.filename,
                url=_image_url(img),
                created_at=img.created_at,
            )
        )

    return saved


@app.delete("/api/notes/{note_id}/images/{image_id}", status_code=204)
def delete_note_image(note_id: int, image_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    img = db.query(NoteImage).filter(NoteImage.id == image_id, NoteImage.note_id == note_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    try:
        if os.path.exists(img.filepath):
            os.remove(img.filepath)
    except Exception:
        pass
    db.delete(img)
    db.commit()
