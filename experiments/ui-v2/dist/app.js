let gapi;
let google;
// --- Google Sheets API Konfiguration ---
// HINWEIS: Um Google Sheets zu nutzen, müssen hier gültige Anmeldedaten eingetragen werden.
// Anleitung: https://developers.google.com/sheets/api/quickstart/js
const CLIENT_ID = '744552869176-oen8v0cjvsd9259nlegj1qcuncormso7.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBAYW1OKeOScxvamvciP4UBWUoBN56rIDY';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const STORAGE_KEY = 'raceAnimations';
const STORAGE_ID_KEY = 'raceAnimationsNextId';
const CLOUD_ENDPOINT = '/api/animations';
const PERSON_KAETHE = 'K\u00e4the';
const PERSON_NAMES = ['Jerry', 'Marc', 'Kodiak', 'Taube', PERSON_KAETHE];
const NTFY_TOPIC = '33min-vfx-stream-8k2p'; // Generated secret topic
let cloudAvailable = false;
let nextLocalId = Number.parseInt(localStorage.getItem(STORAGE_ID_KEY) || '1', 10);
let sortState = { key: null, direction: 'asc' };
const filterState = {
    query: '',
    showOnly: false,
    typeOnly: false,
    todoOnly: false,
    samsungOnly: false
};
let tokenClient;
let spreadsheetId = localStorage.getItem('googleSpreadsheetId') || '';
const ITEMS_PER_PAGE = 15;
let currentPage = 1;
// --- Initialisierung ---
function gapiLoaded() {
    gapi = window.gapi;
    gapi.load('client', initializeGapiClient);
}
function initializeGapiClient() {
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction,JSVoidFunctionReturnValueUsed
    const initResult = gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    if (initResult && typeof initResult.then === 'function') {
        initResult.then(updateAuthStatus).catch(() => updateAuthStatus());
        return;
    }
    updateAuthStatus();
}
function gisLoaded() {
    google = window.google;
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // wird später gesetzt
    });
    updateAuthStatus();
}
// Skripte laden
(function loadGoogleScripts() {
    const scriptGapi = document.createElement('script');
    scriptGapi.src = 'https://apis.google.com/js/api.js';
    scriptGapi.onload = gapiLoaded;
    document.head.appendChild(scriptGapi);
    const scriptGis = document.createElement('script');
    scriptGis.src = 'https://accounts.google.com/gsi/client';
    scriptGis.onload = gisLoaded;
    document.head.appendChild(scriptGis);
})();
function updateAuthStatus() {
    const statusDiv = document.getElementById('authStatus');
    const authBtn = document.getElementById('authBtn');
    const actionsDiv = document.getElementById('sheetsActions');
    if (!statusDiv || !authBtn || !actionsDiv)
        return;
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    let token = null;
    try {
        if (gapi && gapi.client && typeof gapi.client.getToken === 'function') {
            token = gapi.client.getToken();
        }
    } catch (e) {
        console.warn("Google API token check failed (optional feature):", e.message);
    }
    if (token) {
        statusDiv.innerHTML = `<span class="material-icons" style="color: #0f9d58;">check_circle</span> <span>Verbunden</span>`;
        authBtn.innerHTML = `<span class="material-icons">logout</span> Abmelden`;
        authBtn.onclick = handleSignoutClick;
        actionsDiv.style.display = 'flex';
    }
    else {
        statusDiv.innerHTML = `<span class="material-icons" style="color: #ea4335;">error</span> <span>Nicht verbunden</span>`;
        authBtn.innerHTML = `<span class="material-icons">login</span> Anmelden`;
        authBtn.onclick = handleAuthClick;
        actionsDiv.style.display = 'none';
    }
}
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        updateAuthStatus();
        showNotification('Erfolgreich angemeldet!');
    };
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    if (gapi.client.getToken() === null) {
        //noinspection JSUnresolvedFunction
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
    else {
        //noinspection JSUnresolvedFunction
        tokenClient.requestAccessToken({ prompt: '' });
    }
}
function handleSignoutClick() {
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    const token = gapi.client.getToken();
    if (token !== null) {
        //noinspection JSUnresolvedVariable,JSUnresolvedFunction,JSValidateTypes,JSCheckFunctionSignatures
        google.accounts.oauth2.revoke(token.access_token);
        //noinspection JSUnresolvedVariable,JSUnresolvedFunction
        gapi.client.setToken('');
        updateAuthStatus();
        showNotification('Abgemeldet.');
    }
}
function showSheetsModal() {
    const modal = document.getElementById('sheetsModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('spreadsheetIdInput').value = spreadsheetId;
        updateAuthStatus();
    }
}
function hideSheetsModal() {
    const modal = document.getElementById('sheetsModal');
    if (modal)
        modal.style.display = 'none';
}
function saveSheetsSettings() {
    const input = document.getElementById('spreadsheetIdInput');
    spreadsheetId = input.value.trim();
    if (spreadsheetId.includes('/d/')) {
        const parts = spreadsheetId.split('/d/');
        if (parts[1]) {
            spreadsheetId = parts[1].split('/')[0];
            input.value = spreadsheetId;
        }
    }
    localStorage.setItem('googleSpreadsheetId', spreadsheetId);
    showNotification('Einstellungen gespeichert!');
}
async function pushToGoogleSheets() {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Senden vorhanden!');
        return;
    }
    try {
        showNotification('Sende Daten zu Google Sheets...');
        // Header und Daten vorbereiten
        const values = [SHEET_HEADERS, ...buildAnimationRows(animations)];
        // Zuerst das Blatt leeren oder einfach überschreiben? 
        // Wir überschreiben das gesamte Blatt "Sheet1" ab A1
        const range = 'Sheet1!A1';
        //noinspection JSUnresolvedVariable,JSUnresolvedFunction
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource: { values }
        });
        showNotification('Erfolgreich in Google Sheets gespeichert!');
        hideSheetsModal();
    }
    catch (err) {
        console.error(err);
        showNotification('Fehler beim Senden: ' + (err.result?.error?.message || 'Unbekannter Fehler'));
    }
}
async function pullFromGoogleSheets() {
    try {
        showNotification('Lade Daten aus Google Sheets...');
        const range = 'Sheet1!A2:Q'; // Überspringe Header
        //noinspection JSUnresolvedVariable,JSUnresolvedFunction
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range,
        });
        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            showNotification('Keine Daten gefunden.');
            return;
        }
        // Map rows back to animation objects
        const newAnimations = rows.map(row => {
            const rawId = row[0];
            const parsedId = rawId === '' || rawId === undefined ? Number.NaN : Number(rawId);
            const hasId = Number.isFinite(parsedId);
            const offset = hasId ? 1 : 0;
            const idValue = hasId ? parsedId : generateLocalId();
            return {
                id: idValue,
                datum: row[offset + 0] || '',
                show: row[offset + 1] || '',
                folge: row[offset + 2] || '',
                teilnehmer: row[offset + 3] || '',
                farbe: row[offset + 4] || '',
                komposition: row[offset + 5] || '',
                temperatur: row[offset + 6] || '',
                zeit: row[offset + 7] || '',
                geldStart: row[offset + 8] || '',
                geldAenderung: row[offset + 9] || '',
                geldAktuell: row[offset + 10] || '',
                stempel: row[offset + 11] || '',
                textboxText: row[offset + 12] || '',
                todoItem: row[offset + 13] || '',
                schnittTimestamp: row[offset + 14] || '',
                cutterInfo: row[offset + 15] || '',
                type: row[offset + 5] || 'temperatur'
            };
        });
        if (confirm(`${newAnimations.length} Animationen geladen. Bestehende Daten überschreiben?`)) {
            const normalized = normalizeAnimations(newAnimations);
            animations = normalized.list;
            const maxId = getMaxId(animations);
            nextLocalId = Math.max(nextLocalId, maxId + 1);
            saveAndRender();
            showNotification('Daten erfolgreich synchronisiert!');
            hideSheetsModal();
        }
    }
    catch (err) {
        console.error(err);
        showNotification('Fehler beim Laden: ' + (err.result?.error?.message || 'Unbekannter Fehler'));
    }
}
const colorMap = {
    'Jerry': 'Blau',
    'Marc': 'Grün',
    'Kodiak': 'Lila',
    'Taube': 'Rot',
    [PERSON_KAETHE]: 'Orange'
};
const badgeClass = {
    'Jerry': 'badge-jerry',
    'Marc': 'badge-marc',
    'Kodiak': 'badge-kodiak',
    'Taube': 'badge-taube',
    [PERSON_KAETHE]: 'badge-kaethe'
};
const typeIcon = {
    'temperatur': 'thermostat',
    'zeit': 'schedule',
    'geld': 'payments',
    'uebersicht': 'assessment',
    'textbox': 'chat_bubble',
    'todo': 'check_circle',
    'ticket': 'confirmation_number',
    'samsung': 'smartphone'
};
const typeLabels = {
    temperatur: 'Temperatur',
    zeit: 'Zeit',
    geld: 'Geld',
    uebersicht: 'Übersicht',
    textbox: 'TextBox',
    todo: 'To-Do',
    ticket: 'Ticket',
    samsung: 'Samsung Template'
};
const statusLabels = {
    none: 'Kein Status',
    draft: 'Entwurf',
    ready: 'Export bereit',
    exported: 'Exportiert',
    error: 'Fehler',
    edited: 'Bearbeitet'
};
const SHEET_HEADERS = ['ID', 'Datum', 'Show', 'Folge', 'Teilnehmer', 'Farbe', 'Komposition', 'Temperatur', 'Zeit', 'Geld_Start', 'Geld_Änderung', 'Geld_Aktuell', 'Stempel', 'TextBox_Text', 'ToDo_Item', 'Schnitt_Zeitstempel', 'Cutter_Info'];
const SHEET_FIELDS = ['id', 'datum', 'show', 'folge', 'teilnehmer', 'farbe', 'komposition', 'temperatur', 'zeit', 'geldStart', 'geldAenderung', 'geldAktuell', 'stempel', 'textboxText', 'todoItem', 'schnittTimestamp', 'cutterInfo'];
function getFolgeValue(anim) {
    return anim.folge || anim.sequenz || '';
}
function getAnimationFieldValue(anim, field) {
    if (field === 'folge')
        return getFolgeValue(anim);
    const value = anim[field];
    return value === undefined || value === null ? '' : String(value);
}
function getStatusKey(anim) {
    const raw = anim.status || 'none';
    return statusLabels[raw] ? raw : 'none';
}
function getStatusLabel(anim) {
    const key = getStatusKey(anim);
    return statusLabels[key] || statusLabels.none;
}
function buildAnimationRows(list) {
    return list.map(anim => SHEET_FIELDS.map(field => getAnimationFieldValue(anim, field)));
}
let animations = [];
const selectedIds = new Set();
let statusMenuId = null;
let chatHistory = [];
let chatBusy = false;
const CHAT_STORAGE_KEY = 'chat_history';
function normalizeAnimation(raw) {
    const anim = { ...raw };
    if (anim.folge === undefined && anim.sequenz !== undefined) {
        anim.folge = anim.sequenz;
        delete anim.sequenz;
    }
    if (!anim.type && anim.komposition) {
        anim.type = anim.komposition;
    }
    if (anim.id !== undefined && anim.id !== null) {
        const parsed = Number(anim.id);
        if (Number.isFinite(parsed)) {
            anim.id = parsed;
        }
        else {
            delete anim.id;
        }
    }
    return anim;
}
function normalizeAnimations(list) {
    const normalized = [];
    let hadMissingId = false;
    list.forEach((item) => {
        const anim = normalizeAnimation(item);
        if (anim.id === undefined || anim.id === null) {
            anim.id = generateLocalId();
            hadMissingId = true;
        }
        normalized.push(anim);
    });
    return { list: normalized, hadMissingId };
}
function getMaxId(list) {
    return list.reduce((max, anim) => {
        const value = Number(anim.id);
        return Number.isNaN(value) ? max : Math.max(max, value);
    }, 0);
}
function saveLocalAnimations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(animations));
    localStorage.setItem(STORAGE_ID_KEY, String(nextLocalId));
}
function generateLocalId() {
    const id = nextLocalId;
    nextLocalId += 1;
    return id;
}
function getAnimationById(id) {
    return animations.find(anim => String(anim.id) === String(id));
}
async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed: ${response.status}`);
    }
    return response.json();
}
function applyStorePayload(data) {
    if (!data || !Array.isArray(data.animations))
        return null;
    const normalized = normalizeAnimations(data.animations);
    animations = normalized.list;
    const maxId = getMaxId(animations);
    nextLocalId = Math.max(Number(data.nextId) || 1, maxId + 1);
    saveLocalAnimations();
    renderTable();
    return normalized;
}
async function loadFromCloud() {
    // Legacy cloud API is disabled - now using Supabase (supabase-app.js)
    cloudAvailable = false;
    return false;
}
async function syncAllToCloud(list) {
    if (!cloudAvailable)
        return;
    try {
        const data = await fetchJson(`${CLOUD_ENDPOINT}/replace`, {
            method: 'POST',
            body: JSON.stringify({ animations: list })
        });
        applyStorePayload(data);
    }
    catch (error) {
        cloudAvailable = false;
    }
}
async function addAnimationToStore(animation) {
    if (cloudAvailable) {
        try {
            const data = await fetchJson(`${CLOUD_ENDPOINT}/add`, {
                method: 'POST',
                body: JSON.stringify({ animation })
            });
            if (applyStorePayload(data))
                return;
        }
        catch (error) {
            cloudAvailable = false;
        }
    }
    animation.id = generateLocalId();
    animations.push(animation);
    renderTable();
    if (typeof window !== 'undefined' && typeof window.saveEntry === 'function') {
        await window.saveEntry(animation);
    }
    else {
        saveLocalAnimations();
    }
}
async function updateAnimationInStore(animation) {
    if (cloudAvailable) {
        try {
            const data = await fetchJson(`${CLOUD_ENDPOINT}/update`, {
                method: 'POST',
                body: JSON.stringify({ animation })
            });
            if (applyStorePayload(data))
                return;
        }
        catch (error) {
            cloudAvailable = false;
        }
    }
    const index = animations.findIndex(anim => String(anim.id) === String(animation.id));
    if (index !== -1) {
        animations[index] = animation;
        saveLocalAnimations();
        renderTable();
    }
}
async function deleteAnimationFromStore(id) {
    if (cloudAvailable) {
        try {
            const data = await fetchJson(`${CLOUD_ENDPOINT}/delete`, {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (applyStorePayload(data))
                return;
        }
        catch (error) {
            cloudAvailable = false;
        }
    }
    animations = animations.filter(anim => String(anim.id) !== String(id));
    saveLocalAnimations();
    renderTable();
}
function parseMoney(value) {
    if (value === undefined || value === null)
        return null;
    const parsed = parseFloat(String(value).replace(',', '.').replace('€', '').trim());
    return Number.isNaN(parsed) ? null : parsed;
}
function parseDateValue(value) {
    if (!value)
        return null;
    const text = String(value).trim();
    const parts = text.split('.');
    if (parts.length === 3) {
        const [day, month, year] = parts;
        const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const time = Date.parse(iso);
        return Number.isNaN(time) ? null : time;
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : parsed;
}
function getSortValue(anim, key) {
    switch (key) {
        case 'id':
            return Number(anim.id) || 0;
        case 'datum':
            return parseDateValue(anim.datum);
        case 'show':
            return anim.show || '';
        case 'folge':
            return getFolgeValue(anim);
        case 'type':
            return typeLabels[anim.type] || anim.type || '';
        case 'teilnehmer':
            return anim.teilnehmer || '';
        case 'temperatur':
            return parseMoney(anim.temperatur);
        case 'zeit':
            return anim.zeit || '';
        case 'geldStart':
            return parseMoney(anim.geldStart);
        case 'geldAenderung':
            return anim.geldAenderung || '';
        case 'geldAktuell':
            return parseMoney(anim.geldAktuell);
        case 'stempel':
            return anim.stempel || '';
        case 'textboxText':
            return anim.textboxText || '';
        case 'todoItem':
            return anim.todoItem || '';
        case 'schnittTimestamp':
            return anim.schnittTimestamp || '';
        case 'cutterInfo':
            return anim.cutterInfo || '';
        default:
            return '';
    }
}
function getFilteredAnimations() {
    let list = [...animations];
    const query = filterState.query.trim().toLowerCase();
    if (query) {
        list = list.filter(anim => {
            const fields = [
                anim.id,
                anim.datum,
                anim.show,
                anim.folge,
                anim.sequenz,
                anim.type,
                typeLabels[anim.type],
                getStatusLabel(anim),
                anim.teilnehmer,
                anim.temperatur,
                anim.zeit,
                anim.geldStart,
                anim.geldAenderung,
                anim.geldAktuell,
                anim.stempel,
                anim.textboxText,
                anim.todoItem,
                anim.schnittTimestamp,
                anim.cutterInfo
            ];
            const haystack = fields
                .filter(value => value !== undefined && value !== null)
                .map(value => String(value).toLowerCase())
                .join(' ');
            return haystack.includes(query);
        });
    }
    if (filterState.showOnly) {
        const showValue = document.getElementById('qShow')?.value || '';
        if (showValue) {
            list = list.filter(anim => String(anim.show || '').toLowerCase() === showValue.toLowerCase());
        }
    }
    if (filterState.typeOnly) {
        const typeValue = document.getElementById('qType')?.value || '';
        if (typeValue) {
            list = list.filter(anim => anim.type === typeValue);
        }
    }
    if (filterState.todoOnly) {
        list = list.filter(anim => Boolean(anim.todoItem && String(anim.todoItem).trim()));
    }
    if (filterState.samsungOnly) {
        list = list.filter(anim => anim.type === 'samsung');
    }
    return list;
}
function getSortedAnimations(list = animations) {
    if (!sortState.key)
        return [...list];
    const key = sortState.key;
    const direction = sortState.direction === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
        const valueA = getSortValue(a, key);
        const valueB = getSortValue(b, key);
        if (valueA === null && valueB === null)
            return 0;
        if (valueA === null)
            return 1 * direction;
        if (valueB === null)
            return -1 * direction;
        if (typeof valueA === 'number' && typeof valueB === 'number') {
            return (valueA - valueB) * direction;
        }
        return String(valueA).localeCompare(String(valueB), 'de', { numeric: true }) * direction;
    });
}
function updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const key = th.getAttribute('data-sort');
        if (key === sortState.key) {
            th.setAttribute('data-sort-direction', sortState.direction);
        }
        else {
            th.removeAttribute('data-sort-direction');
        }
    });
}
function toggleSort(key) {
    if (sortState.key === key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    }
    else {
        sortState.key = key;
        sortState.direction = 'asc';
    }
    updateSortIndicators();
    renderTable();
}
function updateFilterChips() {
    const chips = document.querySelectorAll('.chip');
    const showValue = document.getElementById('qShow')?.value || '';
    const typeValue = document.getElementById('qType')?.value || '';
    const typeLabel = typeLabels[typeValue] || typeValue;
    chips.forEach(chip => {
        const filter = chip.dataset?.filter;
        const baseLabel = chip.dataset?.label || chip.textContent || '';
        if (filter === 'show') {
            chip.classList.toggle('active', filterState.showOnly);
            chip.textContent = filterState.showOnly && showValue ? `${baseLabel}: ${showValue}` : baseLabel;
            return;
        }
        if (filter === 'type') {
            chip.classList.toggle('active', filterState.typeOnly);
            chip.textContent = filterState.typeOnly && typeLabel ? `${baseLabel}: ${typeLabel}` : baseLabel;
            return;
        }
        if (filter === 'todo') {
            chip.classList.toggle('active', filterState.todoOnly);
            chip.textContent = baseLabel;
            return;
        }
        if (filter === 'samsung') {
            chip.classList.toggle('active', filterState.samsungOnly);
            chip.textContent = baseLabel;
        }
    });
}
function sanitizeFilePart(value, fallback) {
    const cleaned = String(value || '').trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || fallback;
}
function getExportFileName() {
    const first = animations[0] || {};
    const showFallback = document.getElementById('qShow')?.value || '';
    const folgeFallback = document.getElementById('qSequence')?.value || '';
    const show = sanitizeFilePart((first.show || showFallback).toUpperCase(), 'SHOW');
    const folge = sanitizeFilePart(getFolgeValue(first) || folgeFallback, 'FOLGE');
    const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `${show}_${folge}_${dateStamp}.csv`;
}
function selectType(type) {
    const form = document.getElementById('quickForm');
    document.getElementById('qType').value = type;
    const typeSelect = document.getElementById('typeSelect');
    if (typeSelect)
        typeSelect.value = type;
    form.style.display = 'block';
    form.style.animation = 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    // Update active class in selector
    document.querySelectorAll('.type-item').forEach(item => {
        const onclickValue = item.getAttribute('onclick') || '';
        if (onclickValue.includes(`'${type}'`)) {
            item.classList.add('active');
        }
        else {
            item.classList.remove('active');
        }
    });
    updateFields();
    // Smooth scroll to form
    setTimeout(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}
function showNotification(message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    let icon = 'info';
    const msg = message.toLowerCase();
    if (msg.includes('gespeichert') || msg.includes('heruntergeladen') || msg.includes('dupliziert') || msg.includes('kopiert'))
        icon = 'check_circle';
    if (msg.includes('gelöscht'))
        icon = 'delete_sweep';
    if (msg.includes('keine daten') || msg.includes('fehler'))
        icon = 'warning';
    if (msg.includes('geöffnet'))
        icon = 'mail';
    notification.innerHTML = `
        <span class="material-icons" style="font-size: 20px;">${icon}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}
function toggleTheme() {
    // Dark mode is now the only theme
}
function scrollToEntries() {
    const entriesPanel = document.getElementById('entriesPanel');
    if (entriesPanel) {
        entriesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
function setActiveNav(target) {
    const buttons = document.querySelectorAll('.nav-btn[data-nav]');
    buttons.forEach(button => {
        const key = button.getAttribute('data-nav');
        button.classList.toggle('active', key === target);
    });
}
function setAppView(view) {
    document.body.setAttribute('data-view', view);
    setActiveNav(view);
}
function showPreview(target) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const hint = document.getElementById('previewHint');
    const body = document.getElementById('previewBody');
    if (!modal || !title || !hint || !body)
        return;
    setActiveNav(target);
    if (target === 'login') {
        title.textContent = 'Login · Eigene Einträge';
        hint.textContent = 'Dieser Bereich wird gerade eingerichtet.';
        body.innerHTML = `
            <div class="preview-header">
                <div class="panel-label">MEIN BEREICH</div>
                <span class="badge-count">Eigene Logs</span>
            </div>
            <div class="preview-row"></div>
            <div class="preview-row"></div>
            <div class="preview-row"></div>
        `;
    }
    else if (target === 'cloud') {
        title.textContent = 'Cloud · Alle Einträge';
        hint.textContent = 'Dieser Bereich wird gerade eingerichtet.';
        body.innerHTML = `
            <div class="preview-header">
                <div class="panel-label">TEAM CLOUD</div>
                <span class="badge-count">Community</span>
            </div>
            <div class="preview-row"></div>
            <div class="preview-row"></div>
            <div class="preview-row"></div>
            <div class="preview-row"></div>
        `;
    }
    else if (target === 'chatgpt') {
        title.textContent = 'ChatGPT · Assistenz';
        hint.textContent = '';
        body.classList.remove('preview-dim');
        body.innerHTML = `
            <div class="chat-shell">
                <div class="chat-actions">
                    <div class="panel-label">ASSISTENZ</div>
                    <button class="btn btn-sm" id="chatClearBtn">Clear Chat</button>
                </div>
                <div class="chat-list" id="chatList"></div>
                <div class="chat-error" id="chatError"></div>
                <div class="chat-input">
                    <textarea class="quick-input" id="chatInput" placeholder="Nachricht schreiben..."></textarea>
                    <button class="btn btn-primary" id="chatSendBtn">
                        <span class="material-icons">send</span>
                        Senden
                    </button>
                </div>
            </div>
        `;
        initChatPanel();
    }
    else {
        title.textContent = 'Bereich';
        hint.textContent = 'Dieser Bereich wird gerade eingerichtet.';
        body.innerHTML = `<div class="preview-row"></div>`;
    }
    modal.style.display = 'flex';
}
function hidePreview() {
    const modal = document.getElementById('previewModal');
    if (modal)
        modal.style.display = 'none';
    setActiveNav('home');
}
function showNotReady(label) {
    showNotification(`${label} ist noch nicht eingerichtet`);
}
function toggleGlobalFields() {
    const fields = document.getElementById('globalFields');
    if (fields)
        fields.classList.toggle('visible');
    syncGlobalFieldsToggle();
}
function syncGlobalFieldsToggle() {
    const fields = document.getElementById('globalFields');
    const toggleBtn = document.getElementById('globalFieldsToggle');
    if (!fields || !toggleBtn)
        return;
    toggleBtn.classList.toggle('active', fields.classList.contains('visible'));
}
// Dark mode is now the only theme – no toggle needed
function updateFields() {
    const type = document.getElementById('qType').value;
    const extraFields = document.getElementById('extraFields');
    const dynamicLabel = document.getElementById('dynamicLabel');
    const dynamicField = document.getElementById('dynamicField');
    const dynamicIcon = document.getElementById('dynamicIcon');
    const qValue = document.getElementById('qValue');
    const personGroup = document.getElementById('personFieldGroup');
    const personSelect = document.getElementById('qPerson');
    const quickRow = document.querySelector('.quick-row');
    const globalFields = document.getElementById('globalFields');
    const notesPanel = document.getElementById('notesPanel');
    const notesSummary = notesPanel ? notesPanel.querySelector('summary') : null;
    if (!extraFields || !dynamicLabel || !dynamicField || !qValue || !personGroup || !personSelect)
        return;
    extraFields.innerHTML = '';
    extraFields.style.display = 'none';
    qValue.onblur = null; // Reset blur handler
    qValue.oninput = null; // Reset input handler
    qValue.style.display = 'block';
    dynamicLabel.style.display = 'block';
    dynamicField.style.display = 'flex';
    personGroup.style.display = 'flex';
    personSelect.required = true;
    if (quickRow)
        quickRow.classList.remove('compact');
    if (dynamicIcon)
        dynamicIcon.textContent = 'timer';
    const setNotesPanel = (visible, label, plain = false) => {
        if (!notesPanel)
            return;
        notesPanel.style.display = visible ? 'block' : 'none';
        notesPanel.classList.toggle('notes-plain', plain);
        if (notesSummary)
            notesSummary.textContent = label || '';
        if (visible)
            notesPanel.open = true;
    };
    const formatTimeInput = (value) => {
        const digits = String(value).replace(/\D/g, '').slice(0, 4);
        if (digits.length <= 2)
            return digits;
        if (digits.length === 3) {
            return `${digits.slice(0, 1)}:${digits.slice(1)}`;
        }
        return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    };
    setNotesPanel(false, '');
    switch (type) {
        case 'temperatur':
            dynamicLabel.textContent = 'Temperatur';
            dynamicField.style.display = 'flex';
            if (dynamicIcon)
                dynamicIcon.textContent = 'thermostat';
            qValue.onblur = () => {
                const parsed = Number(qValue.value.replace(',', '.'));
                if (qValue.value && !Number.isNaN(parsed) && !qValue.value.includes('°')) {
                    qValue.value += '°C';
                }
            };
            break;
        case 'zeit':
            dynamicLabel.textContent = 'Zeit';
            dynamicField.style.display = 'flex';
            if (dynamicIcon)
                dynamicIcon.textContent = 'schedule';
            qValue.oninput = () => {
                qValue.value = formatTimeInput(qValue.value);
            };
            break;
        case 'geld':
            dynamicLabel.textContent = 'Start-Betrag';
            dynamicField.style.display = 'none';
            if (dynamicIcon)
                dynamicIcon.textContent = 'payments';
            extraFields.style.display = 'grid';
            extraFields.style.gridTemplateColumns = '1fr';
            extraFields.style.gap = '12px';
            setNotesPanel(true, 'Geld-Änderungen');
            extraFields.innerHTML = `
                    <div class="geld-summary">
                    <div class="field-group">
                        <div class="input-wrap">
                            <span class="material-icons" style="font-size: 18px;">payments</span>
                            <input type="text" class="quick-input" id="geldStartInput" placeholder="Startbetrag z.B. 120,00">
                        </div>
                    </div>
                        <div class="geld-preview" id="geldVorschau">Ergebnis: -</div>
                    </div>
                    <div class="field-group">
                        <div class="geld-list" id="geldList"></div>
                        <button class="btn geld-add" type="button" id="geldAddBtn">
                            <span class="material-icons">add</span> Änderung hinzufügen
                        </button>
                    </div>
                `;
            const geldList = document.getElementById('geldList');
            const geldAddBtn = document.getElementById('geldAddBtn');
            const vorschau = document.getElementById('geldVorschau');
            const startInput = document.getElementById('geldStartInput');
            if (startInput)
                startInput.value = qValue.value;
            const updateRowState = (row) => {
                const typeSelect = row.querySelector('.geld-type');
                const amountInput = row.querySelector('.geld-amount');
                if (!typeSelect || !amountInput)
                    return;
                const isStatus = typeSelect.value === 'status';
                amountInput.disabled = isStatus;
                amountInput.placeholder = isStatus ? '—' : 'Betrag';
                if (isStatus)
                    amountInput.value = '';
            };
            const updateGeldVorschau = () => {
                const startStr = (startInput ? startInput.value : qValue.value).replace(',', '.');
                const start = parseFloat(startStr) || 0;
                let totalChange = 0;
                if (!geldList || !vorschau)
                    return;
                geldList.querySelectorAll('.geld-row').forEach(row => {
                    const typeSelect = row.querySelector('.geld-type');
                    const amountInput = row.querySelector('.geld-amount');
                    if (!typeSelect || !amountInput)
                        return;
                    const typeValue = typeSelect.value;
                    if (typeValue === 'status')
                        return;
                    const amount = parseFloat(amountInput.value.replace(',', '.'));
                    if (Number.isNaN(amount))
                        return;
                    totalChange += typeValue === '+' ? amount : -amount;
                });
                const ergebnis = start + totalChange;
                vorschau.textContent = `Ergebnis: ${ergebnis.toFixed(2)}€`;
            };
            const updateRemoveVisibility = () => {
                if (!geldList)
                    return;
                const rows = geldList.querySelectorAll('.geld-row');
                rows.forEach(row => {
                    const removeBtn = row.querySelector('.geld-remove');
                    if (removeBtn) {
                        const canRemove = rows.length > 1;
                        removeBtn.disabled = !canRemove;
                        removeBtn.style.opacity = canRemove ? '1' : '0.35';
                        removeBtn.style.pointerEvents = canRemove ? 'auto' : 'none';
                    }
                });
            };
            const createGeldRow = () => {
                const row = document.createElement('div');
                row.className = 'geld-row';
                row.innerHTML = `
                        <select class="quick-select geld-type">
                            <option value="+">Geld dazu</option>
                            <option value="-">Geld weg</option>
                            <option value="status">Geld Status</option>
                        </select>
                        <input type="number" step="any" class="quick-input geld-amount" placeholder="Betrag">
                        <button class="action-btn geld-remove" type="button" title="Entfernen">
                            <span class="material-icons" style="font-size: 18px;">close</span>
                        </button>
                    `;
                const typeSelect = row.querySelector('.geld-type');
                const amountInput = row.querySelector('.geld-amount');
                const removeBtn = row.querySelector('.geld-remove');
                if (typeSelect) {
                    typeSelect.addEventListener('change', () => {
                        updateRowState(row);
                        updateGeldVorschau();
                    });
                }
                if (amountInput) {
                    amountInput.addEventListener('input', updateGeldVorschau);
                }
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        row.remove();
                        updateRemoveVisibility();
                        updateGeldVorschau();
                    });
                }
                updateRowState(row);
                return row;
            };
            if (geldList) {
                geldList.appendChild(createGeldRow());
                updateRemoveVisibility();
                updateGeldVorschau();
            }
            if (geldAddBtn) {
                geldAddBtn.addEventListener('click', () => {
                    if (!geldList)
                        return;
                    geldList.appendChild(createGeldRow());
                    updateRemoveVisibility();
                    updateGeldVorschau();
                });
            }
            if (startInput) {
                startInput.addEventListener('input', () => {
                    qValue.value = startInput.value;
                    updateGeldVorschau();
                });
            }
            qValue.oninput = updateGeldVorschau;
            break;
        case 'uebersicht':
            dynamicLabel.textContent = 'Aktuelles Geld';
            dynamicField.style.display = 'flex';
            if (dynamicIcon)
                dynamicIcon.textContent = 'account_balance_wallet';
            extraFields.style.display = 'block';
            setNotesPanel(true, 'Stempel-Auswahl');
            extraFields.innerHTML = `
                    <div class="field-group">
                        <label>Gesammelte Stempel (Städte)</label>
                        <div class="city-grid">
                            <label class="city-checkbox"><input type="checkbox" value="Köln"> Köln</label>
                            <label class="city-checkbox"><input type="checkbox" value="Hamburg"> Hamburg</label>
                            <label class="city-checkbox"><input type="checkbox" value="Berlin"> Berlin</label>
                            <label class="city-checkbox"><input type="checkbox" value="Dresden"> Dresden</label>
                            <label class="city-checkbox"><input type="checkbox" value="München"> München</label>
                        </div>
                    </div>
                `;
            extraFields.querySelectorAll('.city-checkbox').forEach(label => {
                const checkbox = label.querySelector('input');
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        label.classList.toggle('active', checkbox.checked);
                    });
                }
            });
            break;
        case 'textbox':
            dynamicField.style.display = 'none';
            extraFields.style.display = 'block';
            setNotesPanel(true, '', true);
            extraFields.innerHTML = `
                    <textarea class="quick-input" id="qTextContent" rows="4" placeholder="Text eingeben..."></textarea>
                `;
            break;
        case 'ticket':
            dynamicField.style.display = 'none';
            extraFields.style.display = 'block';
            setNotesPanel(true, 'Ticket-Details');
            extraFields.innerHTML = `
                    <div class="ticket-grid">
                        <div class="field-group" style="grid-column: span 2;">
                            <label>Status</label>
                            <label class="city-checkbox ticket-row" style="width: fit-content;">
                                <input type="checkbox" id="qTicketRedeem"> Ticket eingelöst
                            </label>
                        </div>
                        <div class="field-group">
                            <label>Ticketpreis</label>
                            <input type="text" class="quick-input" id="qTicketPrice" placeholder="z.B. 19,90">
                        </div>
                        <div class="field-group">
                            <label>Stadt</label>
                            <input type="text" class="quick-input" id="qTicketCity" placeholder="z.B. Berlin">
                        </div>
                        <div class="field-group" style="grid-column: span 2;">
                            <label>Transport</label>
                            <select class="quick-select" id="qTicketTransport">
                                <option value="">Bitte wählen...</option>
                                <option value="Bus">Bus</option>
                                <option value="Zug">Zug</option>
                                <option value="ICE">ICE</option>
                                <option value="Tram">Tram</option>
                                <option value="U-Bahn">U-Bahn</option>
                                <option value="S-Bahn">S-Bahn</option>
                                <option value="Sonstiges">Sonstiges</option>
                            </select>
                        </div>
                    </div>
                `;
            break;
        case 'todo':
            dynamicField.style.display = 'none';
            extraFields.style.display = 'block';
            setNotesPanel(true, '', true);
            extraFields.innerHTML = `
                    <textarea class="quick-input" id="qTodoContent" rows="5" placeholder="To-Do Eintrag..."></textarea>
                `;
            break;
        case 'samsung':
            personGroup.style.display = 'none';
            personSelect.required = false;
            dynamicField.style.display = 'none';
            extraFields.style.display = 'block';
            setNotesPanel(true, 'Samsung-Details');
            extraFields.innerHTML = `
                    <textarea class="quick-input" id="qSamsungDetail" rows="3" placeholder="Samsung-Animation beschreiben..."></textarea>
                `;
            if (globalFields)
                globalFields.classList.add('visible');
            syncGlobalFieldsToggle();
            if (quickRow)
                quickRow.classList.add('compact');
            break;
        default:
            dynamicField.style.display = 'none';
    }
    // Auto-focus zum nächsten Feld
    setTimeout(() => {
        const personSelect = document.getElementById('qPerson');
        if (personSelect && personSelect.offsetParent !== null)
            personSelect.focus();
    }, 10);
}
function getGeldChangeData() {
    const rows = document.querySelectorAll('.geld-row');
    const changes = [];
    let totalChange = 0;
    rows.forEach(row => {
        const typeSelect = row.querySelector('.geld-type');
        const amountInput = row.querySelector('.geld-amount');
        if (!typeSelect || !amountInput)
            return;
        const typeValue = typeSelect.value;
        if (typeValue === 'status') {
            changes.push('Status');
            return;
        }
        const amount = parseFloat(amountInput.value.replace(',', '.'));
        if (Number.isNaN(amount))
            return;
        totalChange += typeValue === '+' ? amount : -amount;
        changes.push(`${typeValue}${amount}`);
    });
    return { changes, totalChange };
}
async function addAnimation(event) {
    if (event)
        event.preventDefault();
    const type = document.getElementById('qType').value;
    const personSelect = document.getElementById('qPerson');
    const person = personSelect ? personSelect.value : '';
    const showValue = document.getElementById('qShow')?.value || '';
    const folgeValue = document.getElementById('qSequence')?.value || '';
    let animation = {
        datum: new Date().toLocaleDateString('de-DE'),
        show: showValue,
        folge: folgeValue,
        type: type,
        teilnehmer: person,
        farbe: colorMap[person] || '',
        komposition: type,
        temperatur: '',
        zeit: '',
        geldStart: '',
        geldAenderung: '',
        geldAktuell: '',
        stempel: '',
        textboxText: '',
        todoItem: '',
        status: document.getElementById('qStatus')?.value || 'none',
        schnittTimestamp: document.getElementById('qTimestamp')?.value || '',
        cutterInfo: document.getElementById('qCutterInfo')?.value || ''
    };
    const qValueElem = document.getElementById('qValue');
    const qValue = qValueElem ? qValueElem.value : '';
    switch (type) {
        case 'temperatur': {
            let temp = qValue.trim();
            if (temp && !temp.includes('°')) {
                temp += '°C';
            }
            animation.temperatur = temp;
            break;
        }
        case 'zeit':
            animation.zeit = qValue;
            break;
        case 'geld': {
            const startInput = document.getElementById('geldStartInput');
            const startValue = startInput ? startInput.value.trim() : qValue;
            animation.geldStart = startValue;
            const startVal = parseFloat(startValue.replace(',', '.')) || 0;
            const changeData = getGeldChangeData();
            animation.geldAenderung = changeData.changes.join(' | ');
            const result = startVal + changeData.totalChange;
            animation.geldAktuell = result.toFixed(2);
            break;
        }
        case 'uebersicht': {
            animation.geldAktuell = qValue;
            const selectedCities = Array.from(document.querySelectorAll('.city-grid input:checked'))
                .map(cb => cb.value);
            animation.stempel = selectedCities.join(', ');
            break;
        }
        case 'textbox': {
            const textContent = document.getElementById('qTextContent');
            animation.textboxText = textContent ? textContent.value : '';
            break;
        }
        case 'ticket': {
            const ticketRedeem = document.getElementById('qTicketRedeem');
            const ticketPrice = document.getElementById('qTicketPrice');
            const ticketCity = document.getElementById('qTicketCity');
            const ticketTransport = document.getElementById('qTicketTransport');
            const parts = [];
            const status = ticketRedeem && ticketRedeem.checked ? 'Eingelöst' : 'Gekauft';
            parts.push(`Status: ${status}`);
            const rawPrice = ticketPrice ? ticketPrice.value.trim() : '';
            if (rawPrice) {
                const priceText = rawPrice.includes('€') ? rawPrice : `${rawPrice}€`;
                parts.push(`Preis: ${priceText}`);
            }
            const cityText = ticketCity ? ticketCity.value.trim() : '';
            if (cityText)
                parts.push(`Stadt: ${cityText}`);
            const transportText = ticketTransport ? ticketTransport.value.trim() : '';
            if (transportText)
                parts.push(`Transport: ${transportText}`);
            animation.textboxText = parts.join(' · ');
            break;
        }
        case 'todo': {
            const todoContent = document.getElementById('qTodoContent');
            let todo = todoContent ? todoContent.value.trim() : '';
            if (todo) {
                animation.todoItem = todo.split('\n')
                    .filter(line => line.trim() !== '')
                    .map(line => line.trim().startsWith('•') ? line.trim() : '• ' + line.trim())
                    .join('\n');
            }
            break;
        }
        case 'samsung':
            const samsungDetail = document.getElementById('qSamsungDetail');
            animation.textboxText = samsungDetail ? samsungDetail.value.trim() : '';
            animation.teilnehmer = '';
            animation.farbe = '';
            break;
    }
    await addAnimationToStore(animation);
    const keepValuesToggle = document.getElementById('keepValuesToggle');
    const keepValues = Boolean(keepValuesToggle && keepValuesToggle.checked);
    if (!keepValues) {
        // Reset
        if (qValueElem)
            qValueElem.value = '';
        const extraFields = document.getElementById('extraFields');
        if (extraFields && extraFields.style.display !== 'none') {
            const inputs = extraFields.querySelectorAll('input, textarea, select');
            inputs.forEach(i => {
                if (i.type === 'checkbox')
                    i.checked = false;
                else
                    i.value = '';
            });
            extraFields.querySelectorAll('.city-checkbox').forEach(l => l.classList.remove('active'));
        }
        const qTimestamp = document.getElementById('qTimestamp');
        const qCutterInfo = document.getElementById('qCutterInfo');
        if (qTimestamp)
            qTimestamp.value = '';
        if (qCutterInfo)
            qCutterInfo.value = '';
        // Hide form and reset selector
        const quickForm = document.getElementById('quickForm');
        if (quickForm)
            quickForm.style.display = 'none';
        document.querySelectorAll('.type-item').forEach(item => item.classList.remove('active'));
        const typeSelect = document.getElementById('typeSelect');
        if (typeSelect)
            typeSelect.value = '';
    }
    showNotification(`Animation hinzugefügt!`);
    sendNtfyAlert(
        'Neuer Eintrag',
        `${animation.teilnehmer || 'Jemand'} hat einen Eintrag erstellt: ${animation.type} ${animation.textboxText ? '- ' + animation.textboxText.substring(0, 30) : ''}`,
        ['star']
    );
}
function updateStats() {
    const pending = animations.filter(a => a.status === 'draft' || a.status === 'none').length;
    const total = animations.length;
    // Count unique teilnehmer (case insensitive)
    const active = new Set(animations.map(a => a.teilnehmer ? a.teilnehmer.toLowerCase() : '').filter(Boolean)).size;

    const statPending = document.getElementById('statPending');
    const statTotal = document.getElementById('statTotal');
    const statActive = document.getElementById('statActive');

    if (statPending) statPending.innerText = String(pending);
    if (statTotal) statTotal.innerText = String(total);
    if (statActive) statActive.innerText = String(active);
}

function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('dataBody');
    if (!tbody) return;

    updateStats();

    const filtered = getFilteredAnimations();
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

    if (currentPage > totalPages) currentPage = 1;

    // Update Pagination Info
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Zeige ${startItem} - ${endItem} von ${totalItems} Einträgen`;
    }

    // Render Pagination Controls
    const controls = document.getElementById('paginationControls');
    if (controls) {
        controls.innerHTML = `
            <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                <span class="material-icons" style="font-size: 16px;">chevron_left</span>
            </button>
            <span style="font-size: 0.8rem; padding: 0 8px;">Seite ${currentPage} von ${totalPages}</span>
            <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
                <span class="material-icons" style="font-size: 16px;">chevron_right</span>
            </button>
        `;
    }

    // Legacy count update
    const entryCount = document.getElementById('entryCount');
    if (entryCount) entryCount.textContent = String(totalItems);

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <span class="material-icons" style="font-size: 48px; opacity: 0.3;">post_add</span>
                        <h3>Keine Einträge gefunden</h3>
                        <p>Filter anpassen oder neuen Eintrag erstellen.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    const sorted = getSortedAnimations(filtered);
    const sliced = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    tbody.innerHTML = sliced.map(anim => {
        let desc = anim.textboxText || '';
        if (anim.type === 'todo') desc = anim.todoItem || '';
        else if (anim.type === 'ticket') desc = anim.textboxText || ''; // Ticket details are stored here by addAnimation logic
        else if (anim.type === 'samsung') desc = anim.textboxText || '';

        // Truncate description for table view
        const displayDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : (desc || '-');

        return `
        <tr ondblclick="editRow(${anim.id})" data-id="${anim.id}">
            <td>
                <input type="checkbox" class="row-select" data-id="${anim.id}" ${selectedIds.has(Number(anim.id)) ? 'checked' : ''}>
            </td>
            <td style="font-family: monospace; color: var(--text-muted);">${anim.id}</td>
            <td>
                 <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                    <span class="material-icons" style="font-size: 16px; color: var(--text-muted);">${typeIcon[anim.type] || 'category'}</span>
                 </div>
            </td>
            <td>
                <div style="font-weight: 500;">${anim.show || '?'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${getFolgeValue(anim) || '-'}</div>
            </td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">
                ${displayDesc}
            </td>
            <td>
                <button class="status-badge status-${getStatusKey(anim)}" onclick="openStatusMenu(event, ${anim.id})" title="Status ändern">
                    ${getStatusLabel(anim)}
                </button>
            </td>
            <td>
                ${anim.teilnehmer ? `<span class="person-badge ${badgeClass[anim.teilnehmer] || ''}">${anim.teilnehmer}</span>` : '-'}
            </td>
            <td><span class="version-pill">v1</span></td>
             <td>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn" onclick="duplicateRow(${anim.id})" title="Duplicate"><span class="material-icons" style="font-size: 18px;">control_point_duplicate</span></button>
                    <button class="action-btn" onclick="deleteRow(${anim.id})" title="Delete"><span class="material-icons" style="font-size: 18px;">delete</span></button>
                </div>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.row-select').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            const idValue = Number(checkbox.getAttribute('data-id'));
            if (!Number.isNaN(idValue)) {
                if (checkbox.checked)
                    selectedIds.add(idValue);
                else
                    selectedIds.delete(idValue);
                updateDeleteActions();
            }
        });
    });

    updateDeleteActions();
}

function updateDeleteActions() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteSelectedBtn) {
        // Show only if something selected. In new UI, this button is in a hidden container initially or toggled.
        // We'll rely on the container visibility logic or just toggle button display.
        // Wait, the consoleActions container is hidden by default in HTML? checking...
        // "display: none;" on #consoleActions.
        const actionsContainer = document.getElementById('consoleActions');
        if (actionsContainer) {
            actionsContainer.style.display = (selectedIds.size > 0 || animations.length > 0) ? 'flex' : 'none';
        }
        deleteSelectedBtn.style.display = selectedIds.size > 0 ? 'inline-flex' : 'none';
    }
    if (deleteAllBtn) {
        deleteAllBtn.style.display = animations.length > 0 ? 'inline-flex' : 'none';
    }
}

function deleteSelectedEntries() {
    if (selectedIds.size === 0)
        return;
    const confirmed = confirm('Sicher, dass du die ausgewählten Einträge löschen willst?');
    if (!confirmed)
        return;
    animations = animations.filter(anim => !selectedIds.has(Number(anim.id)));
    selectedIds.clear();
    saveLocalAnimations();
    renderTable();
    showNotification('Einträge gelöscht');
}
function deleteAllEntries() {
    if (animations.length === 0)
        return;
    const confirmed = confirm('Sicher, dass du alle Einträge löschen willst?');
    if (!confirmed)
        return;
    animations = [];
    selectedIds.clear();
    saveLocalAnimations();
    renderTable();
    showNotification('Alle Einträge gelöscht');
}
function openStatusMenu(event, id) {
    event.stopPropagation();
    const menu = document.getElementById('statusMenu');
    if (!menu)
        return;
    statusMenuId = id;
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.top = `${rect.bottom + 8 + window.scrollY}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - menu.offsetWidth - 16)}px`;
    menu.querySelectorAll('[data-status]').forEach(btn => {
        const statusValue = btn.getAttribute('data-status');
        btn.classList.toggle('active', statusValue === getStatusKey(getAnimationById(id) || {}));
    });
}
function closeStatusMenu() {
    const menu = document.getElementById('statusMenu');
    if (menu)
        menu.style.display = 'none';
    statusMenuId = null;
}
function setStatusForEntry(status) {
    if (!statusMenuId)
        return;
    const anim = getAnimationById(statusMenuId);
    if (!anim)
        return;
    anim.status = status;
    saveLocalAnimations();
    renderTable();
    closeStatusMenu();
    sendNtfyAlert('Status Update', `Eintrag #${anim.id} - ${anim.komposition || 'Unbekannt'}: Status -> ${status}`, ['pencil']);
}
function sendNtfyAlert(title, message, tags = []) {
    // Einfache Methode ohne Server-Proxy (funktioniert auch lokal mit file://)
    // Wir senden eine "einfache" POST-Nachricht.
    // Damit der Browser nicht blockiert (CORS), nutzen wir mode: 'no-cors'.
    // Nachteil: Wir können keine speziellen Header (Title, Tags) senden,
    // daher schreiben wir den Titel einfach in die Nachricht.

    // Nachricht formatieren: [TITEL] Nachricht
    const simpleBody = `[${title}] ${message}`;

    // Direkt an ntfy.sh senden (Fire & Forget)
    fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
        method: 'POST', // oder PUT
        body: simpleBody,
        mode: 'no-cors' // WICHTIGE Zeile: Verhindert CORS-Fehler
    }).then(() => {
        console.log('Ntfy sent (simple mode)');
    }).catch(err => {
        console.warn('Ntfy Network Error', err);
        // Da 'no-cors' keine Fehler im JS zurückgibt (außer Netzwerk-Totalausfall),
        // sehen wir hier nur echte Verbindungsprobleme.
    });
}
function loadChatHistory() {
    try {
        const stored = localStorage.getItem(CHAT_STORAGE_KEY);
        chatHistory = stored ? JSON.parse(stored) : [];
    }
    catch (error) {
        chatHistory = [];
    }
}
function saveChatHistory() {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
}
function renderChatMessages() {
    const list = document.getElementById('chatList');
    if (!list)
        return;
    list.innerHTML = chatHistory.map(msg => `
        <div class="chat-bubble ${msg.role}">${msg.content}</div>
    `).join('');
    list.scrollTop = list.scrollHeight;
}
function setChatError(message) {
    const errorEl = document.getElementById('chatError');
    if (errorEl)
        errorEl.textContent = message || '';
}
function setChatLoading(loading) {
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    if (sendBtn)
        sendBtn.disabled = loading;
    if (input)
        input.disabled = loading;
    chatBusy = loading;
}
async function sendChatMessage() {
    if (chatBusy)
        return;
    const input = document.getElementById('chatInput');
    if (!input)
        return;
    const text = input.value.trim();
    if (!text)
        return;
    setChatError('');
    chatHistory.push({ role: 'user', content: text });
    saveChatHistory();
    renderChatMessages();
    input.value = '';
    const typingMessage = { role: 'assistant', content: 'tippt…' };
    chatHistory.push(typingMessage);
    renderChatMessages();
    setChatLoading(true);
    try {
        const response = await fetch('/.netlify/functions/ai_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory.filter(msg => msg.content !== 'tippt…') })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || 'Unbekannter Fehler');
        }
        chatHistory = chatHistory.filter(msg => msg.content !== 'tippt…');
        chatHistory.push({ role: 'assistant', content: data.reply || '' });
        saveChatHistory();
        renderChatMessages();
    }
    catch (error) {
        chatHistory = chatHistory.filter(msg => msg.content !== 'tippt…');
        renderChatMessages();
        setChatError(`Fehler: ${error.message || error}`);
    }
    finally {
        setChatLoading(false);
    }
}
function initChatPanel() {
    loadChatHistory();
    renderChatMessages();
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const clearBtn = document.getElementById('chatClearBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            void sendChatMessage();
        });
    }
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendChatMessage();
            }
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            chatHistory = [];
            saveChatHistory();
            renderChatMessages();
            setChatError('');
        });
    }
}
function editRow(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    const anim = getAnimationById(id);
    if (!anim) return;

    row.classList.add('editing');

    const personOptions = PERSON_NAMES
        .map(name => `<option value="${name}" ${anim.teilnehmer === name ? 'selected' : ''}>${name}</option>`)
        .join('');

    // Cells: [Checkbox, ID, Preview, Shot ID, Description, Status, Artist, Version, Actions]
    row.innerHTML = `
        <td><input type="checkbox" disabled></td>
        <td style="font-family: monospace; color: var(--text-muted);">${anim.id}</td>
        <td>
             <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                <span class="material-icons" style="font-size: 16px; color: var(--text-muted);">${typeIcon[anim.type] || 'category'}</span>
             </div>
        </td>
        <td>
            <div style="display: flex; gap: 4px;">
                <input type="text" value="${anim.show || ''}" data-field="show" style="width: 50px;" placeholder="Show">
                <input type="text" value="${getFolgeValue(anim)}" data-field="folge" style="width: 60px;" placeholder="Shot">
            </div>
        </td>
        <td class="editable-cell">
            <textarea data-field="textboxText" placeholder="Description/Notes" style="width: 100%;">${anim.textboxText || anim.todoItem || ''}</textarea>
        </td>
        <td>
             <button class="status-badge status-${getStatusKey(anim)}" onclick="openStatusMenu(event, ${anim.id})" title="Status ändern">
                ${getStatusLabel(anim)}
            </button>
        </td>
        <td class="editable-cell">
             <select data-field="teilnehmer" ${anim.type === 'samsung' ? 'disabled' : ''}>
                <option value="">-</option>
                ${personOptions}
            </select>
        </td>
        <td><span class="version-pill">v1</span></td>
        <td>
            <div style="display: flex; gap: 4px;">
                <button class="action-btn" onclick="saveEdit(${anim.id})" title="Save"><span class="material-icons" style="font-size: 18px;">save</span></button>
                <button class="action-btn" onclick="cancelEdit()" title="Cancel"><span class="material-icons" style="font-size: 18px;">close</span></button>
            </div>
        </td>
    `;

    const firstInput = row.querySelector('input');
    if (firstInput) firstInput.focus();

    row.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveEdit(id);
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        });
    });
}
async function saveEdit(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row)
        return;
    const anim = getAnimationById(id);
    if (!anim)
        return;
    const inputs = row.querySelectorAll('[data-field]');
    inputs.forEach(input => {
        const field = input.getAttribute('data-field');
        let value = input.value;
        if (field === 'todoItem' && value.trim()) {
            value = value.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => line.trim().startsWith('•') ? line.trim() : '• ' + line.trim())
                .join('\n');
        }
        anim[field] = value;
    });
    if (anim.folge !== undefined) {
        delete anim.sequenz;
    }
    if (anim.teilnehmer) {
        anim.farbe = colorMap[anim.teilnehmer] || '';
    }
    else {
        anim.farbe = '';
    }
    await updateAnimationInStore(anim);
    showNotification('Änderungen gespeichert!');
}
function cancelEdit() {
    renderTable();
}
async function duplicateRow(id) {
    const original = getAnimationById(id);
    if (!original)
        return;
    const copy = JSON.parse(JSON.stringify(original));
    delete copy.id;
    await addAnimationToStore(copy);
    showNotification('Animation dupliziert!');
}
async function deleteRow(id) {
    if (confirm('Diese Animation wirklich löschen?')) {
        await deleteAnimationFromStore(id);
        selectedIds.delete(Number(id));
        showNotification('Animation gelöscht!');
    }
}
function saveAndRender() {
    const maxId = getMaxId(animations);
    nextLocalId = Math.max(nextLocalId, maxId + 1);
    saveLocalAnimations();
    renderTable();
    if (cloudAvailable) {
        void syncAllToCloud(animations);
    }
}
function generateCSV() {
    const escapeCSV = (text) => {
        if (text === null || text === undefined)
            return '';
        const stringValue = String(text);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    };
    return [
        SHEET_HEADERS.join(','),
        ...buildAnimationRows(animations).map(row => row.map(escapeCSV).join(','))
    ].join('\n');
}
function generateTSV() {
    const escapeTSV = (text) => {
        if (text === null || text === undefined)
            return '';
        return String(text).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    };
    return [
        SHEET_HEADERS.join('\t'),
        ...buildAnimationRows(animations).map(row => row.map(escapeTSV).join('\t'))
    ].join('\n');
}
function generateJSON() {
    return JSON.stringify(animations, null, 2);
}
function showExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal)
        modal.style.display = 'flex';
}
function hideExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal)
        modal.style.display = 'none';
}
function handleExport(format) {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Exportieren!');
        return;
    }
    let content = '';
    let mime = 'text/plain;charset=utf-8;';
    let extension = format;
    if (format === 'tsv') {
        content = generateTSV();
        mime = 'text/tab-separated-values;charset=utf-8;';
        extension = 'tsv';
    }
    else if (format === 'json') {
        content = generateJSON();
        mime = 'application/json;charset=utf-8;';
        extension = 'json';
    }
    else {
        content = generateCSV();
        mime = 'text/csv;charset=utf-8;';
        extension = 'csv';
    }
    const baseName = getExportFileName().replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.${extension}`;
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    showNotification(`${extension.toUpperCase()}-Datei wurde heruntergeladen!`);
    hideExportModal();
}
// Game Logic
let isGameRunning = false;
let currentGameId = 0;
let gameScore;
let gameSpeed;
let obstacleTimer;
let collisionTimer;
let dinoRunTimer;
const DINO_ASSETS = {
    run: [
        'assets/dino/DinoRun1.png',
        'assets/dino/DinoRun2.png'
    ],
    jump: 'assets/dino/DinoJump.png',
    dead: 'assets/dino/DinoDead.png'
};
const BIRD_FRAMES = [
    'assets/bird/Bird1.png',
    'assets/bird/Bird2.png'
];
const CACTUS_SMALL = [
    'assets/cactus/SmallCactus1.png',
    'assets/cactus/SmallCactus2.png',
    'assets/cactus/SmallCactus3.png'
];
const CACTUS_LARGE = [
    'assets/cactus/LargeCactus1.png',
    'assets/cactus/LargeCactus2.png',
    'assets/cactus/LargeCactus3.png'
];
function setDinoImage(src) {
    const dinoImg = document.getElementById('dinoImg');
    if (dinoImg)
        dinoImg.src = src;
}
function startRunAnimation() {
    clearInterval(dinoRunTimer);
    let frame = 0;
    setDinoImage(DINO_ASSETS.run[frame]);
    dinoRunTimer = setInterval(() => {
        if (!isGameRunning)
            return;
        frame = (frame + 1) % DINO_ASSETS.run.length;
        setDinoImage(DINO_ASSETS.run[frame]);
    }, 140);
}
function stopRunAnimation() {
    clearInterval(dinoRunTimer);
}
function showGameModal() {
    const modal = document.getElementById('gameModal');
    if (modal) {
        modal.style.display = 'flex';
        startGame();
    }
}
function hideGameModal() {
    const modal = document.getElementById('gameModal');
    if (modal) {
        modal.style.display = 'none';
        stopGame();
    }
}
function startGame() {
    currentGameId++;
    const gameId = currentGameId;
    isGameRunning = true;
    gameScore = 0;
    gameSpeed = 6;
    updateScore(0);
    startRunAnimation();
    const gameOverScreen = document.getElementById('gameOverScreen');
    if (gameOverScreen)
        gameOverScreen.style.display = 'none';
    const objective = document.getElementById('gameObjective');
    if (objective)
        objective.innerHTML = '';
    const dino = document.getElementById('dino');
    if (dino) {
        dino.classList.remove('jump-anim');
        // Sicherstellen, dass der Dino am Boden ist
        dino.style.bottom = '10px';
    }
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    // Kleiner Delay vor dem ersten Obstacle für besseres Spielgefühl
    obstacleTimer = setTimeout(() => {
        if (isGameRunning && gameId === currentGameId) {
            spawnObstacle();
        }
    }, 300);
    collisionTimer = setInterval(() => {
        if (isGameRunning && gameId === currentGameId)
            checkCollision();
    }, 10);
}
function stopGame() {
    isGameRunning = false;
    stopRunAnimation();
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    const objective = document.getElementById('gameObjective');
    if (objective)
        objective.innerHTML = '';
}
function jump() {
    const dino = document.getElementById('dino');
    if (dino && !dino.classList.contains('jump-anim') && isGameRunning) {
        stopRunAnimation();
        setDinoImage(DINO_ASSETS.jump);
        dino.classList.add('jump-anim');
        setTimeout(() => {
            dino.classList.remove('jump-anim');
            if (isGameRunning)
                startRunAnimation();
        }, 600);
    }
}
function spawnObstacle() {
    if (!isGameRunning)
        return;
    createObstacle(currentGameId);
    const minDelay = Math.max(600, 1500 - (gameScore * 5));
    const maxDelay = Math.max(1000, 3000 - (gameScore * 8));
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
    obstacleTimer = setTimeout(spawnObstacle, delay);
}
function createObstacle(gameId) {
    const objective = document.getElementById('gameObjective');
    if (!objective)
        return;
    const obstacle = document.createElement('div');
    const isBird = Math.random() < 0.2;
    let type;
    if (isBird) {
        type = 'bird';
    }
    else {
        const cactusTypes = ['cactus-small', 'cactus-large'];
        type = cactusTypes[Math.floor(Math.random() * cactusTypes.length)];
    }
    obstacle.className = `obstacle ${type}`;
    const img = document.createElement('img');
    img.alt = type === 'bird' ? 'Bird' : 'Cactus';
    if (type === 'bird') {
        const birdHeights = [45, 70];
        const height = birdHeights[Math.floor(Math.random() * birdHeights.length)];
        obstacle.style.bottom = `${height}px`;
        let frame = 0;
        img.src = BIRD_FRAMES[frame];
        obstacle._flapTimer = setInterval(() => {
            frame = (frame + 1) % BIRD_FRAMES.length;
            img.src = BIRD_FRAMES[frame];
        }, 200);
    }
    else if (type === 'cactus-large') {
        img.src = CACTUS_LARGE[Math.floor(Math.random() * CACTUS_LARGE.length)];
    }
    else {
        img.src = CACTUS_SMALL[Math.floor(Math.random() * CACTUS_SMALL.length)];
    }
    obstacle.appendChild(img);
    objective.appendChild(obstacle);
    let position = -50;
    const currentSpeed = gameSpeed;
    const moveInterval = setInterval(() => {
        if (!isGameRunning || gameId !== currentGameId) {
            clearInterval(moveInterval);
            if (obstacle._flapTimer)
                clearInterval(obstacle._flapTimer);
            obstacle.remove();
            return;
        }
        position += currentSpeed;
        obstacle.style.right = position + 'px';
        if (position > 550) {
            clearInterval(moveInterval);
            if (obstacle._flapTimer)
                clearInterval(obstacle._flapTimer);
            obstacle.remove();
            if (isGameRunning && gameId === currentGameId) {
                gameScore++;
                updateScore(gameScore);
                if (gameScore % 5 === 0)
                    gameSpeed += 0.15;
            }
        }
    }, 20);
}
function updateScore(score) {
    const scoreElem = document.getElementById('gameScore');
    if (scoreElem)
        scoreElem.textContent = score.toString().padStart(5, '0');
}
function checkCollision() {
    const dino = document.getElementById('dino');
    const obstacles = document.querySelectorAll('.obstacle');
    if (!dino)
        return;
    const dinoRect = dino.getBoundingClientRect();
    obstacles.forEach(obstacle => {
        const obsRect = obstacle.getBoundingClientRect();
        if (dinoRect.left < obsRect.right &&
            dinoRect.right > obsRect.left &&
            dinoRect.top < obsRect.bottom &&
            dinoRect.bottom > obsRect.top) {
            gameOver();
        }
    });
}
function gameOver() {
    isGameRunning = false;
    stopRunAnimation();
    setDinoImage(DINO_ASSETS.dead);
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    const gameOverScreen = document.getElementById('gameOverScreen');
    const finalScore = document.getElementById('finalScore');
    if (gameOverScreen)
        gameOverScreen.style.display = 'flex';
    if (finalScore)
        finalScore.textContent = `SCORE: ${gameScore.toString().padStart(5, '0')}`;
}
// Export functions used by inline HTML handlers.
//noinspection JSUnusedGlobalSymbols
Object.assign(window, {
    setAppView,
    showPreview,
    hidePreview,
    showNotReady,
    showExportModal,
    hideExportModal,
    handleExport,
    deleteSelectedEntries,
    deleteAllEntries,
    openStatusMenu,
    setStatusForEntry,
    scrollToEntries,
    toggleTheme,
    showGameModal,
    hideGameModal,
    selectType,
    toggleGlobalFields,
    showSheetsModal,
    hideSheetsModal,
    handleAuthClick,
    handleSignoutClick,
    saveSheetsSettings,
    pushToGoogleSheets,
    pullFromGoogleSheets,
    startGame,
    jump,
    saveEdit,
    cancelEdit,
    duplicateRow,
    deleteRow,
    changePage,
    initFilterListeners
});

function initFilterListeners() {
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const filterType = chip.dataset.filter;
            const label = chip.getAttribute('data-label') || '';
            const showInput = document.getElementById('qShow');

            // Reset other filter states
            filterState.showOnly = false;
            filterState.typeOnly = false;
            filterState.todoOnly = false;
            filterState.samsungOnly = false;

            if (filterType === 'all') {
                // No specific filter
            } else if (filterType === 'show') {
                filterState.showOnly = true;
                if (showInput) {
                    if (label.includes('WCC')) showInput.value = 'WCC';
                    if (label.includes('TR3')) showInput.value = 'TR3';
                }
            }

            currentPage = 1;
            renderTable();
        });
    });
}
// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    const quickForm = document.getElementById('quickForm');
    if (quickForm) {
        quickForm.addEventListener('submit', addAnimation);
    }
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const sheetsModal = document.getElementById('sheetsModal');
        const gameModal = document.getElementById('gameModal');
        const previewModal = document.getElementById('previewModal');
        const exportModal = document.getElementById('exportModal');
        if (event.target === sheetsModal) {
            hideSheetsModal();
        }
        if (event.target === gameModal) {
            hideGameModal();
        }
        if (event.target === previewModal) {
            hidePreview();
        }
        if (event.target === exportModal) {
            hideExportModal();
        }
        const targetEl = event.target;
        if (targetEl && !targetEl.closest('#statusMenu') && !targetEl.closest('.status-badge')) {
            closeStatusMenu();
        }
    });
    // Space to jump or restart
    document.addEventListener('keydown', (e) => {
        const gameModal = document.getElementById('gameModal');
        if (e.code === 'Space' && gameModal && gameModal.style.display === 'flex') {
            e.preventDefault();
            const gameOverScreen = document.getElementById('gameOverScreen');
            if (gameOverScreen && gameOverScreen.style.display === 'flex') {
                startGame(); // Restart if game over
            }
            else {
                jump(); // Jump if game running
            }
        }
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const normalized = normalizeAnimations(stored);
    animations = normalized.list;
    const maxId = getMaxId(animations);
    nextLocalId = Math.max(nextLocalId, maxId + 1);
    if (normalized.hadMissingId) {
        saveLocalAnimations();
    }
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const sortKey = th.getAttribute('data-sort');
        if (sortKey) {
            th.addEventListener('click', () => toggleSort(sortKey));
        }
    });
    renderTable();
    updateSortIndicators();
    initFilterListeners();
    await loadFromCloud();
});
// UI-only enhancements for the v2 experiment.
(() => {
    const entryCount = document.getElementById('entryCount');
    const dataBody = document.getElementById('dataBody');
    const autoDate = document.getElementById('autoDate');
    const composerHint = document.getElementById('composerHint');
    const quickForm = document.getElementById('quickForm');
    const notesPanel = document.getElementById('notesPanel');
    const extraFields = document.getElementById('extraFields');
    const consoleSearchInput = document.getElementById('consoleSearchInput');
    const filterChips = document.querySelectorAll('.chip');
    const showSelect = document.getElementById('qShow');
    const typeSelect = document.getElementById('typeSelect');
    const sequenceInput = document.getElementById('qSequence');
    const statusButtons = document.querySelectorAll('[data-status-select]');
    const statusInput = document.getElementById('qStatus');
    if (autoDate) {
        const today = new Date();
        autoDate.value = today.toLocaleDateString('de-DE');
    }
    syncGlobalFieldsToggle();
    setAppView('home');
    const updateCount = () => {
        if (!entryCount || !dataBody)
            return;
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
            }
            else {
                composerHint.style.display = '';
            }
        };
        syncHint();
        const formObserver = new MutationObserver(syncHint);
        formObserver.observe(quickForm, { attributes: true, attributeFilter: ['style'] });
    }
    const syncSearchInputs = (value) => {
        filterState.query = value;
        if (consoleSearchInput)
            consoleSearchInput.value = value;
        renderTable();
    };
    if (consoleSearchInput) {
        consoleSearchInput.addEventListener('input', (event) => {
            syncSearchInputs(event.target.value);
        });
    }
    // Old filter logic removed in favor of initFilterListeners
    if (showSelect) {
        showSelect.addEventListener('change', () => {
            updateFilterChips();
            if (filterState.showOnly)
                renderTable();
        });
    }
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            updateFilterChips();
            if (filterState.typeOnly)
                renderTable();
        });
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
    if (sequenceInput) {
        const normalizeEpisode = (value) => {
            const trimmed = String(value).trim();
            if (!trimmed)
                return '';
            const upper = trimmed.toUpperCase();
            if (upper.startsWith('EP')) {
                return upper;
            }
            return trimmed;
        };
        const formatEpisode = (value) => {
            const digits = String(value).replace(/\D/g, '').slice(0, 2);
            if (!digits)
                return '';
            return `EP${digits.padStart(2, '0')}`;
        };
        sequenceInput.addEventListener('input', () => {
            sequenceInput.value = normalizeEpisode(sequenceInput.value);
        });
        sequenceInput.addEventListener('blur', () => {
            if (/^\d+$/.test(sequenceInput.value.trim())) {
                sequenceInput.value = formatEpisode(sequenceInput.value);
            }
        });
    }
    if (statusButtons.length && statusInput) {
        statusButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const statusValue = btn.getAttribute('data-status-select');
                if (!statusValue)
                    return;
                statusInput.value = statusValue;
                statusButtons.forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    updateFilterChips();
})();
