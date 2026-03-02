document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('supabaseUrl');
    const keyInput = document.getElementById('supabaseKey');
    const statusEl = document.getElementById('status');
    const form = document.getElementById('settingsForm');

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
});
