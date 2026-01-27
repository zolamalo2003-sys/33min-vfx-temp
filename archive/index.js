/* global gapi, google */
/** @type {any} */
let gapi;
/** @type {any} */
let google;

/**
 * @typedef {Object} Animation
 * @property {number} [id]
 * @property {string} [datum]
 * @property {string} [show]
 * @property {string} [folge]
 * @property {string} [sequenz]
 * @property {string} [type]
 * @property {string} [teilnehmer]
 * @property {string} [farbe]
 * @property {string} [komposition]
 * @property {string} [temperatur]
 * @property {string} [zeit]
 * @property {string} [geldStart]
 * @property {string} [geldAenderung]
 * @property {string} [geldAktuell]
 * @property {string} [stempel]
 * @property {string} [textboxText]
 * @property {string} [todoItem]
 * @property {string} [schnittTimestamp]
 * @property {string} [cutterInfo]
 */
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

let cloudAvailable = false;
let nextLocalId = Number.parseInt(localStorage.getItem(STORAGE_ID_KEY) || '1', 10);
let sortState = { key: null, direction: 'asc' };

/** @type {any} */
let tokenClient;
let spreadsheetId = localStorage.getItem('googleSpreadsheetId') || '';

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
    if (!statusDiv || !authBtn || !actionsDiv) return;

    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    const token = gapi.client.getToken();
    if (token) {
        statusDiv.innerHTML = `<span class="material-icons" style="color: #0f9d58;">check_circle</span> <span>Verbunden</span>`;
        authBtn.innerHTML = `<span class="material-icons">logout</span> Abmelden`;
        authBtn.onclick = handleSignoutClick;
        actionsDiv.style.display = 'flex';
    } else {
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
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        //noinspection JSUnresolvedFunction
        tokenClient.requestAccessToken({prompt: ''});
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
    if (modal) modal.style.display = 'none';
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
    } catch (err) {
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
    } catch (err) {
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

const SHEET_HEADERS = ['ID', 'Datum', 'Show', 'Folge', 'Teilnehmer', 'Farbe', 'Komposition', 'Temperatur', 'Zeit', 'Geld_Start', 'Geld_Änderung', 'Geld_Aktuell', 'Stempel', 'TextBox_Text', 'ToDo_Item', 'Schnitt_Zeitstempel', 'Cutter_Info'];
/** @type {string[]} */
const SHEET_FIELDS = ['id', 'datum', 'show', 'folge', 'teilnehmer', 'farbe', 'komposition', 'temperatur', 'zeit', 'geldStart', 'geldAenderung', 'geldAktuell', 'stempel', 'textboxText', 'todoItem', 'schnittTimestamp', 'cutterInfo'];

function getFolgeValue(anim) {
    return anim.folge || anim.sequenz || '';
}

/**
 * @param {Animation} anim
 * @param {string} field
 * @returns {string}
 */
function getAnimationFieldValue(anim, field) {
    if (field === 'folge') return getFolgeValue(anim);
    const value = /** @type {any} */ (anim)[field];
    return value === undefined || value === null ? '' : String(value);
}

/**
 * @param {Animation[]} list
 * @returns {string[][]}
 */
function buildAnimationRows(list) {
    return list.map(anim => SHEET_FIELDS.map(field => getAnimationFieldValue(anim, field)));
}

/** @type {Animation[]} */
let animations = [];

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
        } else {
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
        headers: {'Content-Type': 'application/json'},
        ...options
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed: ${response.status}`);
    }
    return response.json();
}

function applyStorePayload(data) {
    if (!data || !Array.isArray(data.animations)) return null;
    const normalized = normalizeAnimations(data.animations);
    animations = normalized.list;
    const maxId = getMaxId(animations);
    nextLocalId = Math.max(Number(data.nextId) || 1, maxId + 1);
    saveLocalAnimations();
    renderTable();
    return normalized;
}

async function loadFromCloud() {
    try {
        const data = await fetchJson(CLOUD_ENDPOINT);
        const normalized = applyStorePayload(data);
        if (!normalized) return false;
        cloudAvailable = true;
        if (normalized.hadMissingId) {
            await syncAllToCloud(animations);
        }
        return true;
    } catch (error) {
        cloudAvailable = false;
        return false;
    }
}

async function syncAllToCloud(list) {
    if (!cloudAvailable) return;
    try {
        const data = await fetchJson(`${CLOUD_ENDPOINT}/replace`, {
            method: 'POST',
            body: JSON.stringify({ animations: list })
        });
        applyStorePayload(data);
    } catch (error) {
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
            if (applyStorePayload(data)) return;
        } catch (error) {
            cloudAvailable = false;
        }
    }

    animation.id = generateLocalId();
    animations.push(animation);
    saveLocalAnimations();
    renderTable();
}

async function updateAnimationInStore(animation) {
    if (cloudAvailable) {
        try {
            const data = await fetchJson(`${CLOUD_ENDPOINT}/update`, {
                method: 'POST',
                body: JSON.stringify({ animation })
            });
            if (applyStorePayload(data)) return;
        } catch (error) {
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
            if (applyStorePayload(data)) return;
        } catch (error) {
            cloudAvailable = false;
        }
    }

    animations = animations.filter(anim => String(anim.id) !== String(id));
    saveLocalAnimations();
    renderTable();
}

function parseMoney(value) {
    if (value === undefined || value === null) return null;
    const parsed = parseFloat(String(value).replace(',', '.').replace('€', '').trim());
    return Number.isNaN(parsed) ? null : parsed;
}

function parseDateValue(value) {
    if (!value) return null;
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

function getSortedAnimations() {
    if (!sortState.key) return [...animations];
    const key = sortState.key;
    const direction = sortState.direction === 'desc' ? -1 : 1;
    return [...animations].sort((a, b) => {
        const valueA = getSortValue(a, key);
        const valueB = getSortValue(b, key);
        if (valueA === null && valueB === null) return 0;
        if (valueA === null) return 1 * direction;
        if (valueB === null) return -1 * direction;
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
        } else {
            th.removeAttribute('data-sort-direction');
        }
    });
}

function toggleSort(key) {
    if (sortState.key === key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = key;
        sortState.direction = 'asc';
    }
    updateSortIndicators();
    renderTable();
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
    form.style.display = 'block';
    form.style.animation = 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // Update active class in selector
    document.querySelectorAll('.type-item').forEach(item => {
        const onclickValue = item.getAttribute('onclick') || '';
        if (onclickValue.includes(`'${type}'`)) {
            item.classList.add('active');
        } else {
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
    if (msg.includes('gespeichert') || msg.includes('heruntergeladen') || msg.includes('dupliziert') || msg.includes('kopiert')) icon = 'check_circle';
    if (msg.includes('gelöscht')) icon = 'delete_sweep';
    if (msg.includes('keine daten') || msg.includes('fehler')) icon = 'warning';
    if (msg.includes('geöffnet')) icon = 'mail';

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
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function toggleGlobalFields() {
    const fields = document.getElementById('globalFields');
    if (fields) fields.classList.toggle('visible');
}

// Load saved theme state
if (localStorage.getItem('theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
}

function updateFields() {
    const type = document.getElementById('qType').value;
    const extraFields = document.getElementById('extraFields');
    const dynamicLabel = document.getElementById('dynamicLabel');
    const dynamicField = document.getElementById('dynamicField');
    const qValue = document.getElementById('qValue');
    const personGroup = document.getElementById('personFieldGroup');
    const personSelect = document.getElementById('qPerson');
    const quickRow = document.querySelector('.quick-row');
    const globalFields = document.getElementById('globalFields');

    if (!extraFields || !dynamicLabel || !dynamicField || !qValue || !personGroup || !personSelect) return;

    extraFields.innerHTML = '';
    extraFields.style.display = 'none';
    qValue.onblur = null; // Reset blur handler
    qValue.oninput = null; // Reset input handler
    qValue.style.display = 'block';
    dynamicLabel.style.display = 'block';
    dynamicField.style.display = 'flex';
    personGroup.style.display = 'flex';
    personSelect.required = true;
    if (quickRow) quickRow.classList.remove('compact');

    switch(type) {
        case 'temperatur':
            dynamicLabel.textContent = 'Temperatur';
            dynamicField.style.display = 'flex';
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
            break;
        case 'geld':
            dynamicLabel.textContent = 'Start-Betrag';
            dynamicField.style.display = 'flex';
            extraFields.style.display = 'grid';
            extraFields.style.gridTemplateColumns = '1fr 1fr';
            extraFields.style.gap = '10px';
            extraFields.innerHTML = `
                    <div class="field-group" style="grid-column: span 2;">
                        <label>Was passiert?</label>
                        <div class="geld-list" id="geldList"></div>
                        <button class="btn geld-add" type="button" id="geldAddBtn">
                            <span class="material-icons">add</span> Änderung hinzufügen
                        </button>
                    </div>
                    <div class="geld-preview" id="geldVorschau">Ergebnis: -</div>
                `;
            const geldList = document.getElementById('geldList');
            const geldAddBtn = document.getElementById('geldAddBtn');
            const vorschau = document.getElementById('geldVorschau');

            const updateRowState = (row) => {
                const typeSelect = row.querySelector('.geld-type');
                const amountInput = row.querySelector('.geld-amount');
                if (!typeSelect || !amountInput) return;
                const isStatus = typeSelect.value === 'status';
                amountInput.disabled = isStatus;
                amountInput.placeholder = isStatus ? '—' : 'Betrag';
                if (isStatus) amountInput.value = '';
            };

            const updateGeldVorschau = () => {
                const startStr = qValue.value.replace(',', '.');
                const start = parseFloat(startStr) || 0;
                let totalChange = 0;
                if (!geldList || !vorschau) return;
                geldList.querySelectorAll('.geld-row').forEach(row => {
                    const typeSelect = row.querySelector('.geld-type');
                    const amountInput = row.querySelector('.geld-amount');
                    if (!typeSelect || !amountInput) return;
                    const typeValue = typeSelect.value;
                    if (typeValue === 'status') return;
                    const amount = parseFloat(amountInput.value.replace(',', '.'));
                    if (Number.isNaN(amount)) return;
                    totalChange += typeValue === '+' ? amount : -amount;
                });
                const ergebnis = start + totalChange;
                vorschau.textContent = `Ergebnis: ${ergebnis.toFixed(2)}€`;
            };

            const updateRemoveVisibility = () => {
                if (!geldList) return;
                const rows = geldList.querySelectorAll('.geld-row');
                rows.forEach(row => {
                    const removeBtn = row.querySelector('.geld-remove');
                    if (removeBtn) {
                        removeBtn.style.visibility = rows.length > 1 ? 'visible' : 'hidden';
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
                    if (!geldList) return;
                    geldList.appendChild(createGeldRow());
                    updateRemoveVisibility();
                    updateGeldVorschau();
                });
            }
            qValue.oninput = updateGeldVorschau;
            break;
        case 'uebersicht':
            dynamicLabel.textContent = 'Aktuelles Geld';
            dynamicField.style.display = 'flex';
            extraFields.style.display = 'block';
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
            extraFields.innerHTML = `
                    <div class="field-group">
                        <label>Text-Inhalt</label>
                        <textarea class="quick-input" id="qTextContent" rows="3"></textarea>
                    </div>
                `;
            break;
        case 'ticket':
            dynamicField.style.display = 'none';
            extraFields.style.display = 'block';
            extraFields.innerHTML = `
                    <div class="field-group">
                        <label>Ticket Inhalt</label>
                        <textarea class="quick-input" id="qTicketContent" rows="3"></textarea>
                    </div>
                `;
            break;
        case 'todo':
            dynamicLabel.textContent = 'Aufgabe';
            qValue.style.display = 'none';
            dynamicLabel.style.display = 'none';
            extraFields.style.display = 'block';
            extraFields.innerHTML = `
                    <div class="field-group">
                        <label>To-Do Liste (Jeder Absatz bekommt ein •)</label>
                        <textarea class="quick-input" id="qTodoContent" rows="5"></textarea>
                    </div>
                `;
            break;
        case 'samsung':
            personGroup.style.display = 'none';
            personSelect.required = false;
            dynamicField.style.display = 'none';
            extraFields.style.display = 'none';
            if (globalFields) globalFields.classList.add('visible');
            if (quickRow) quickRow.classList.add('compact');
            break;
        default:
            dynamicField.style.display = 'none';
    }

    // Auto-focus zum nächsten Feld
    setTimeout(() => {
        const personSelect = document.getElementById('qPerson');
        if (personSelect && personSelect.offsetParent !== null) personSelect.focus();
    }, 10);
}

function getGeldChangeData() {
    const rows = document.querySelectorAll('.geld-row');
    const changes = [];
    let totalChange = 0;
    rows.forEach(row => {
        const typeSelect = row.querySelector('.geld-type');
        const amountInput = row.querySelector('.geld-amount');
        if (!typeSelect || !amountInput) return;
        const typeValue = typeSelect.value;
        if (typeValue === 'status') {
            changes.push('Status');
            return;
        }
        const amount = parseFloat(amountInput.value.replace(',', '.'));
        if (Number.isNaN(amount)) return;
        totalChange += typeValue === '+' ? amount : -amount;
        changes.push(`${typeValue}${amount}`);
    });
    return { changes, totalChange };
}

async function addAnimation(event) {
    if (event) event.preventDefault();

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
        schnittTimestamp: document.getElementById('qTimestamp')?.value || '',
        cutterInfo: document.getElementById('qCutterInfo')?.value || ''
    };

    const qValueElem = document.getElementById('qValue');
    const qValue = qValueElem ? qValueElem.value : '';

    switch(type) {
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
            animation.geldStart = qValue;
            const startVal = parseFloat(qValue.replace(',', '.')) || 0;
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
            const ticketContent = document.getElementById('qTicketContent');
            animation.textboxText = ticketContent ? ticketContent.value : '';
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
            animation.teilnehmer = '';
            animation.farbe = '';
            break;
    }

    await addAnimationToStore(animation);

    // Reset
    if (qValueElem) qValueElem.value = '';
    const extraFields = document.getElementById('extraFields');
    if (extraFields && extraFields.style.display !== 'none') {
        const inputs = extraFields.querySelectorAll('input, textarea, select');
        inputs.forEach(i => {
            if (i.type === 'checkbox') i.checked = false;
            else i.value = '';
        });
        extraFields.querySelectorAll('.city-checkbox').forEach(l => l.classList.remove('active'));
    }
    
    const qTimestamp = document.getElementById('qTimestamp');
    const qCutterInfo = document.getElementById('qCutterInfo');
    if (qTimestamp) qTimestamp.value = '';
    if (qCutterInfo) qCutterInfo.value = '';

    // Hide form and reset selector
    const quickForm = document.getElementById('quickForm');
    if (quickForm) quickForm.style.display = 'none';
    document.querySelectorAll('.type-item').forEach(item => item.classList.remove('active'));
    showNotification(`Animation hinzugefügt!`);
}

function renderTable() {
    const tbody = document.getElementById('dataBody');
    if (!tbody) return;

    if (animations.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="17">
                        <div class="empty-state">
                            <div class="material-icons" style="font-size: 48px; margin-bottom: 10px; opacity: 0.3;">post_add</div>
                            <h3>Noch keine Animationen</h3>
                            <p>Füge oben deine erste Animation hinzu</p>
                        </div>
                    </td>
                </tr>
            `;
        return;
    }

    const rows = getSortedAnimations();
    tbody.innerHTML = rows.map((anim) => `
            <tr ondblclick="editRow(${anim.id})" data-id="${anim.id}">
                <td>${anim.id ?? '-'}</td>
                <td>${anim.datum || '-'}</td>
                <td>${anim.show || '-'}</td>
                <td>${getFolgeValue(anim) || '-'}</td>
                <td>
                    <span class="type-badge" style="display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons" style="font-size: 16px;">${typeIcon[anim.type] || 'info'}</span>
                        ${typeLabels[anim.type] || anim.type}
                    </span>
                </td>
                <td>${anim.teilnehmer ? `<span class="person-badge ${badgeClass[anim.teilnehmer] || ''}">${anim.teilnehmer}</span>` : '-'}</td>
                <td>${anim.temperatur || '-'}</td>
                <td>${anim.zeit || '-'}</td>
                <td>${(anim.geldStart !== undefined && anim.geldStart !== '') ? anim.geldStart + '€' : '-'}</td>
                <td>${anim.geldAenderung || '-'}</td>
                <td>${(anim.geldAktuell !== undefined && anim.geldAktuell !== '') ? anim.geldAktuell + '€' : '-'}</td>
                <td>${anim.stempel || '-'}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${anim.textboxText || '-'}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap;">${anim.todoItem || '-'}</td>
                <td>${anim.schnittTimestamp || '-'}</td>
                <td>${anim.cutterInfo || '-'}</td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="action-btn" onclick="duplicateRow(${anim.id})" title="Duplizieren"><span class="material-icons" style="font-size: 18px;">control_point_duplicate</span></button>
                        <button class="action-btn" onclick="deleteRow(${anim.id})" title="Löschen"><span class="material-icons" style="font-size: 18px;">delete</span></button>
                    </div>
                </td>
            </tr>
        `).join('');
    updateSortIndicators();
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

    row.innerHTML = `
            <td>${anim.id ?? '-'}</td>
            <td class="editable-cell"><input type="text" value="${anim.datum || ''}" data-field="datum"></td>
            <td class="editable-cell">
                <select data-field="show">
                    <option value="WCC" ${anim.show === 'WCC' ? 'selected' : ''}>WCC</option>
                    <option value="TR3" ${anim.show === 'TR3' ? 'selected' : ''}>TR3</option>
                </select>
            </td>
            <td class="editable-cell"><input type="text" value="${getFolgeValue(anim)}" data-field="folge"></td>
            <td>
                <span class="type-badge" style="display: flex; align-items: center; gap: 4px;">
                    <span class="material-icons" style="font-size: 16px;">${typeIcon[anim.type] || 'info'}</span>
                    ${typeLabels[anim.type] || anim.type}
                </span>
            </td>
            <td class="editable-cell">
                <select data-field="teilnehmer" ${anim.type === 'samsung' ? 'disabled' : ''}>
                    <option value="">-</option>
                    ${personOptions}
                </select>
            </td>
            <td class="editable-cell"><input type="text" value="${anim.temperatur || ''}" data-field="temperatur"></td>
            <td class="editable-cell"><input type="text" value="${anim.zeit || ''}" data-field="zeit"></td>
            <td class="editable-cell"><input type="text" value="${anim.geldStart || ''}" data-field="geldStart"></td>
            <td class="editable-cell"><input type="text" value="${anim.geldAenderung || ''}" data-field="geldAenderung"></td>
            <td class="editable-cell"><input type="text" value="${anim.geldAktuell || ''}" data-field="geldAktuell"></td>
            <td class="editable-cell"><input type="text" value="${anim.stempel || ''}" data-field="stempel"></td>
            <td class="editable-cell"><textarea data-field="textboxText">${anim.textboxText || ''}</textarea></td>
            <td class="editable-cell"><textarea data-field="todoItem">${anim.todoItem || ''}</textarea></td>
            <td class="editable-cell"><input type="text" value="${anim.schnittTimestamp || ''}" data-field="schnittTimestamp"></td>
            <td class="editable-cell"><input type="text" value="${anim.cutterInfo || ''}" data-field="cutterInfo"></td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn" onclick="saveEdit(${anim.id})" title="Speichern"><span class="material-icons" style="font-size: 18px;">save</span></button>
                    <button class="action-btn" onclick="cancelEdit()" title="Abbrechen"><span class="material-icons" style="font-size: 18px;">close</span></button>
                </div>
            </td>
        `;

    const firstInput = row.querySelector('input');
    if (firstInput) firstInput.focus();

    row.querySelectorAll('input, textarea, select').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                void saveEdit(id);
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        });
    });
}

async function saveEdit(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    const anim = getAnimationById(id);
    if (!anim) return;
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
    } else {
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
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    delete copy.id;
    await addAnimationToStore(copy);
    showNotification('Animation dupliziert!');
}

async function deleteRow(id) {
    if (confirm('Diese Animation wirklich löschen?')) {
        await deleteAnimationFromStore(id);
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
        if (text === null || text === undefined) return '';
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

function handleDownload() {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Exportieren!');
        return;
    }

    const csvContent = generateCSV();
    const fileName = getExportFileName();

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();

    showNotification('CSV-Datei wurde heruntergeladen!');
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
    if (dinoImg) dinoImg.src = src;
}

function startRunAnimation() {
    clearInterval(dinoRunTimer);
    let frame = 0;
    setDinoImage(DINO_ASSETS.run[frame]);
    dinoRunTimer = setInterval(() => {
        if (!isGameRunning) return;
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
    if (gameOverScreen) gameOverScreen.style.display = 'none';
    
    const objective = document.getElementById('gameObjective');
    if (objective) objective.innerHTML = '';
    
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
        if (isGameRunning && gameId === currentGameId) checkCollision();
    }, 10);

}

function stopGame() {
    isGameRunning = false;
    stopRunAnimation();
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    const objective = document.getElementById('gameObjective');
    if (objective) objective.innerHTML = '';
}

function jump() {
    const dino = document.getElementById('dino');
    if (dino && !dino.classList.contains('jump-anim') && isGameRunning) {
        stopRunAnimation();
        setDinoImage(DINO_ASSETS.jump);
        dino.classList.add('jump-anim');
        setTimeout(() => {
            dino.classList.remove('jump-anim');
            if (isGameRunning) startRunAnimation();
        }, 600);
    }
}

function spawnObstacle() {
    if (!isGameRunning) return;
    
    createObstacle(currentGameId);
    
    const minDelay = Math.max(600, 1500 - (gameScore * 5));
    const maxDelay = Math.max(1000, 3000 - (gameScore * 8));
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
    
    obstacleTimer = setTimeout(spawnObstacle, delay);
}

function createObstacle(gameId) {
    const objective = document.getElementById('gameObjective');
    if (!objective) return;
    
    const obstacle = document.createElement('div');
    const isBird = Math.random() < 0.2;
    let type;
    if (isBird) {
        type = 'bird';
    } else {
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
    } else if (type === 'cactus-large') {
        img.src = CACTUS_LARGE[Math.floor(Math.random() * CACTUS_LARGE.length)];
    } else {
        img.src = CACTUS_SMALL[Math.floor(Math.random() * CACTUS_SMALL.length)];
    }
    obstacle.appendChild(img);
    objective.appendChild(obstacle);

    let position = -50;
    const currentSpeed = gameSpeed;
    const moveInterval = setInterval(() => {
        if (!isGameRunning || gameId !== currentGameId) {
            clearInterval(moveInterval);
            if (obstacle._flapTimer) clearInterval(obstacle._flapTimer);
            obstacle.remove();
            return;
        }

        position += currentSpeed;
        obstacle.style.right = position + 'px';

        if (position > 550) {
            clearInterval(moveInterval);
            if (obstacle._flapTimer) clearInterval(obstacle._flapTimer);
            obstacle.remove();
            if (isGameRunning && gameId === currentGameId) {
                gameScore++;
                updateScore(gameScore);
                if (gameScore % 5 === 0) gameSpeed += 0.15;
            }
        }
    }, 20);
}

function updateScore(score) {
    const scoreElem = document.getElementById('gameScore');
    if (scoreElem) scoreElem.textContent = score.toString().padStart(5, '0');
}

function checkCollision() {
    const dino = document.getElementById('dino');
    const obstacles = document.querySelectorAll('.obstacle');
    if (!dino) return;

    const dinoRect = dino.getBoundingClientRect();

    obstacles.forEach(obstacle => {
        const obsRect = obstacle.getBoundingClientRect();
        
        if (
            dinoRect.left < obsRect.right &&
            dinoRect.right > obsRect.left &&
            dinoRect.top < obsRect.bottom &&
            dinoRect.bottom > obsRect.top
        ) {
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
    if (gameOverScreen) gameOverScreen.style.display = 'flex';
    if (finalScore) finalScore.textContent = `SCORE: ${gameScore.toString().padStart(5, '0')}`;
}

// Export functions used by inline HTML handlers.
//noinspection JSUnusedGlobalSymbols
Object.assign(window, {
    toggleTheme,
    showGameModal,
    hideGameModal,
    handleDownload,
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
    deleteRow
});

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
        if (event.target === sheetsModal) {
            hideSheetsModal();
        }
        if (event.target === gameModal) {
            hideGameModal();
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
            } else {
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
    await loadFromCloud();
});
