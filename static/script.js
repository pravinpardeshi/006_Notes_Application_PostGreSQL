/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
  categories: [],
  subCategories: [],
  notes: [],
  selectedCategoryId: null,
  selectedSubCategoryId: null,
  view: "table", // "table" | "cards" | "full"
};

/* ── DOM refs ──────────────────────────────────────────────────────────────── */
let currentNoteIndex = -1;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const sidebar = $("#sidebar");
const sidebarToggle = $("#sidebarToggle");
const categoryList = $("#categoryList");
const subCategoryList = $("#subCategoryList");
const notesBody = $("#notesBody");
const notesGrid = $("#notesGrid");
const emptyState = $("#emptyState");
const tableView = $("#tableView");
const cardsView = $("#cardsView");
const fullView = $("#fullView");
const fullBody = $("#fullBody");
const searchInput = $("#searchInput");
const searchClear = $("#searchClear");
const priorityFilter = $("#priorityFilter");
const showArchived = $("#showArchived");
const themeToggle = $("#themeToggle");
const viewBtns = $$(".view-btn");
const newNoteBtn = $("#newNoteBtn");
const noteModal = $("#noteModal");
const noteForm = $("#noteForm");
const modalTitle = $("#modalTitle");
const noteId = $("#noteId");
const noteTitle = $("#noteTitle");
const noteCategory = $("#noteCategory");
const noteSubCategory = $("#noteSubCategory");
const notePriority = $("#notePriority");
const noteDate = $("#noteDate");
const noteTime = $("#noteTime");
const noteColor = $("#noteColor");
const noteTags = $("#noteTags");
const noteText = $("#noteText");
const imageGrid = $("#imageGrid");
const imageInput = $("#imageInput");
const imageUploadArea = $("#imageUploadArea");
const modalClose = $("#modalClose");
const modalCancel = $("#modalCancel");
const modalPrev = $("#modalPrev");
const modalNext = $("#modalNext");

const lightbox = $("#imageLightbox");
const lightboxImage = $("#lightboxImage");
const lightboxClose = $("#lightboxClose");

const categoryModal = $("#categoryModal");
const categoryForm = $("#categoryForm");
const categoryName = $("#categoryName");
const categoryDescription = $("#categoryDescription");

const subCategoryModal = $("#subCategoryModal");
const subCategoryForm = $("#subCategoryForm");
const subCategoryParent = $("#subCategoryParent");
const subCategoryName = $("#subCategoryName");
const subCategoryDescription = $("#subCategoryDescription");

/* ── API helpers ───────────────────────────────────────────────────────────── */
const api = {
  async get(path) { const r = await fetch(path); if (!r.ok) throw Error(r.statusText); return r.status === 204 ? null : r.json(); },
  async post(path, body) { const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw Error(await r.text()); return r.json(); },
  async put(path, body) { const r = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw Error(await r.text()); return r.json(); },
  async del(path) { const r = await fetch(path, { method: "DELETE" }); if (!r.ok) throw Error(r.statusText); },
};

/* ── Theme ─────────────────────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

/* ── Backup / Restore ──────────────────────────────────────────────────────── */
/* Toggle popover in collapsed mode when clicking the section header */
document.getElementById("backupSection")?.addEventListener("click", (e) => {
  const header = e.target.closest(".section-header");
  if (header && sidebar.classList.contains("collapsed")) {
    document.getElementById("backupSection")?.classList.toggle("popover");
  }
});

document.querySelectorAll(".sidebar-section .chevron").forEach((chevron) => {
  chevron.addEventListener("click", (e) => {
    e.stopPropagation();
    chevron.closest(".sidebar-section")?.classList.toggle("accordion-open");
  });
});

document.getElementById("backupDownload")?.addEventListener("click", (e) => {
  e.stopPropagation();
  window.location.href = "/api/backup";
});

document.getElementById("backupRestore")?.addEventListener("click", () => {
  document.getElementById("restoreFileInput")?.click();
});

document.getElementById("restoreFileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch("/api/restore", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json();
      alert(`Restore failed: ${err.detail}`);
      return;
    }
    alert("Restore successful! Reloading notes...");
    loadCategories();
    loadNotes();
  } catch (err) {
    alert(`Restore failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

document.getElementById("healthCheck")?.addEventListener("click", async () => {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    showHealthPopup(data);
  } catch {
    alert("Health check failed: server unreachable");
  }
});

function showHealthPopup(data) {
  let html = `<h3>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
    System Health
    <button class="close" id="healthClose">&times;</button>
  </h3>`;
  for (const [key, val] of Object.entries(data)) {
    const cls = typeof val === "string" ? val.replace(/\s+/g, "_") : "";
    html += `<div class="row"><span class="label">${key}</span><span class="value ${cls}">${val}</span></div>`;
  }
  const popup = document.getElementById("healthPopup");
  popup.innerHTML = html;
  popup.classList.add("show");
  document.getElementById("healthBackdrop").classList.add("show");
  document.getElementById("healthClose").addEventListener("click", closeHealthPopup);
  document.getElementById("healthBackdrop").addEventListener("click", closeHealthPopup);
}

function closeHealthPopup() {
  document.getElementById("healthPopup").classList.remove("show");
  document.getElementById("healthBackdrop").classList.remove("show");
}

/* ── Sidebar ───────────────────────────────────────────────────────────────── */
function initSidebar() {
  const pinned = localStorage.getItem("sidebarPinned") === "true";
  if (!pinned) sidebar.classList.add("collapsed");
}

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  localStorage.setItem("sidebarPinned", !sidebar.classList.contains("collapsed"));
  document.getElementById("backupSection")?.classList.remove("popover");
});

/* ── All Notes ─────────────────────────────────────────────────────────────── */
const allNotesSection = $("#allNotesSection");
allNotesSection.addEventListener("click", () => {
  state.selectedCategoryId = null;
  state.selectedSubCategoryId = null;
  searchInput.value = "";
  searchClear.classList.remove("visible");
  priorityFilter.value = "";
  showArchived.checked = false;
  renderCategories();
  loadSubCategories();
  loadNotes();
});

/* ── View toggle ───────────────────────────────────────────────────────────── */
function initView() {
  state.view = localStorage.getItem("view") || "table";
  viewBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  });
  applyView();
}

viewBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    localStorage.setItem("view", state.view);
    viewBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    applyView();
    renderNotes();
  });
});

function applyView() {
  tableView.style.display = state.view === "table" ? "" : "none";
  cardsView.style.display = state.view === "cards" ? "block" : "none";
  fullView.style.display = state.view === "full" ? "" : "none";
}

/* ── Categories ────────────────────────────────────────────────────────────── */
async function loadCategories() {
  try {
    state.categories = await api.get("/api/categories");
  } catch {
    state.categories = [];
  }
  renderCategories();
  populateCategoryDropdowns();
}

function renderCategories() {
  allNotesSection.classList.toggle("active", state.selectedCategoryId === null);
  categoryList.innerHTML = state.categories.map((c) => `
    <li class="${state.selectedCategoryId === c.id ? "active" : ""}" data-id="${c.id}">
      <span class="cat-name">${esc(c.name)}</span>
      <button class="delete-btn" data-action="delete-category" data-id="${c.id}" title="Delete">&times;</button>
    </li>
  `).join("") || '<li style="font-size:.8rem;color:var(--text-muted);cursor:default;">No categories yet</li>';

  categoryList.querySelectorAll("li[data-id]").forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) return;
      const id = parseInt(li.dataset.id);
      state.selectedCategoryId = state.selectedCategoryId === id ? null : id;
      state.selectedSubCategoryId = null;
      renderCategories();
      loadSubCategories();
      loadNotes();
    });
  });

  categoryList.querySelectorAll("[data-action='delete-category']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this category and all its sub-categories?")) return;
      try {
        await api.del(`/api/categories/${btn.dataset.id}`);
      } catch (err) {
        alert("Failed to delete category: " + err.message);
        return;
      }
      state.selectedCategoryId = null;
      loadCategories();
      loadSubCategories();
      loadNotes();
    });
  });
}

/* ── Sub-Categories ────────────────────────────────────────────────────────── */
async function loadSubCategories() {
  const params = new URLSearchParams();
  if (state.selectedCategoryId) params.set("category_id", state.selectedCategoryId);
  try {
    state.subCategories = await api.get(`/api/sub_categories?${params}`);
  } catch {
    state.subCategories = [];
  }
  renderSubCategories();
}

function renderSubCategories() {
  allNotesSection.classList.toggle("active", state.selectedCategoryId === null && state.selectedSubCategoryId === null);

  if (state.subCategories.length === 0) {
    subCategoryList.innerHTML = '<li style="font-size:.8rem;color:var(--text-muted);cursor:default;">No sub-categories</li>';
    return;
  }

  subCategoryList.innerHTML = state.subCategories.map((s) => `
    <li class="${state.selectedSubCategoryId === s.id ? "active" : ""}" data-id="${s.id}" data-category-id="${s.category_id}">
      <span class="sub-cat-name">${esc(s.name)}</span>
      <button class="delete-btn" data-action="delete-sub-category" data-id="${s.id}" title="Delete">&times;</button>
    </li>
  `).join("");

  subCategoryList.querySelectorAll("li[data-id]").forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) return;
      const id = parseInt(li.dataset.id);
      const catId = parseInt(li.dataset.categoryId);
      if (state.selectedCategoryId !== catId) {
        state.selectedCategoryId = catId;
        renderCategories();
      }
      state.selectedSubCategoryId = state.selectedSubCategoryId === id ? null : id;
      renderSubCategories();
      loadNotes();
    });
  });

  subCategoryList.querySelectorAll("[data-action='delete-sub-category']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this sub-category?")) return;
      try {
        await api.del(`/api/sub_categories/${btn.dataset.id}`);
      } catch (err) {
        alert("Failed to delete sub-category: " + err.message);
        return;
      }
      state.selectedSubCategoryId = null;
      loadSubCategories();
      loadNotes();
    });
  });
}

/* ── Notes ──────────────────────────────────────────────────────────────────── */
async function loadNotes() {
  const params = new URLSearchParams();
  if (showArchived.checked) params.set("archived", "true");
  if (state.selectedCategoryId) params.set("category_id", state.selectedCategoryId);
  if (state.selectedSubCategoryId) params.set("sub_category_id", state.selectedSubCategoryId);
  if (priorityFilter.value) params.set("priority", priorityFilter.value);
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  state.notes = await api.get(`/api/notes?${params}`);
  renderNotes();
}

function renderNotes() {
  const hasNotes = state.notes.length > 0;
  emptyState.style.display = hasNotes ? "none" : "flex";
  if (state.view === "table") renderNotesTable();
  else if (state.view === "cards") renderNotesCards();
  else renderNotesFull();
}

function renderNotesTable() {
  const hasNotes = state.notes.length > 0;
  notesBody.style.display = hasNotes ? "" : "none";
  if (!hasNotes) { notesBody.innerHTML = ""; return; }

  notesBody.innerHTML = state.notes.map((n) => {
    const cat = state.categories.find((c) => c.id === n.category_id);
    const sub = state.subCategories.find((s) => s.id === n.sub_category_id);
    const catSub = [cat?.name, sub?.name].filter(Boolean).join(" / ") || "—";
    const preview = n.note_text.replace(/<[^>]*>/g, "").substring(0, 120);
    const tags = (n.tags || "").split(",").filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join("");
    const thumbs = (n.images || []).slice(0, 3).map((img) =>
      `<img class="image-preview-thumb" src="${esc(img.url)}" alt="" loading="lazy">`
    ).join("");
    return `<tr class="priority-${n.priority}${n.is_archived ? ' archived' : ''}" data-id="${n.id}" data-title="${esc(n.title)}">
      <td class="td-actions">
        <button class="archive-note" title="${n.is_archived ? 'Restore' : 'Archive'}">${n.is_archived ? '&#x21B6;' : '&#x1F4E5;'}</button>
        <button class="edit-note" title="Edit">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="delete-note" title="Delete">&times;</button>
      </td>
      <td class="td-title">${thumbs} ${esc(n.title)}${n.is_archived ? ' <span class="archived-badge">archived</span>' : ''}</td>
      <td class="td-note">${esc(preview)}${n.note_text.length > 120 ? "…" : ""}</td>
      <td class="td-cat">${esc(catSub)}</td>
      <td class="td-priority"><span class="priority-badge">${n.priority}</span></td>
      <td class="td-date">${n.note_date}${n.note_time ? ' ' + n.note_time : ''}</td>
      <td class="td-tags">${tags || "—"}</td>
    </tr>`;
  }).join("");

  notesBody.querySelectorAll("tr[data-id]").forEach((row) => {
    const id = parseInt(row.dataset.id);
    row.querySelector(".edit-note").addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteModal(id);
    });
    row.querySelector(".archive-note").addEventListener("click", async (e) => {
      e.stopPropagation();
      const note = state.notes.find((n) => n.id === id);
      await api.put(`/api/notes/${id}`, { is_archived: !note.is_archived });
      loadNotes();
    });
    row.querySelector(".delete-note").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this note?")) return;
      await api.del(`/api/notes/${id}`);
      loadNotes();
    });
    row.addEventListener("click", () => openNoteModal(id));
  });
}

function renderNotesCards() {
  const hasNotes = state.notes.length > 0;
  notesGrid.innerHTML = "";
  if (!hasNotes) return;

  notesGrid.innerHTML = state.notes.map((n) => {
    const pClass = `priority-${n.priority}`;
    const preview = n.note_text.replace(/<[^>]*>/g, "").substring(0, 150);
    const tags = (n.tags || "").split(",").filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join("");
    const thumbs = (n.images || []).slice(0, 2).map((img) =>
      `<img class="image-preview-thumb" src="${esc(img.url)}" alt="" loading="lazy">`
    ).join("");
    const extraCount = (n.images || []).length - 2;
    return `<div class="note-card ${pClass}${n.is_archived ? ' archived' : ''}" data-id="${n.id}" style="border-left:3px solid ${n.color || 'transparent'}">
      <div class="card-title">${esc(n.title)}${n.is_archived ? ' <span class="archived-badge">archived</span>' : ''}</div>
      <div class="card-preview">${thumbs ? '<div class="card-thumbs">' + thumbs + (extraCount > 0 ? `<span class="card-thumbs-more">+${extraCount}</span>` : '') + '</div>' : ''}${esc(preview)}</div>
      <div class="card-meta">
        <span class="priority-badge">${n.priority}</span>
        <span class="date">${n.note_date}${n.note_time ? ' ' + n.note_time : ''}</span>
        ${tags}
        <div class="card-actions">
          <button class="archive-card" title="${n.is_archived ? 'Restore' : 'Archive'}">${n.is_archived ? '&#x21B6;' : '&#x1F4E5;'}</button>
          <button class="edit-card" title="Edit">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="delete-card" title="Delete">&times;</button>
        </div>
      </div>
    </div>`;
  }).join("");

  notesGrid.querySelectorAll(".note-card").forEach((card) => {
    const id = parseInt(card.dataset.id);
    card.querySelector(".edit-card").addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteModal(id);
    });
    card.querySelector(".archive-card").addEventListener("click", async (e) => {
      e.stopPropagation();
      const note = state.notes.find((n) => n.id === id);
      await api.put(`/api/notes/${id}`, { is_archived: !note.is_archived });
      loadNotes();
    });
    card.querySelector(".delete-card").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this note?")) return;
      await api.del(`/api/notes/${id}`);
      loadNotes();
    });
    card.addEventListener("click", () => openNoteModal(id));
  });
}

function renderNotesFull() {
  const hasNotes = state.notes.length > 0;
  fullBody.style.display = hasNotes ? "" : "none";
  if (!hasNotes) { fullBody.innerHTML = ""; return; }

  fullBody.innerHTML = state.notes.map((n) => {
    const text = n.note_text.replace(/<[^>]*>/g, "");
    const thumb = (n.images || []).length > 0
      ? `<img class="image-preview-thumb" src="${esc(n.images[0].url)}" alt="" loading="lazy">`
      : "";
    return `<tr class="priority-${n.priority}${n.is_archived ? ' archived' : ''}" data-id="${n.id}">
      <td class="td-title">${esc(n.title)}${n.is_archived ? ' <span class="archived-badge">archived</span>' : ''}</td>
      <td class="td-note-full">${thumb} ${esc(text)}</td>
      <td class="td-date">${n.note_date}${n.note_time ? ' ' + n.note_time : ''}</td>
    </tr>`;
  }).join("");

  fullBody.querySelectorAll("tr[data-id]").forEach((row) => {
    const id = parseInt(row.dataset.id);
    row.addEventListener("click", () => openNoteModal(id));
  });
}

/* ── Note Modal ────────────────────────────────────────────────────────────── */
async function openNoteModal(id = null) {
  noteForm.reset();
  noteId.value = "";
  modalTitle.textContent = "New Note";
  noteDate.value = new Date().toISOString().split("T")[0];
  noteTime.value = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  noteColor.value = "#4f46e5";
  notePriority.value = "medium";

  if (id) {
    const note = await api.get(`/api/notes/${id}`);
    noteId.value = note.id;
    modalTitle.textContent = "Edit Note — " + note.title;
    noteTitle.value = note.title;
    noteCategory.value = note.category_id || "";
    await populateSubCategoryDropdown(note.category_id);
    noteSubCategory.value = note.sub_category_id || "";
    notePriority.value = note.priority;
    noteDate.value = note.note_date;
    noteTime.value = note.note_time || "";
    noteColor.value = note.color || "#4f46e5";
    noteTags.value = note.tags || "";
    noteText.value = note.note_text;

    currentNoteIndex = state.notes.findIndex((n) => n.id === id);
    await loadNoteImages(note.id);
  } else {
    currentNoteIndex = -1;
    imageGrid.innerHTML = "";
    if (state.selectedCategoryId) {
      noteCategory.value = state.selectedCategoryId;
      await populateSubCategoryDropdown(state.selectedCategoryId);
      if (state.selectedSubCategoryId) noteSubCategory.value = state.selectedSubCategoryId;
    }
  }

  updateNavButtons();
  noteModal.classList.add("active");
}

function updateNavButtons() {
  const total = state.notes.length;
  const hasNav = total > 1 && currentNoteIndex >= 0;
  modalPrev.style.display = hasNav ? "" : "none";
  modalNext.style.display = hasNav ? "" : "none";
  if (hasNav) {
    modalPrev.disabled = currentNoteIndex === 0;
    modalNext.disabled = currentNoteIndex === total - 1;
  }
}

function closeNoteModal() {
  noteModal.classList.remove("active");
}

/* ── Note Images ──────────────────────────────────────────────────────────── */
let pendingImageFiles = [];

async function loadNoteImages(noteId) {
  imageGrid.innerHTML = "";
  pendingImageFiles = [];
  try {
    const images = await api.get(`/api/notes/${noteId}/images`);
    images.forEach((img) => addImageToGrid(img.url, img.filename, img.id));
  } catch {
    // no images yet
  }
}

function addImageToGrid(url, filename, imageId = null) {
  const div = document.createElement("div");
  div.className = "image-item";
  div.innerHTML = `
    <img src="${url}" alt="${esc(filename)}" loading="lazy">
    <button class="image-delete" title="Remove image">&times;</button>
  `;
  const imgEl = div.querySelector("img");
  imgEl.addEventListener("click", (e) => {
    e.stopPropagation();
    lightboxImage.src = url;
    lightbox.classList.add("active");
  });

  const delBtn = div.querySelector(".image-delete");
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (imageId) {
      if (!confirm("Delete this image?")) return;
      await api.del(`/api/notes/${noteId.value}/images/${imageId}`);
    }
    div.remove();
    if (!imageId) {
      const idx = pendingImageFiles.findIndex((f) => f.name === filename);
      if (idx >= 0) pendingImageFiles.splice(idx, 1);
    }
  });
  imageGrid.appendChild(div);
}

imageUploadArea.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", () => {
  for (const file of imageInput.files) {
    if (!file.type.startsWith("image/")) continue;
    pendingImageFiles.push(file);
    const url = URL.createObjectURL(file);
    addImageToGrid(url, file.name);
  }
  imageInput.value = "";
});

imageUploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  imageUploadArea.classList.add("drag-over");
});
imageUploadArea.addEventListener("dragleave", () => {
  imageUploadArea.classList.remove("drag-over");
});
imageUploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  imageUploadArea.classList.remove("drag-over");
  for (const file of e.dataTransfer.files) {
    if (!file.type.startsWith("image/")) continue;
    pendingImageFiles.push(file);
    const url = URL.createObjectURL(file);
    addImageToGrid(url, file.name);
  }
});

noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: noteTitle.value.trim(),
    note_text: noteText.value.trim(),
    note_date: noteDate.value,
    note_time: noteTime.value || null,
    priority: notePriority.value,
    color: noteColor.value,
    tags: noteTags.value.trim(),
    category_id: noteCategory.value ? parseInt(noteCategory.value) : null,
    sub_category_id: noteSubCategory.value ? parseInt(noteSubCategory.value) : null,
  };

  const id = noteId.value;
  if (id) {
    await api.put(`/api/notes/${id}`, payload);
  } else {
    const created = await api.post("/api/notes", payload);
    noteId.value = created.id;
  }

  if (pendingImageFiles.length > 0 && noteId.value) {
    const formData = new FormData();
    pendingImageFiles.forEach((f) => formData.append("files", f));
    await fetch(`/api/notes/${noteId.value}/images`, { method: "POST", body: formData });
    pendingImageFiles = [];
  }

  closeNoteModal();
  loadNotes();
});

/* ── Category Modal ────────────────────────────────────────────────────────── */
document.querySelectorAll("[id$='CategoryBtn'], [id$='SubCategoryBtn']").forEach((btn) => {
  if (btn.id === "addCategoryBtn") {
    btn.addEventListener("click", () => {
      categoryForm.reset();
      categoryModal.classList.add("active");
    });
  }
  if (btn.id === "addSubCategoryBtn") {
    btn.addEventListener("click", () => {
      subCategoryForm.reset();
      populateCategoryDropdown(subCategoryParent, state.selectedCategoryId);
      subCategoryModal.classList.add("active");
    });
  }
});

function closeModal(overlay) {
  overlay.classList.remove("active");
}

categoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api.post("/api/categories", {
      name: categoryName.value.trim(),
      description: categoryDescription.value.trim() || null,
    });
  } catch (err) {
    alert("Failed to create category: " + err.message);
    return;
  }
  closeModal(categoryModal);
  loadCategories();
  loadSubCategories();
});

subCategoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api.post("/api/sub_categories", {
      name: subCategoryName.value.trim(),
      description: subCategoryDescription.value.trim() || null,
      category_id: parseInt(subCategoryParent.value),
    });
  } catch (err) {
    alert("Failed to create sub-category: " + err.message);
    return;
  }
  closeModal(subCategoryModal);
  loadSubCategories();
  loadNotes();
});

/* ── Modal close handlers ──────────────────────────────────────────────────── */
[modalClose, modalCancel].forEach((el) => el?.addEventListener("click", closeNoteModal));

modalPrev.addEventListener("click", () => {
  if (currentNoteIndex > 0) {
    openNoteModal(state.notes[currentNoteIndex - 1].id);
  }
});
modalNext.addEventListener("click", () => {
  if (currentNoteIndex < state.notes.length - 1) {
    openNoteModal(state.notes[currentNoteIndex + 1].id);
  }
});
document.getElementById("categoryModalClose")?.addEventListener("click", () => closeModal(categoryModal));
document.getElementById("categoryModalCancel")?.addEventListener("click", () => closeModal(categoryModal));
document.getElementById("subCategoryModalClose")?.addEventListener("click", () => closeModal(subCategoryModal));
document.getElementById("subCategoryModalCancel")?.addEventListener("click", () => closeModal(subCategoryModal));

lightboxClose.addEventListener("click", () => closeModal(lightbox));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeModal(lightbox);
});

document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeModal(ov);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach(closeModal);
  }
});

/* ── Category / Sub-Category dropdown population ───────────────────────────── */
function populateCategoryDropdowns() {
  populateCategoryDropdown(noteCategory);
}

function populateCategoryDropdown(select, selectedId) {
  const isSubCatParent = select.id === "subCategoryParent";
  const opts = state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  select.innerHTML = isSubCatParent ? opts : '<option value="">None</option>' + opts;
  if (selectedId) {
    select.value = selectedId;
  }
}

noteCategory.addEventListener("change", async () => {
  await populateSubCategoryDropdown(noteCategory.value);
  noteSubCategory.value = "";
});

async function populateSubCategoryDropdown(categoryId) {
  noteSubCategory.innerHTML = '<option value="">None</option>';
  if (!categoryId) return;
  const subs = await api.get(`/api/sub_categories?category_id=${categoryId}`);
  subs.forEach((s) => {
    noteSubCategory.innerHTML += `<option value="${s.id}">${esc(s.name)}</option>`;
  });
}

/* ── Filters ───────────────────────────────────────────────────────────────── */
searchInput.addEventListener("input", debounce(loadNotes, 300));
searchInput.addEventListener("input", () => {
  searchClear.classList.toggle("visible", searchInput.value.length > 0);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.remove("visible");
  searchInput.focus();
  loadNotes();
});
priorityFilter.addEventListener("change", loadNotes);
showArchived.addEventListener("change", loadNotes);

newNoteBtn.addEventListener("click", () => openNoteModal());

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
initTheme();
initSidebar();
initView();
loadCategories();
loadSubCategories();
loadNotes();
