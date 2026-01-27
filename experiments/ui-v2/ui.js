// UI-only enhancements for the v2 experiment.
(() => {
    const entryCount = document.getElementById('entryCount');
    const dataBody = document.getElementById('dataBody');
    const autoDate = document.getElementById('autoDate');
    const composerHint = document.getElementById('composerHint');
    const quickForm = document.getElementById('quickForm');
    const notesPanel = document.getElementById('notesPanel');
    const extraFields = document.getElementById('extraFields');

    if (autoDate) {
        const today = new Date();
        autoDate.value = today.toLocaleDateString('de-DE');
    }

    const updateCount = () => {
        if (!entryCount || !dataBody) return;
        const rows = dataBody.querySelectorAll('tr[data-id]');
        entryCount.textContent = rows.length ? String(rows.length) : '0';
    };

    if (dataBody) {
        updateCount();
        const observer = new MutationObserver(updateCount);
        observer.observe(dataBody, { childList: true });
    }

    if (quickForm && composerHint) {
        const syncHint = () => {
            if (quickForm.style.display === 'block') {
                composerHint.style.display = 'none';
            } else {
                composerHint.style.display = '';
            }
        };
        syncHint();
        const formObserver = new MutationObserver(syncHint);
        formObserver.observe(quickForm, { attributes: true, attributeFilter: ['style'] });
    }

    if (notesPanel && extraFields) {
        const syncNotesPanel = () => {
            const hasContent = extraFields.children.length > 0;
            const isVisible = extraFields.style.display && extraFields.style.display !== 'none';
            if ((hasContent || isVisible) && !notesPanel.open) {
                notesPanel.open = true;
            }
        };

        const notesObserver = new MutationObserver(syncNotesPanel);
        notesObserver.observe(extraFields, { childList: true, attributes: true, attributeFilter: ['style'] });
    }
})();
