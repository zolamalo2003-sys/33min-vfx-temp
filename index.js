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
    document.getElementById('qType').value = type;
    document.getElementById('quickForm').style.display = 'block';
    
    // Update active class in selector
    document.querySelectorAll('.type-item').forEach(item => {
        if (item.getAttribute('onclick').includes(`'${type}'`)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    updateFields();
}

function showNotification(message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
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

// Load saved theme
if (localStorage.getItem('theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
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
                        <button class="action-btn" onclick="duplicateRow(${index})" title="Duplizieren"><span class="material-icons" style="font-size: 18px;">content_copy</span></button>
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

function showExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'flex';
}

function hideExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'none';
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
    hideExportModal();
}

function handleEmail() {
    if (animations.length === 0) {
        showNotification('Keine Daten zum Senden vorhanden!');
        return;
    }

    const subject = encodeURIComponent("33minutes Spreadsheet Export");
    window.location.href = `mailto:?subject=${subject}`;
    
    showNotification('E-Mail-Programm geöffnet!');
    hideExportModal();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const quickForm = document.getElementById('quickForm');
    if (quickForm) {
        quickForm.addEventListener('submit', addAnimation);
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('exportModal');
        if (event.target === modal) {
            hideExportModal();
        }
    });

    renderTable();
});
