// --- Google Sheets API Konfiguration ---
// HINWEIS: Um Google Sheets zu nutzen, müssen hier gültige Anmeldedaten eingetragen werden.
// Anleitung: https://developers.google.com/sheets/api/quickstart/js
const CLIENT_ID = '744552869176-oen8v0cjvsd9259nlegj1qcuncormso7.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBAYW1OKeOScxvamvciP4UBWUoBN56rIDY';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

let gapiInited = false;
let gsieInited = false;
let tokenClient;
let spreadsheetId = localStorage.getItem('googleSpreadsheetId') || '';

// --- Initialisierung ---

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    updateAuthStatus();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // wird später gesetzt
    });
    gsieInited = true;
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

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
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
    
    // Einfache Validierung: Wenn es ein Link ist, extrahiere die ID
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

function saveToGoogleSheets() {
    if (!spreadsheetId) {
        showNotification('Bitte zuerst eine Spreadsheet ID festlegen!');
        showSheetsModal();
        return;
    }

    const token = gapi.client.getToken();
    if (!token) {
        showSheetsModal();
        return;
    }

    pushToGoogleSheets();
}

async function pushToGoogleSheets() {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Senden vorhanden!');
        return;
    }

    try {
        showNotification('Sende Daten zu Google Sheets...');
        
        // Header und Daten vorbereiten
        const headers = ['Datum', 'Show', 'Sequenz', 'Teilnehmer', 'Farbe', 'Komposition', 'Temperatur', 'Zeit', 'Geld_Start', 'Geld_Änderung', 'Geld_Aktuell', 'Stempel', 'TextBox_Text', 'ToDo_Item', 'Schnitt_Zeitstempel', 'Cutter_Info'];
        const values = [
            headers,
            ...animations.map(anim => [
                anim.datum || '', anim.show || '', anim.sequenz || '', anim.teilnehmer || '', 
                anim.farbe || '', anim.komposition || '', anim.temperatur || '', anim.zeit || '', 
                anim.geldStart || '', anim.geldAenderung || '', anim.geldAktuell || '', 
                anim.stempel || '', anim.textboxText || '', anim.todoItem || '', 
                anim.schnittTimestamp || '', anim.cutterInfo || ''
            ])
        ];

        // Zuerst das Blatt leeren oder einfach überschreiben? 
        // Wir überschreiben das gesamte Blatt "Sheet1" ab A1
        const range = 'Sheet1!A1';
        
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            resource: { values: values }
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
        const range = 'Sheet1!A2:P'; // Überspringe Header

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
        const newAnimations = rows.map(row => ({
            datum: row[0] || '',
            show: row[1] || '',
            sequenz: row[2] || '',
            teilnehmer: row[3] || '',
            farbe: row[4] || '',
            komposition: row[5] || '',
            temperatur: row[6] || '',
            zeit: row[7] || '',
            geldStart: row[8] || '',
            geldAenderung: row[9] || '',
            geldAktuell: row[10] || '',
            stempel: row[11] || '',
            textboxText: row[12] || '',
            todoItem: row[13] || '',
            schnittTimestamp: row[14] || '',
            cutterInfo: row[15] || '',
            type: row[5] || 'temperatur' // Fallback
        }));

        if (confirm(`${newAnimations.length} Animationen geladen. Bestehende Daten überschreiben?`)) {
            animations = newAnimations;
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
    'Käthe': 'Orange'
};

const badgeClass = {
    'Jerry': 'badge-jerry',
    'Marc': 'badge-marc',
    'Kodiak': 'badge-kodiak',
    'Taube': 'badge-taube',
    'Käthe': 'badge-käthe'
};

const typeIcon = {
    'temperatur': 'thermostat',
    'zeit': 'schedule',
    'geld': 'payments',
    'uebersicht': 'assessment',
    'textbox': 'chat_bubble',
    'todo': 'check_circle'
};

let animations = JSON.parse(localStorage.getItem('raceAnimations') || '[]');
let editingRow = null;

function selectType(type) {
    const form = document.getElementById('quickForm');
    document.getElementById('qType').value = type;
    form.style.display = 'block';
    form.style.animation = 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // Update active class in selector
    document.querySelectorAll('.type-item').forEach(item => {
        if (item.getAttribute('onclick').includes(`'${type}'`)) {
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

function closeInfo() {
    const card = document.getElementById('infoCard');
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(-20px)';
        card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        setTimeout(() => {
            card.style.display = 'none';
            localStorage.setItem('infoClosed', 'true');
        }, 300);
    }
}

// Load saved theme and info state
if (localStorage.getItem('theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
}
if (localStorage.getItem('infoClosed') === 'true') {
    document.addEventListener('DOMContentLoaded', () => {
        const card = document.getElementById('infoCard');
        if (card) card.style.display = 'none';
    });
}

function updateFields() {
    const type = document.getElementById('qType').value;
    const extraFields = document.getElementById('extraFields');
    const dynamicLabel = document.getElementById('dynamicLabel');
    const dynamicField = document.getElementById('dynamicField');
    const qValue = document.getElementById('qValue');

    if (!extraFields || !dynamicLabel || !dynamicField || !qValue) return;

    extraFields.innerHTML = '';
    extraFields.style.display = 'none';
    qValue.onblur = null; // Reset blur handler
    qValue.oninput = null; // Reset input handler
    qValue.style.display = 'block';
    dynamicLabel.style.display = 'block';
    dynamicField.style.display = 'flex';

    switch(type) {
        case 'temperatur':
            dynamicLabel.textContent = 'Temperatur';
            dynamicField.style.display = 'flex';
            qValue.onblur = () => {
                if (qValue.value && !isNaN(qValue.value.replace(',', '.')) && !qValue.value.includes('°')) {
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
                    <div class="field-group">
                        <label>Was passiert?</label>
                        <select class="quick-select" id="qGeldTyp">
                            <option value="+">Geld dazu</option>
                            <option value="-">Geld weg</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Betrag</label>
                        <input type="number" step="any" class="quick-input" id="qGeldBetrag">
                    </div>
                    <div style="grid-column: span 2; padding: 10px; background: rgba(26, 115, 232, 0.1); border-radius: 8px; color: var(--accent-color); font-weight: 600; text-align: center;" id="geldVorschau">
                        Ergebnis: -
                    </div>
                `;
            const updateGeldVorschau = () => {
                const startStr = qValue.value.replace(',', '.');
                const start = parseFloat(startStr) || 0;
                const betragElem = document.getElementById('qGeldBetrag');
                const typElem = document.getElementById('qGeldTyp');
                const vorschau = document.getElementById('geldVorschau');
                if (!betragElem || !typElem || !vorschau) return;
                const betrag = parseFloat(betragElem.value) || 0;
                const typ = typElem.value;
                const ergebnis = typ === '+' ? start + betrag : start - betrag;
                vorschau.textContent = `Ergebnis: ${ergebnis.toFixed(2)}€`;
            };
            qValue.oninput = updateGeldVorschau;
            extraFields.querySelectorAll('input, select').forEach(i => i.oninput = updateGeldVorschau);
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
        default:
            dynamicField.style.display = 'none';
    }

    // Auto-focus zum nächsten Feld
    setTimeout(() => {
        const personSelect = document.getElementById('qPerson');
        if (personSelect) personSelect.focus();
    }, 10);
}

function addAnimation(event) {
    if (event) event.preventDefault();

    const type = document.getElementById('qType').value;
    const person = document.getElementById('qPerson').value;

    let animation = {
        datum: new Date().toLocaleDateString('de-DE'),
        show: document.getElementById('qShow').value,
        sequenz: document.getElementById('qSequence').value,
        type: type,
        teilnehmer: person,
        farbe: colorMap[person],
        komposition: type,
        temperatur: '',
        zeit: '',
        geldStart: '',
        geldAenderung: '',
        geldAktuell: '',
        stempel: '',
        textboxText: '',
        todoItem: '',
        schnittTimestamp: document.getElementById('qTimestamp').value,
        cutterInfo: document.getElementById('qCutterInfo').value
    };

    const qValueElem = document.getElementById('qValue');
    const qValue = qValueElem ? qValueElem.value : '';

    switch(type) {
        case 'temperatur':
            let temp = qValue.trim();
            if (temp && !temp.includes('°')) {
                temp += '°C';
            }
            animation.temperatur = temp;
            break;
        case 'zeit':
            animation.zeit = qValue;
            break;
        case 'geld':
            animation.geldStart = qValue;
            const geldTypElem = document.getElementById('qGeldTyp');
            const geldBetragElem = document.getElementById('qGeldBetrag');
            if (geldTypElem && geldBetragElem) {
                const geldTyp = geldTypElem.value;
                const geldBetrag = geldBetragElem.value;
                animation.geldAenderung = geldTyp + geldBetrag;
                const startVal = parseFloat(qValue.replace(',', '.')) || 0;
                const aenderBetrag = parseFloat(geldBetrag) || 0;
                const result = geldTyp === '+'
                    ? startVal + aenderBetrag
                    : startVal - aenderBetrag;
                animation.geldAktuell = result.toFixed(2);
            }
            break;
        case 'uebersicht':
            animation.geldAktuell = qValue;
            const selectedCities = Array.from(document.querySelectorAll('.city-grid input:checked'))
                .map(cb => cb.value);
            animation.stempel = selectedCities.join(', ');
            break;
        case 'textbox':
            const textContent = document.getElementById('qTextContent');
            animation.textboxText = textContent ? textContent.value : '';
            break;
        case 'todo':
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

    animations.push(animation);
    saveAndRender();

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
                    <td colspan="16">
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

    tbody.innerHTML = animations.map((anim, index) => `
            <tr ondblclick="editRow(${index})" data-index="${index}">
                <td>${anim.datum || '-'}</td>
                <td>${anim.show || '-'}</td>
                <td>${anim.sequenz || '-'}</td>
                <td>
                    <span class="type-badge" style="display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons" style="font-size: 16px;">${typeIcon[anim.type]}</span>
                        ${anim.type}
                    </span>
                </td>
                <td><span class="person-badge ${badgeClass[anim.teilnehmer]}">${anim.teilnehmer}</span></td>
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
                        <button class="action-btn" onclick="duplicateRow(${index})" title="Duplizieren"><span class="material-icons" style="font-size: 18px;">control_point_duplicate</span></button>
                        <button class="action-btn" onclick="deleteRow(${index})" title="Löschen"><span class="material-icons" style="font-size: 18px;">delete</span></button>
                    </div>
                </td>
            </tr>
        `).join('');
}

function editRow(index) {
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;
    const anim = animations[index];

    row.classList.add('editing');
    editingRow = index;

    row.innerHTML = `
            <td class="editable-cell"><input type="text" value="${anim.datum || ''}" data-field="datum"></td>
            <td class="editable-cell">
                <select data-field="show">
                    <option value="WCC" ${anim.show === 'WCC' ? 'selected' : ''}>WCC</option>
                    <option value="TR3" ${anim.show === 'TR3' ? 'selected' : ''}>TR3</option>
                </select>
            </td>
            <td class="editable-cell"><input type="text" value="${anim.sequenz || ''}" data-field="sequenz"></td>
            <td>
                <span class="type-badge" style="display: flex; align-items: center; gap: 4px;">
                    <span class="material-icons" style="font-size: 16px;">${typeIcon[anim.type]}</span>
                    ${anim.type}
                </span>
            </td>
            <td><span class="person-badge ${badgeClass[anim.teilnehmer]}">${anim.teilnehmer}</span></td>
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
                    <button class="action-btn" onclick="saveEdit(${index})" title="Speichern"><span class="material-icons" style="font-size: 18px;">save</span></button>
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
                saveEdit(index);
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        });
    });
}

function saveEdit(index) {
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;
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

        animations[index][field] = value;
    });

    editingRow = null;
    saveAndRender();
    showNotification('Änderungen gespeichert!');
}

function cancelEdit() {
    editingRow = null;
    renderTable();
}

function duplicateRow(index) {
    const copy = JSON.parse(JSON.stringify(animations[index]));
    animations.splice(index + 1, 0, copy);
    saveAndRender();
    showNotification('Animation dupliziert!');
}

function deleteRow(index) {
    if (confirm('Diese Animation wirklich löschen?')) {
        animations.splice(index, 1);
        saveAndRender();
        showNotification('Animation gelöscht!');
    }
}

function saveAndRender() {
    localStorage.setItem('raceAnimations', JSON.stringify(animations));
    renderTable();
}

function generateCSV() {
    const headers = ['Datum', 'Show', 'Sequenz', 'Teilnehmer', 'Farbe', 'Komposition', 'Temperatur', 'Zeit', 'Geld_Start', 'Geld_Änderung', 'Geld_Aktuell', 'Stempel', 'TextBox_Text', 'ToDo_Item', 'Schnitt_Zeitstempel', 'Cutter_Info'];

    const escapeCSV = (text) => {
        if (text === null || text === undefined) return '';
        const stringValue = String(text);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    };

    return [
        headers.join(','),
        ...animations.map(anim => [
            anim.datum || '',
            anim.show || '',
            anim.sequenz || '',
            anim.teilnehmer || '',
            anim.farbe || '',
            anim.komposition || '',
            anim.temperatur || '',
            anim.zeit || '',
            anim.geldStart || '',
            anim.geldAenderung || '',
            anim.geldAktuell || '',
            anim.stempel || '',
            anim.textboxText || '',
            anim.todoItem || '',
            anim.schnittTimestamp || '',
            anim.cutterInfo || ''
        ].map(escapeCSV).join(','))
    ].join('\n');
}

function handleDownload() {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Exportieren!');
        return;
    }

    const csvContent = generateCSV();
    const fileName = `the_race_${new Date().toISOString().split('T')[0]}.csv`;

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
let gameScore = 0;
let gameSpeed = 5;
let obstacleTimer;
let collisionTimer;
let cloudTimer;

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
    clearInterval(cloudTimer);

    // Kleiner Delay vor dem ersten Obstacle für besseres Spielgefühl
    obstacleTimer = setTimeout(() => {
        if (isGameRunning && gameId === currentGameId) {
            spawnObstacle();
        }
    }, 300);
    
    collisionTimer = setInterval(() => {
        if (isGameRunning && gameId === currentGameId) checkCollision();
    }, 10);

    cloudTimer = setInterval(() => {
        if (isGameRunning && gameId === currentGameId) createCloud();
    }, 3000);
}

function stopGame() {
    isGameRunning = false;
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    clearInterval(cloudTimer);
    const objective = document.getElementById('gameObjective');
    if (objective) objective.innerHTML = '';
}

function jump() {
    const dino = document.getElementById('dino');
    if (dino && !dino.classList.contains('jump-anim') && isGameRunning) {
        dino.classList.add('jump-anim');
        setTimeout(() => {
            dino.classList.remove('jump-anim');
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
    const types = ['cactus-small', 'cactus-large', 'bird'];
    const availableTypes = gameScore > 30 ? types : ['cactus-small', 'cactus-large'];
    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    
    obstacle.className = `obstacle ${type}`;
    
    let icon = 'potted_plant';
    if (type === 'bird') icon = 'flight';
    else if (type === 'cactus-large') icon = 'park';
    
    obstacle.innerHTML = `<span class="material-icons">${icon}</span>`;
    objective.appendChild(obstacle);

    let position = -50;
    const currentSpeed = gameSpeed;
    const moveInterval = setInterval(() => {
        if (!isGameRunning || gameId !== currentGameId) {
            clearInterval(moveInterval);
            obstacle.remove();
            return;
        }

        position += currentSpeed;
        obstacle.style.right = position + 'px';

        if (position > 550) {
            clearInterval(moveInterval);
            obstacle.remove();
            if (isGameRunning && gameId === currentGameId) {
                gameScore++;
                updateScore(gameScore);
                if (gameScore % 5 === 0) gameSpeed += 0.15;
            }
        }
    }, 20);
}

function createCloud() {
    const objective = document.getElementById('gameObjective');
    if (!objective) return;
    
    const cloud = document.createElement('div');
    cloud.className = 'cloud';
    const top = Math.floor(Math.random() * 70) + 10;
    cloud.style.top = top + 'px';
    cloud.innerHTML = '<span class="material-icons" style="font-size: 30px;">cloud</span>';
    cloud.style.animation = `cloudMove ${Math.random() * 5 + 7}s linear forwards`;
    objective.appendChild(cloud);
    
    setTimeout(() => {
        if (cloud.parentElement) cloud.remove();
    }, 12000);
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
    
    // Hitbox-Padding: Höhere Werte machen das Spiel einfacher (kleinere Hitboxen)
    const dinoHitPadding = 8; 
    const obsHitPadding = 10;

    obstacles.forEach(obstacle => {
        const obsRect = obstacle.getBoundingClientRect();
        
        // Kollisionsabfrage mit Padding-Berücksichtigung
        if (
            dinoRect.left + dinoHitPadding < obsRect.right - obsHitPadding &&
            dinoRect.right - dinoHitPadding > obsRect.left + obsHitPadding &&
            dinoRect.top + dinoHitPadding < obsRect.bottom - obsHitPadding &&
            dinoRect.bottom - dinoHitPadding > obsRect.top + obsHitPadding
        ) {
            gameOver();
        }
    });
}

function gameOver() {
    isGameRunning = false;
    clearTimeout(obstacleTimer);
    clearInterval(collisionTimer);
    clearInterval(cloudTimer);
    const gameOverScreen = document.getElementById('gameOverScreen');
    const finalScore = document.getElementById('finalScore');
    if (gameOverScreen) gameOverScreen.style.display = 'flex';
    if (finalScore) finalScore.textContent = `SCORE: ${gameScore.toString().padStart(5, '0')}`;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
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

    renderTable();
});
