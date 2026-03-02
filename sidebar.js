let currentNoteId = null;
let isSettingConfigured = false;
let notes = [];
let currentListTab = 'active'; // 'active' or 'archived'

// DOM Elements
const views = {
    list: document.getElementById('listView'),
    editor: document.getElementById('editorView')
};

const elements = {
    settingsBtn: document.getElementById('settingsBtn'),
    fabAddNote: document.getElementById('fabAddNote'),
    btnBack: document.getElementById('btnBack'),
    btnSaveNote: document.getElementById('btnSaveNote'),
    btnAddUrl: document.getElementById('btnAddUrl'),
    notesList: document.getElementById('notesList'),
    emptyState: document.getElementById('emptyState'),
    offlineBanner: document.getElementById('offlineBanner'),
    toast: document.getElementById('toast'),

    // Tabs
    tabActive: document.getElementById('tabActive'),
    tabArchived: document.getElementById('tabArchived'),

    // Editor fields
    noteTitle: document.getElementById('noteTitle'),
    noteBody: document.getElementById('noteBody'),
    urlsList: document.getElementById('urlsList'),
    syncStatus: document.getElementById('syncStatus'),
    btnArchive: document.getElementById('btnArchive'),
    btnDelete: document.getElementById('btnDelete')
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupEventListeners();
});

async function init() {
    await checkSettings();
    await loadNotes();
    renderNotes();
}

async function checkSettings() {
    const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    isSettingConfigured = !!(data.supabaseUrl && data.supabaseKey);
    if (isSettingConfigured) {
        elements.offlineBanner.classList.add('hidden');
    } else {
        elements.offlineBanner.classList.remove('hidden');
    }
}

async function loadNotes() {
    const data = await chrome.storage.local.get(['notes']);
    notes = data.notes || [];
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

function renderNotes() {
    elements.notesList.innerHTML = '';

    let filteredNotes = notes.filter(n => currentListTab === 'archived' ? n.archived : !n.archived);

    if (filteredNotes.length === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.querySelector('p').textContent = currentListTab === 'archived' ? 'No archived notes' : 'No notes yet';
    } else {
        elements.emptyState.classList.add('hidden');
        filteredNotes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
        <h3>${escapeHtml(note.title || 'Untitled Note')}</h3>
        <p>${escapeHtml(note.body || 'No content...')}</p>
        <div class="note-meta">
          <div class="note-tags">
            <span class="tag ${note.synced ? 'tag-synced' : 'tag-local'}">
              ${note.synced ? 'Cloud Sync' : 'Local Only'}
            </span>
          </div>
          <span>${new Date(note.updatedAt).toLocaleDateString()}</span>
        </div>
      `;
            card.addEventListener('click', () => openNote(note.id));
            elements.notesList.appendChild(card);
        });
    }
}

function setupEventListeners() {
    elements.settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    elements.fabAddNote.addEventListener('click', () => {
        openNote(null);
    });

    elements.btnBack.addEventListener('click', () => {
        switchView('list');
    });

    elements.btnSaveNote.addEventListener('click', saveNote);

    elements.btnAddUrl.addEventListener('click', () => {
        addUrlInput('');
    });

    elements.tabActive.addEventListener('click', () => {
        currentListTab = 'active';
        elements.tabActive.classList.add('active');
        elements.tabArchived.classList.remove('active');
        renderNotes();
    });

    elements.tabArchived.addEventListener('click', () => {
        currentListTab = 'archived';
        elements.tabArchived.classList.add('active');
        elements.tabActive.classList.remove('active');
        renderNotes();
    });

    elements.btnArchive.addEventListener('click', toggleArchiveNote);
    elements.btnDelete.addEventListener('click', deleteNote);
}

function switchView(viewName) {
    Object.values(views).forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });

    views[viewName].classList.remove('hidden');
    // Small delay to allow display to apply before activating transitions
    setTimeout(() => {
        views[viewName].classList.add('active');
    }, 10);

    if (viewName === 'list') {
        init(); // Refresh settings/list
    }
}

function addUrlInput(value = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'url-item';

    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'url-input';
    input.placeholder = 'https://...';
    input.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.className = 'btn-remove-url';
    removeBtn.onclick = () => wrapper.remove();

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    elements.urlsList.appendChild(wrapper);
}

function openNote(noteId) {
    currentNoteId = noteId;
    elements.urlsList.innerHTML = '';

    if (noteId) {
        const note = notes.find(n => n.id === noteId);
        if (note) {
            elements.noteTitle.value = note.title || '';
            elements.noteBody.value = note.body || '';
            if (note.urls && note.urls.length > 0) {
                note.urls.forEach(url => addUrlInput(url));
            } else {
                addUrlInput();
            }

            elements.syncStatus.className = 'tag ' + (note.synced ? 'tag-synced' : 'tag-local');
            elements.syncStatus.textContent = note.synced ? 'Synced' : 'Local Only';

            elements.btnArchive.classList.remove('hidden');
            elements.btnDelete.classList.remove('hidden');

            if (note.archived) {
                elements.btnArchive.title = 'Unarchive Note';
                elements.btnArchive.classList.add('tag-local');
            } else {
                elements.btnArchive.title = 'Archive Note';
                elements.btnArchive.classList.remove('tag-local');
            }
        }
    } else {
        // New Note
        elements.noteTitle.value = '';
        elements.noteBody.value = '';
        addUrlInput();
        elements.syncStatus.className = 'tag tag-pending';
        elements.syncStatus.textContent = 'New Note';
        elements.btnArchive.classList.add('hidden');
        elements.btnDelete.classList.add('hidden');
    }

    switchView('editor');
}

async function saveNote() {
    const title = elements.noteTitle.value.trim();
    const body = elements.noteBody.value.trim();
    const urlInputs = document.querySelectorAll('.url-input');
    const urls = Array.from(urlInputs).map(i => i.value.trim()).filter(v => v);

    if (!title && !body && urls.length === 0) {
        showToast('Cannot save an empty note', 'error');
        return;
    }

    elements.btnSaveNote.textContent = 'Saving...';
    elements.btnSaveNote.disabled = true;

    const now = Date.now();
    let noteIndex = notes.findIndex(n => n.id === currentNoteId);

    let note = {};
    if (noteIndex >= 0) {
        note = { ...notes[noteIndex], title, body, urls, updatedAt: now, synced: false };
        notes[noteIndex] = note;
    } else {
        note = {
            id: generateUUID(),
            title,
            body,
            urls,
            createdAt: now,
            updatedAt: now,
            synced: false,
            archived: false
        };
        currentNoteId = note.id;
        notes.unshift(note);
    }

    // Save Locally first
    await chrome.storage.local.set({ notes });

    // Attempt Sync to Supabase
    if (isSettingConfigured) {
        const synced = await syncToSupabase(note);
        if (synced) {
            note.synced = true;
            await chrome.storage.local.set({ notes });
            showToast('Note saved & synced to cloud', 'success');
            elements.syncStatus.className = 'tag tag-synced';
            elements.syncStatus.textContent = 'Synced';
        } else {
            showToast('Saved locally, but failed to sync', 'error');
            elements.syncStatus.className = 'tag tag-local';
            elements.syncStatus.textContent = 'Sync Failed';
        }
    } else {
        showToast('Note saved locally', 'success');
        elements.syncStatus.className = 'tag tag-local';
        elements.syncStatus.textContent = 'Local Only';
    }

    elements.btnSaveNote.textContent = 'Save & Sync Note';
    elements.btnSaveNote.disabled = false;

    // Show action buttons if new note was just created
    elements.btnArchive.classList.remove('hidden');
    elements.btnDelete.classList.remove('hidden');

    // Refresh List in background
    renderNotes();
}

async function toggleArchiveNote() {
    if (!currentNoteId) return;
    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;

    const note = notes[noteIndex];
    note.archived = !note.archived;
    note.updatedAt = Date.now();
    note.synced = false;

    await chrome.storage.local.set({ notes });

    // Sync change to cloud
    if (isSettingConfigured) {
        const synced = await syncToSupabase(note);
        if (synced) {
            note.synced = true;
            await chrome.storage.local.set({ notes });
        }
    }

    showToast(note.archived ? 'Note archived' : 'Note unarchived', 'success');
    switchView('list');
}

async function deleteNote() {
    if (!currentNoteId) return;
    if (!confirm('Are you sure you want to permanently delete this note?')) return;

    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;

    const note = notes[noteIndex];
    notes.splice(noteIndex, 1);
    await chrome.storage.local.set({ notes });

    if (isSettingConfigured) {
        await deleteFromSupabase(note.id);
    }

    showToast('Note deleted', 'success');
    switchView('list');
}

async function syncToSupabase(note) {
    try {
        const { supabaseUrl, supabaseKey } = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
        if (!supabaseUrl || !supabaseKey) return false;

        let cleanUrl = supabaseUrl;
        cleanUrl = cleanUrl.replace(/^(https?:\/\/)?(db\.)?/, 'https://');
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

        // Supabase REST endpoint logic using Upsert based on local_id 
        const payload = {
            local_id: note.id,
            title: note.title,
            body: note.body,
            urls: note.urls,
            is_archived: note.archived || false
        };

        const res = await fetch(`${cleanUrl}/rest/v1/notes?on_conflict=local_id`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok && res.status !== 201) {
            const errorText = await res.text();
            console.error('Supabase Sync Error from Server:', res.status, errorText);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Supabase Sync Error:', err);
        return false;
    }
}

async function deleteFromSupabase(localId) {
    try {
        const { supabaseUrl, supabaseKey } = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
        if (!supabaseUrl || !supabaseKey) return false;

        let cleanUrl = supabaseUrl;
        cleanUrl = cleanUrl.replace(/^(https?:\/\/)?(db\.)?/, 'https://');
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

        const res = await fetch(`${cleanUrl}/rest/v1/notes?local_id=eq.${localId}`, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!res.ok) {
            console.error('Supabase Delete Error:', await res.text());
            return false;
        }
        return true;
    } catch (err) {
        console.error('Supabase Delete Exception:', err);
        return false;
    }
}

function showToast(message, type) {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    elements.toast.classList.remove('hidden');

    setTimeout(() => {
        elements.toast.classList.remove('show');
        setTimeout(() => elements.toast.classList.add('hidden'), 300);
    }, 3000);
}

// Utils
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
