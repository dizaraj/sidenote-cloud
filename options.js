document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('supabaseUrl');
    const keyInput = document.getElementById('supabaseKey');
    const statusEl = document.getElementById('status');
    const form = document.getElementById('settingsForm');
    const btnPull = document.getElementById('btnPull');

    // Load saved settings
    chrome.storage.local.get(['supabaseUrl', 'supabaseKey'], (result) => {
        if (result.supabaseUrl) {
            let url = result.supabaseUrl;
            url = url.replace(/^(https?:\/\/)?(db\.)?/, 'https://');
            if (url.endsWith('/')) url = url.slice(0, -1);
            urlInput.value = url;
        }
        if (result.supabaseKey) keyInput.value = result.supabaseKey;
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Clean up URL. Convert 'db.xyz.supabase.co' to 'https://xyz.supabase.co'
        let url = urlInput.value.trim();
        url = url.replace(/^(https?:\/\/)?(db\.)?/, 'https://');
        if (url.endsWith('/')) url = url.slice(0, -1);

        const key = keyInput.value.trim();

        chrome.storage.local.set({ supabaseUrl: url, supabaseKey: key }, () => {
            statusEl.classList.remove('hidden');
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 3000);
        });
    });

    btnPull.addEventListener('click', async () => {
        const urlRaw = urlInput.value.trim();
        const key = keyInput.value.trim();

        if (!urlRaw || !key) {
            showStatus('Please enter and save your database credentials first.', 'error');
            return;
        }

        let url = urlRaw.replace(/^(https?:\/\/)?(db\.)?/, 'https://');
        if (url.endsWith('/')) url = url.slice(0, -1);

        btnPull.textContent = 'Pulling...';
        btnPull.disabled = true;

        try {
            const res = await fetch(`${url}/rest/v1/notes?select=*`, {
                method: 'GET',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`
                }
            });

            if (!res.ok) {
                showStatus('Failed to pull notes. Check credentials.', 'error');
            } else {
                const cloudNotes = await res.json();
                await mergeNotes(cloudNotes);
                showStatus(`Successfully pulled ${cloudNotes.length} notes!`, 'success');
            }
        } catch (err) {
            console.error(err);
            showStatus('Network error occurred.', 'error');
        } finally {
            btnPull.textContent = 'Pull Notes from Cloud';
            btnPull.disabled = false;
        }
    });

    function showStatus(message, type = 'success') {
        statusEl.textContent = message;
        statusEl.style.color = type === 'error' ? '#ef4444' : 'var(--success)';
        statusEl.style.backgroundColor = type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
        statusEl.style.borderColor = type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';

        statusEl.classList.remove('hidden');
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 4000);
    }

    async function mergeNotes(cloudNotes) {
        const data = await chrome.storage.local.get(['notes']);
        let localNotes = data.notes || [];

        cloudNotes.forEach(cn => {
            const existsIndex = localNotes.findIndex(ln => ln.id === cn.local_id);
            const formattedNote = {
                id: cn.local_id,
                title: cn.title,
                body: cn.body,
                urls: cn.urls || [],
                createdAt: new Date(cn.created_at).getTime(),
                updatedAt: new Date(cn.created_at).getTime(),
                synced: true,
                archived: cn.is_archived || false
            };

            if (existsIndex === -1) {
                localNotes.push(formattedNote);
            } else {
                // If it exists locally but hasn't been synced, keep local version
                if (localNotes[existsIndex].synced) {
                    localNotes[existsIndex] = formattedNote;
                }
            }
        });

        // Sort them
        localNotes.sort((a, b) => b.updatedAt - a.updatedAt);
        await chrome.storage.local.set({ notes: localNotes });
    }
});
