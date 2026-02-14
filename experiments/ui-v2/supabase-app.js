import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/** 1) HIER EINTRAGEN (Supabase Dashboard -> Project Settings -> API) */
const SUPABASE_URL = "https://xdxnprrjnwutpewchjms.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeG5wcnJqbnd1dHBld2Noam1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzgwMzQsImV4cCI6MjA4NTA1NDAzNH0.Njz_nuCzW0IWPqHINXbUmiLFX-h3qQPnlzGzxlB8h8A";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** 2) Buttons: IDs müssen existieren */
const loginBtn = document.getElementById("loginBtn");
const cloudBtn = document.getElementById("cloudBtn");

/** 3) LocalStorage Key */
const LS_KEY = "raceAnimations";

let saveStatusTimer = null;
function setSaveStatus(message, ok) {
    const el = document.getElementById("saveStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("ok", "error", "visible");
    el.classList.add(ok ? "ok" : "error");
    void el.offsetWidth;
    el.classList.add("visible");
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
        el.classList.remove("visible");
    }, 2000);
}

async function isStorageReliable() {
    try {
        localStorage.setItem("__storage_test__", "1");
        localStorage.removeItem("__storage_test__");
    } catch (error) {
        return false;
    }

    if (navigator.storage?.persisted) {
        try {
            const persisted = await navigator.storage.persisted();
            if (persisted === false) return false;
        } catch (error) {
            return true;
        }
    }

    return true;
}

async function updateSyncIndicator() {
    const indicator = document.getElementById("syncIndicator");
    const tooltip = document.getElementById("syncIndicatorTooltip");
    if (!indicator || !tooltip) return;

    // 1. Cloud / Green (Synchronous check first)
    if (session) {
        applyIndicatorState(indicator, tooltip, "green", "Cloud aktiv", "Eingeloggt. Einträge werden im Account in der Cloud gespeichert und sind im Team sichtbar.");
        return;
    }

    // 2. Storage Check (Async)
    const storageOk = await isStorageReliable();

    // 3. Red / Orange
    if (!storageOk) {
        applyIndicatorState(indicator, tooltip, "red", "Nicht sicher gespeichert", "Privater Modus oder Speicher nicht dauerhaft. Einträge können beim Schließen/Browser-Cleanup verloren gehen.");
    } else {
        applyIndicatorState(indicator, tooltip, "orange", "Guest-Modus", "Einträge werden nur lokal im Browser gespeichert. Bleiben bei Reload, können aber durch Browserdaten löschen/Inkognito verloren gehen.");
    }
}

function applyIndicatorState(indicator, tooltip, state, title, text) {
    indicator.classList.remove("state-red", "state-orange", "state-green");
    indicator.classList.add(`state-${state}`);

    const titleEl = tooltip.querySelector("strong");
    const textEl = tooltip.querySelector("span");
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;

    updateMainExportVisibility(state);
}

/** ===== Local helpers ===== */
function loadLocal() {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
}
function saveLocal(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function uuid() {
    return crypto.randomUUID();
}
function parseGermanDateToISO(d) {
    // "27.1.2026" -> "2026-01-27"
    const parts = d.split(".").filter(Boolean).map(s => s.trim());
    const day = (parts[0] || "").padStart(2, "0");
    const month = (parts[1] || "").padStart(2, "0");
    const year = parts[2] || "";
    return `${year}-${month}-${day}`;
}

/** ===== Auth state ===== */
let session = null;

async function initAuth() {
    const { data } = await supabase.auth.getSession();
    session = data.session;
    window.session = session; // Expose globally
    window.supabase = supabase; // Expose globally
    updateAuthUI();
    updateSyncIndicator();

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session = newSession;
        window.session = newSession; // Update global reference
        updateAuthUI();
        updateSyncIndicator();
        if (session) {
            closeAuthModal();
            // direkt nach Login: lokalen Kram in Cloud übernehmen
            await syncLocalToCloud();
        }
    });

    // Initial check for display name
    if (session) {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
            session.user = data.user; // Ensure we have latest metadata
            window.session = session; // Update global reference
        }
    }
}

function updateAuthUI() {
    const loggedIn = !!session;
    const loginBtn = document.getElementById("loginBtn");

    if (loginBtn) {
        if (loggedIn) {
            loginBtn.classList.add("logged-in"); // CSS for glow
            // Override local click to open Profile
            loginBtn.onclick = openProfileModal;
        } else {
            loginBtn.classList.remove("logged-in");
            // Override click to open Login
            loginBtn.onclick = openAuthModal;
        }
    }

    // Cloud Button ausblenden wenn nicht eingeloggt
    if (cloudBtn) {
        // Use empty string to revert to CSS default (usually flex or grid), 'none' to hide
        cloudBtn.style.display = loggedIn ? "" : "none";
    }
}

async function openProfileModal() {
    const modal = document.getElementById("profileModal");
    if (!modal || !session) return;

    // Email
    const emailDisp = document.getElementById("profileEmailDisplay");
    if (emailDisp) emailDisp.textContent = session.user.email;

    // Display Name
    const nameInput = document.getElementById("profileDisplayName");
    if (nameInput) {
        const meta = session.user.user_metadata || {};
        nameInput.value = meta.display_name || "";
    }

    // Load Avatar
    if (typeof loadUserAvatar === 'function') {
        loadUserAvatar();
    }

    modal.style.display = "flex";
}

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
    const input = document.getElementById("profileDisplayName");
    const newName = input ? input.value.trim() : "";

    if (!newName) return;

    // Ensure session is valid
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
        alert("Session abgelaufen. Bitte neu einloggen.");
        updateAuthUI();
        return;
    }

    const { data, error } = await supabase.auth.updateUser({
        data: { display_name: newName }
    });

    if (error) {
        alert("Fehler beim Speichern des Profils: " + error.message);
    } else {
        alert("Profil gespeichert!");
        if (data.user) {
            session.user = data.user; // Update local session
        }
        document.getElementById("profileModal").style.display = "none";
        // Refresh UI
        updateAuthUI();
    }
});

document.getElementById("authLogoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    document.getElementById("profileModal").style.display = "none";
    alert("Erfolgreich abgemeldet.");
    updateAuthUI(); // Fallback
});

/** ===== Login/Logout ===== */
async function doLogin() {
    const email = document.getElementById("authEmail")?.value?.trim();
    const password = document.getElementById("authPassword")?.value;

    if (!email || !password) {
        alert("Bitte Email und Passwort angeben.");
        return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}

async function doSignup() {
    const email = document.getElementById("authEmail")?.value?.trim() || prompt("E-Mail für Registrierung:");
    if (!email) return;

    const password = document.getElementById("authPassword")?.value || prompt("Passwort wählen (mind. 6 Zeichen):");
    if (!password) return;

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Account erstellt. Du kannst dich jetzt einloggen.");
}

async function doLogout() {
    await supabase.auth.signOut();
}

/** ===== Speichern eines Eintrags (du rufst diese Funktion beim 'Eintrag anlegen' auf) ===== */
export async function saveEntry(entry) {
    // entry ist dein Objekt wie du es aktuell hast (datum/show/folge/...)
    if (!session) {
        const local = loadLocal();
        local.unshift({
            ...entry,
            localId: uuid(),
            createdAt: new Date().toISOString(),
            synced: false,
        });
        saveLocal(local);
        setSaveStatus("Gespeichert ✅", true);
        updateSyncIndicator();
        return;
    }

    // Logged in -> Supabase
    const row = {
        local_id: entry.localId || uuid(),
        datum: entry.datum ? parseGermanDateToISO(entry.datum) : null,
        show: entry.show || null,
        folge: entry.folge || null,
        type: entry.type || null,
        komposition: entry.komposition || null,
        status: entry.status || "draft",
        schnitt_timestamp: entry.schnittTimestamp || null,
        cutter_info: entry.cutterInfo || null,
        done: !!entry.done,
        legacy_id: entry.id ?? null,
        created_by_email: session?.user?.email ?? null,

        values_json: {
            teilnehmer: entry.teilnehmer ?? null,
            farbe: entry.farbe ?? null,
            temperatur: entry.temperatur ?? null,
            zeit: entry.zeit ?? null,
            geldStart: entry.geldStart ?? null,
            geldAenderung: entry.geldAenderung ?? null,
            geldAktuell: entry.geldAktuell ?? null,
            stempel: entry.stempel ?? null,
            textboxText: entry.textboxText ?? null,
            todoItem: entry.todoItem ?? null,
            stempel2: entry.stempel2 ?? null,
            // Store profile info in JSON to avoid schema changes
            player_name: session?.user?.user_metadata?.display_name ?? null,
            avatar_config: session?.user?.user_metadata?.avatar_settings ?? null
        },
    };

    const { error } = await supabase.from("entries").insert(row);
    if (error) {
        alert(error.message);
        setSaveStatus(`Nicht gespeichert: ${error.message} ❌`, false);
    } else {
        setSaveStatus("Gespeichert ✅", true);
        updateSyncIndicator();
    }
}

/** ===== Guest -> Login Sync: lokale unsynced Einträge in Cloud hochladen ===== */
async function syncLocalToCloud() {
    const local = loadLocal();
    const unsynced = local.filter(e => !e.synced);

    if (!session || unsynced.length === 0) return;

    const rows = unsynced.map(e => ({
        local_id: e.localId || uuid(),
        datum: e.datum ? parseGermanDateToISO(e.datum) : null,
        show: e.show || null,
        folge: e.folge || null,
        type: e.type || null,
        komposition: e.komposition || null,
        status: e.status || "draft",
        schnitt_timestamp: e.schnittTimestamp || null,
        cutter_info: e.cutterInfo || null,
        done: !!e.done,
        legacy_id: e.id ?? null,
        created_by_email: session?.user?.email ?? null,
        values_json: {
            teilnehmer: e.teilnehmer ?? null,
            farbe: e.farbe ?? null,
            temperatur: e.temperatur ?? null,
            zeit: e.zeit ?? null,
            geldStart: e.geldStart ?? null,
            geldAenderung: e.geldAenderung ?? null,
            geldAktuell: e.geldAktuell ?? null,
            stempel: e.stempel ?? null,
            textboxText: e.textboxText ?? null,
            todoItem: e.todoItem ?? null,
            stempel2: e.stempel2 ?? null,
            player_name: session?.user?.user_metadata?.display_name ?? null,
            avatar_config: session?.user?.user_metadata?.avatar_settings ?? null
        },
    }));

    // upsert verhindert doppelte Uploads (wegen unique index user_id+local_id)
    const { error } = await supabase
        .from("entries")
        .upsert(rows, { onConflict: "user_id,local_id" });

    if (error) {
        alert(error.message);
        setSaveStatus(`Nicht gespeichert: ${error.message} ❌`, false);
        return;
    }
    setSaveStatus("Gespeichert ✅", true);
    updateSyncIndicator();

    const updated = local.map(e => (e.synced ? e : { ...e, synced: true }));
    saveLocal(updated);
}

/** ===== Cloud view: alle Einträge (nur eingeloggte) + Live Updates ===== */
let cloudChannel = null;
let cloudRows = [];

const cloudStatusClass = (status) => {
    if (!status) return "draft";
    if (status === "ready") return "ready";
    if (status === "done") return "done";
    if (status === "draft") return "draft";
    return "draft";
};

const getValues = (row) => row?.values_json || {};

const hashToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 45%)`;
};

const shortCode = (userId) => {
    if (!userId) return "--";
    return userId.slice(0, 3).toUpperCase();
};

function emailCode(email) {
    if (!email) return "???";
    const name = email.split("@")[0] || "";
    return name.slice(0, 3).toUpperCase();
}

const formatCloudRow = (row) => {
    const values = getValues(row);
    return {
        id: row.id,
        created_at: row.created_at,
        datum: row.datum || "",
        show: row.show || "",
        folge: row.folge || "",
        type: row.type || "",
        teilnehmer: values.teilnehmer || "",
        farbe: values.farbe || "",
        komposition: row.komposition || "",
        temperatur: values.temperatur || "",
        zeit: values.zeit || "",
        geldStart: values.geldStart || "",
        geldAenderung: values.geldAenderung || "",
        geldAktuell: values.geldAktuell || "",
        stempel: values.stempel || "",
        textboxText: values.textboxText || "",
        todoItem: values.todoItem || "",
        status: row.status || "draft",
        schnittTimestamp: row.schnitt_timestamp || "",
        cutterInfo: row.cutter_info || "",
        done: !!row.done,
        user_id: row.user_id,
        created_by_email: row.created_by_email || null,
        // Read from top-level (if columns added later) OR from values_json
        player_name: row.player_name || values.player_name || null,
        avatar_config: row.avatar_config || values.avatar_config || null
    };
};

function openCloudModal() {
    const modal = document.getElementById("cloudModal");
    if (modal) {
        modal.style.display = "flex";
        modal.classList.remove("closing");
        document.body.style.overflow = "hidden";
    }
}

function closeCloudModal() {
    const modal = document.getElementById("cloudModal");
    if (modal) {
        modal.classList.add("closing");
        setTimeout(() => {
            modal.style.display = "none";
            modal.classList.remove("closing");
            document.body.style.overflow = "";
        }, 250);
    }
}

function updateCloudCountDisplay() {
    const list = applyCloudFilters(cloudRows);
    const countEl = document.getElementById("cloudRowCount");
    const footerEl = document.getElementById("cloudFooterCount");
    if (countEl) countEl.textContent = list.length;
    if (footerEl) footerEl.textContent = `${list.length} von ${cloudRows.length} Einträgen`;
}

function applyCloudFilters(list) {
    const folgeValue = document.getElementById("cloudFilterFolge")?.value?.trim().toLowerCase() || "";
    const statusValue = document.getElementById("cloudFilterStatus")?.value || "";
    let filtered = [...list];
    if (folgeValue) {
        filtered = filtered.filter(row => String(row.folge || "").toLowerCase().includes(folgeValue));
    }
    if (statusValue) {
        filtered = filtered.filter(row => row.status === statusValue);
    }
    const sortValue = document.getElementById("cloudSort")?.value || "created_desc";
    filtered.sort((a, b) => {
        if (sortValue.startsWith("created")) {
            const aVal = new Date(a.created_at || 0).getTime();
            const bVal = new Date(b.created_at || 0).getTime();
            return sortValue === "created_asc" ? aVal - bVal : bVal - aVal;
        }
        // Fallback or explicit other sorts if needed
        return 0;
    });
    return filtered;
}

// Track which row is being edited
let activeEditId = null;

function renderCloudTable() {
    const body = document.getElementById("cloudTableBody");
    if (!body) return;
    const list = applyCloudFilters(cloudRows);
    updateCloudCountDisplay();
    if (!list.length) {
        body.innerHTML = `
            <tr>
                <td colspan="21">
                    <div class="helper-text" id="cloudEmpty">Keine Cloud-Daten.</div>
                </td>
            </tr>
        `;
        return;
    }

    const currentUserId = session?.user?.id;

    // Status Labels for Dropdown
    const statusOptions = [
        { val: 'none', label: 'Kein Status' },
        { val: 'draft', label: 'Entwurf' },
        { val: 'ready', label: 'Export bereit' },
        { val: 'exported', label: 'Exportiert' },
        { val: 'edited', label: 'Bearbeitet' },
        { val: 'error', label: 'Fehler' }
    ];

    // Person Options (from app.js logic, hardcoded here or synced?)
    // We'll use a simple list or just text input for flexibility if lists aren't shared
    const personOptions = ['Jerry', 'Marc', 'Kodiak', 'Taube', 'Käthe'];

    body.innerHTML = list.map((row) => {
        const canEdit = currentUserId && row.user_id === currentUserId;
        const isEditing = activeEditId === row.id;

        // User Display Logic
        let userDisplay = "";

        // 1. Try Avatar Config (if saved in row)
        if (row.avatar_config) {
            const settings = row.avatar_config;
            if (settings.style && settings.seed) {
                const avatarUrl = `https://api.dicebear.com/9.x/${settings.style}/svg?seed=${encodeURIComponent(settings.seed)}&backgroundColor=${settings.bgColor || 'transparent'}`;
                userDisplay = `<img src="${avatarUrl}" class="cloud-avatar-img" title="${row.player_name || 'User'}">`;
            }
        }

        // 2. Fallback: Initials with Pastel Background
        if (!userDisplay) {
            const userCode = emailCode(row.created_by_email); // 3 letters
            // Generate pastel color from user_id or email
            const hash = (row.user_id || row.created_by_email || "").split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
            const hue = Math.abs(hash % 360);
            const pastelColor = `hsl(${hue}, 70%, 80%)`;
            const textColor = `hsl(${hue}, 80%, 20%)`; // Darker text for contrast

            userDisplay = `<div class="cloud-avatar-initials" style="background-color: ${pastelColor}; color: ${textColor};" title="${row.player_name || row.created_by_email}">${userCode}</div>`;
        }

        // Helper to generating select options
        const renderSelect = (field, currentVal, options) => {
            return `<select class="cloud-edit-input" data-field="${field}">
                <option value="">-</option>
                ${options.map(o => {
                const val = typeof o === 'object' ? o.val : o;
                const label = typeof o === 'object' ? o.label : o;
                return `<option value="${val}" ${currentVal === val ? 'selected' : ''}>${label}</option>`;
            }).join('')}
            </select>`;
        };

        const renderInput = (field, val, type = 'text') => {
            return `<input type="${type}" class="cloud-edit-input" data-field="${field}" value="${(val || '').replace(/"/g, '&quot;')}" style="width: 100%; min-width: 60px;">`;
        };

        const renderTextarea = (field, val) => {
            return `<textarea class="cloud-edit-input" data-field="${field}" rows="1" style="width: 100%; min-width: 100px;">${val || ''}</textarea>`;
        };

        // Static Cell
        const staticCell = (content) => `<td>${content}</td>`;

        // Editable Cell Wrapper
        const editCell = (content) => `<td class="editable-cell">${content}</td>`;

        if (isEditing) {
            return `
            <tr data-cloud-id="${row.id}" class="cloud-row editing">
                <td>${userDisplay}</td>
                ${editCell(renderInput("datum", row.datum, "date") || renderInput("datum", parseGermanDateToISO(row.datum || ""), "date"))}
                ${editCell(renderInput("show", row.show))}
                ${editCell(renderInput("folge", row.folge))}
                ${editCell(renderSelect("type", row.type, ['temperatur', 'zeit', 'geld', 'uebersicht', 'textbox', 'todo', 'ticket', 'samsung']))}
                ${editCell(renderSelect("teilnehmer", row.teilnehmer, personOptions))}
                ${editCell(renderInput("farbe", row.farbe))}
                ${editCell(renderInput("komposition", row.komposition))}
                ${editCell(renderInput("temperatur", row.temperatur))}
                ${editCell(renderInput("zeit", row.zeit))}
                ${editCell(renderInput("geldStart", row.geldStart))}
                ${editCell(renderInput("geldAenderung", row.geldAenderung))}
                ${editCell(renderInput("geldAktuell", row.geldAktuell))}
                ${editCell(renderInput("stempel", row.stempel))}
                ${editCell(renderTextarea("textboxText", row.textboxText))}
                ${editCell(renderTextarea("todoItem", row.todoItem))}
                ${editCell(renderSelect("status", row.status, statusOptions))}
                ${editCell(renderInput("schnittTimestamp", row.schnittTimestamp))}
                ${editCell(renderInput("cutterInfo", row.cutterInfo))}
                <td>
                    <input type="checkbox" disabled ${row.done ? "checked" : ""}>
                </td>
                <td>
                    <div class="cloud-row-actions">
                        <button class="action-btn save-edit-btn" data-save-edit="${row.id}" title="Speichern">
                            <span class="material-icons" style="color: var(--success);">check</span>
                        </button>
                        <button class="action-btn cancel-edit-btn" title="Abbrechen">
                            <span class="material-icons" style="color: var(--danger);">close</span>
                        </button>
                    </div>
                </td>
            </tr>`;
        }

        // --- READ ONLY ROW ---
        // Status Translation
        const statusLabel = statusOptions.find(o => o.val === row.status)?.label || row.status || 'Entwurf';

        return `
            <tr data-cloud-id="${row.id}" class="cloud-row">
                <td>${userDisplay}</td>
                <td>${row.datum || "-"}</td>
                <td>${row.show || "-"}</td>
                <td>${row.folge || "-"}</td>
                <td>${row.type || "-"}</td>
                <td>${row.teilnehmer || "-"}</td>
                <td>${row.farbe || "-"}</td>
                <td>${row.komposition || "-"}</td>
                <td>${row.temperatur || "-"}</td>
                <td>${row.zeit || "-"}</td>
                <td>${row.geldStart || "-"}</td>
                <td>${row.geldAenderung || "-"}</td>
                <td>${row.geldAktuell || "-"}</td>
                <td>${row.stempel || "-"}</td>
                <td>${row.textboxText || "-"}</td>
                <td>${row.todoItem || "-"}</td>
                <td>
                    <span class="cloud-badge ${cloudStatusClass(row.status)}">${statusLabel}</span>
                </td>
                <td>${row.schnittTimestamp || "-"}</td>
                <td>${row.cutterInfo || "-"}</td>
                <td>
                    <input type="checkbox" data-done="${row.id}" ${row.done ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                </td>
                <td>
                    <div class="cloud-row-actions">
                        <button class="action-btn" data-edit="${row.id}" ${canEdit ? "" : "disabled"} title="Bearbeiten">
                            <span class="material-icons" style="font-size: 18px;">edit</span>
                        </button>
                        <button class="action-btn" data-delete="${row.id}" ${canEdit ? "" : "disabled"} title="Löschen">
                            <span class="material-icons" style="font-size: 18px;">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // --- EVENT LISTENERS ---

    // Checkbox Done
    body.querySelectorAll("[data-done]").forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
            if (checkbox.disabled) return;
            const id = checkbox.getAttribute("data-done");
            const row = cloudRows.find(item => item.id === id);
            if (!row) return;

            // Optimistic update
            const oldVal = row.done;
            row.done = checkbox.checked;

            const { error } = await supabase
                .from("entries")
                .update({ done: row.done })
                .eq("id", id);

            if (error) {
                alert("Fehler: " + error.message);
                row.done = oldVal; // revert
                checkbox.checked = oldVal;
            }
        });
    });

    // Edit Enable
    body.querySelectorAll("[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => {
            const editId = btn.getAttribute("data-edit");
            activeEditId = editId;
            renderCloudTable();
        });
    });

    // Delete
    body.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const deleteId = btn.getAttribute("data-delete");
            if (!confirm("Eintrag wirklich löschen?")) return;
            const { error } = await supabase.from("entries").delete().eq("id", deleteId);
            if (error) alert("Lösch-Fehler: " + error.message);
        });
    });

    // Cancel Edit
    body.querySelectorAll(".cancel-edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeEditId = null;
            renderCloudTable();
        });
    });

    // Save Edit
    body.querySelectorAll(".save-edit-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-save-edit");
            const rowElem = document.querySelector(`tr[data-cloud-id="${id}"]`);
            if (!rowElem) return;

            const inputs = rowElem.querySelectorAll('.cloud-edit-input');
            const updates = {};

            // Helper to determine where fields belong (root or values_json)
            const rootFields = ['datum', 'show', 'folge', 'type', 'komposition', 'status', 'schnittTimestamp', 'cutterInfo'];
            const jsonFields = ['teilnehmer', 'farbe', 'temperatur', 'zeit', 'geldStart', 'geldAenderung', 'geldAktuell', 'stempel', 'textboxText', 'todoItem'];

            const originalRow = cloudRows.find(r => r.id === id);
            if (!originalRow) return;

            // Build update object
            // Note: We need to respect the structure (root cols vs json)
            // But supabase update takes flat object matching columns.
            // Wait, supabase-app.js handles this by constructing the object in `saveEntry`.
            // Here we are UPDATING an existing row. We need to construct the update payload correctly.

            // We'll read all inputs
            const newValues = { ...getValues(originalRow) }; // start with existing json values
            const newRoot = {};

            inputs.forEach(input => {
                const field = input.getAttribute('data-field');
                const val = input.value;

                if (rootFields.includes(field)) {
                    // Mapping for specific DB columns if names differ
                    if (field === 'schnittTimestamp') newRoot['schnitt_timestamp'] = val || null;
                    else if (field === 'cutterInfo') newRoot['cutter_info'] = val || null;
                    else newRoot[field] = val || null;
                } else if (jsonFields.includes(field)) {
                    newValues[field] = val || null;
                }
            });

            newRoot['values_json'] = newValues;

            // Optimistic Update local
            // (We can't easily sync local cloudRows deeply without re-fetching, 
            // but we can try to update the object in place for immediate feedback if we wanted)

            const { error } = await supabase
                .from("entries")
                .update(newRoot)
                .eq("id", id);

            if (error) {
                alert("Fehler beim Speichern: " + error.message);
            } else {
                activeEditId = null;
                // renderCloudTable will be called by realtime subscription or we can call it manually
                // But subscription might delay. Let's rely on realtime to refresh or force fetch?
                // The existing code relies on realtime updates to refresh `cloudRows`.
                // We'll just clear edit mode.
                renderCloudTable();
            }
        });
    });

    // Initialize column resize handles
    initCloudTableResize();
}

// ===== COLUMN RESIZE (Excel-like) =====
function initCloudTableResize() {
    const table = document.querySelector("#cloudModal .cloud-table");
    if (!table) return;

    const thead = table.querySelector("thead");
    if (!thead) return;

    const ths = thead.querySelectorAll("th");
    if (!ths.length) return;

    // Set initial widths from current computed widths (only the first time)
    ths.forEach(th => {
        if (!th.style.width) {
            th.style.width = th.offsetWidth + "px";
        }
        // Remove old handle if it exists (re-render safe)
        const oldHandle = th.querySelector(".col-resize-handle");
        if (oldHandle) oldHandle.remove();

        // Create resize handle
        const handle = document.createElement("div");
        handle.className = "col-resize-handle";
        th.appendChild(handle);

        // Double-click: Auto-fit column width to content
        handle.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const colIndex = Array.from(ths).indexOf(th);
            const rows = table.querySelectorAll("tbody tr");
            let maxWidth = th.scrollWidth;

            rows.forEach(row => {
                const cell = row.cells[colIndex];
                if (cell) {
                    // Temporarily remove overflow constraints to measure
                    const origStyle = cell.style.cssText;
                    cell.style.whiteSpace = "nowrap";
                    cell.style.overflow = "visible";
                    cell.style.width = "auto";
                    cell.style.maxWidth = "none";
                    maxWidth = Math.max(maxWidth, cell.scrollWidth + 20);
                    cell.style.cssText = origStyle;
                }
            });

            // Cap at a reasonable maximum
            maxWidth = Math.min(maxWidth, 600);
            maxWidth = Math.max(maxWidth, 40);

            th.style.width = maxWidth + "px";
            th.style.minWidth = maxWidth + "px";
        });

        handle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.pageX;
            const startWidth = th.offsetWidth;

            handle.classList.add("active");
            document.body.classList.add("col-resizing");

            const onMouseMove = (e2) => {
                const delta = e2.pageX - startX;
                const newWidth = Math.max(40, startWidth + delta);
                th.style.width = newWidth + "px";
                // Also update the min-width to prevent table-layout from shrinking it
                th.style.minWidth = newWidth + "px";
            };

            const onMouseUp = () => {
                handle.classList.remove("active");
                document.body.classList.remove("col-resizing");
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    });

    // Also update table min-width to allow growing beyond initial min
    table.style.minWidth = "auto";
}

function getCloudExportRows() {
    const list = applyCloudFilters(cloudRows);
    return list.map((row) => ({
        datum: row.datum || "",
        show: row.show || "",
        folge: row.folge || "",
        type: row.type || "",
        teilnehmer: row.teilnehmer || "",
        farbe: row.farbe || "",
        komposition: row.komposition || "",
        temperatur: row.temperatur || "",
        zeit: row.zeit || "",
        geldStart: row.geldStart || "",
        geldAenderung: row.geldAenderung || "",
        geldAktuell: row.geldAktuell || "",
        stempel: row.stempel || "",
        textboxText: row.textboxText || "",
        todoItem: row.todoItem || "",
        status: row.status || "",
        schnittTimestamp: row.schnittTimestamp || "",
        cutterInfo: row.cutterInfo || "",
        done: row.done ? "true" : "false",
        id: row.id || ""
    }));
}

function escapeDelimited(value, delimiter) {
    const stringValue = value === null || value === undefined ? "" : String(value);
    const needsQuote = stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r") || stringValue.includes(delimiter);
    const escaped = stringValue.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
}

function exportCloud(format) {
    if (!session) {
        alert("Bitte einloggen für Export.");
        return;
    }
    const rows = getCloudExportRows();
    if (!rows.length) {
        alert("Keine Cloud-Daten zum Exportieren.");
        return;
    }
    const fields = [
        "datum",
        "show",
        "folge",
        "type",
        "teilnehmer",
        "farbe",
        "komposition",
        "temperatur",
        "zeit",
        "geldStart",
        "geldAenderung",
        "geldAktuell",
        "stempel",
        "textboxText",
        "todoItem",
        "status",
        "schnittTimestamp",
        "cutterInfo",
        "done",
        "id"
    ];

    let content = "";
    let mime = "text/plain;charset=utf-8;";
    let extension = "txt";

    if (format === "json") {
        content = JSON.stringify(rows, null, 2);
        mime = "application/json;charset=utf-8;";
        extension = "json";
    } else if (format === "csv") {
        const header = fields.join(",");
        const lines = rows.map(row => fields.map(field => escapeDelimited(row[field], ",")).join(","));
        content = [header, ...lines].join("\n");
        mime = "text/csv;charset=utf-8;";
        extension = "csv";
    } else {
        const header = fields.join("\t");
        const lines = rows.map(row => fields.map(field => escapeDelimited(row[field], "\t")).join("\t"));
        content = [header, ...lines].join("\n");
        mime = "text/tab-separated-values;charset=utf-8;";
        extension = "tsv";
    }

    const filterValue = document.getElementById("cloudFilterFolge")?.value?.trim() || "ALL";
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeFilter = filterValue.replace(/\s+/g, "_").toUpperCase();
    const fileName = `${safeFilter}_${dateStamp}.${extension}`;

    const blob = new Blob([content], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

/** Helper to render a single edit field in the drawer */
function renderEditField(row, key, label, type = "text") {
    const val = row[key] || "";
    // Unique ID for retrieval
    const id = `edit-${row.id}-${key}`;
    return `
        <div class="field">
            <label style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">${label}</label>
            <div class="input-wrap" style="background: var(--bg-primary);">
                 <input type="${type}" id="${id}" value="${val.replace(/"/g, '&quot;')}" style="font-size: 0.9rem;">
            </div>
        </div>
    `;
}

/** Perform the save to Supabase */
window.saveCloudEdit = async function (rowId) {
    if (!session) return;

    // Collect values
    const getVal = (key) => document.getElementById(`edit-${rowId}-${key}`)?.value || "";

    const updates = {
        datum: getVal("datum"),
        show: getVal("show"),
        folge: getVal("folge"),
        type: getVal("type"),
        komposition: getVal("komposition"),
        status: document.getElementById(`edit-status-${rowId}`)?.value || "draft",
        schnitt_timestamp: getVal("schnittTimestamp"),
        cutter_info: getVal("cutterInfo"),
        // JSONB values
        values_json: {
            teilnehmer: getVal("teilnehmer"),
            farbe: getVal("farbe"),
            temperatur: getVal("temperatur"),
            zeit: getVal("zeit"),
            geldStart: getVal("geldStart"),
            geldAenderung: getVal("geldAenderung"),
            geldAktuell: getVal("geldAktuell"),
            stempel: getVal("stempel"),
            textboxText: getVal("textboxText"),
            todoItem: getVal("todoItem"),
            // Preserve/Update profile data in JSON
            player_name: session?.user?.user_metadata?.display_name ?? null,
            avatar_config: session?.user?.user_metadata?.avatar_settings ?? null
        },
        // TODO: History tracking logic here (Phase 2)
    };

    // Optimistic update? No, let's wait for loading.
    setSaveStatus("Speichere Änderungen...", true);

    const { error } = await supabase
        .from("entries")
        .update(updates)
        .eq("id", rowId)
        .eq("user_id", session.user.id); // Security check

    if (error) {
        alert("Fehler: " + error.message);
        setSaveStatus("Fehler beim Speichern", false);
    } else {
        setSaveStatus("Änderungen gespeichert!", true);
        activeEditId = null; // Close drawer
        // Realtime subscription will likely trigger reload, but we can force it or wait.
        // If the table doesn't auto-update from subscription immediately, we might want to manually fetch.
    }
};

function getLocalExportRows() {
    const local = loadLocal();
    return local.map((entry) => ({
        datum: entry.datum || "",
        show: entry.show || "",
        folge: entry.folge || "",
        type: entry.type || "",
        teilnehmer: entry.teilnehmer || "",
        farbe: entry.farbe || "",
        komposition: entry.komposition || "",
        temperatur: entry.temperatur || "",
        zeit: entry.zeit || "",
        geldStart: entry.geldStart || "",
        geldAenderung: entry.geldAenderung || "",
        geldAktuell: entry.geldAktuell || "",
        stempel: entry.stempel || "",
        textboxText: entry.textboxText || "",
        todoItem: entry.todoItem || "",
        status: entry.status || "",
        schnittTimestamp: entry.schnittTimestamp || "",
        cutterInfo: entry.cutterInfo || "",
        done: entry.done ? "true" : "false",
        id: entry.id || ""
    }));
}

function exportLocal(format) {
    const rows = getLocalExportRows();
    if (!rows.length) {
        alert("Keine lokalen Daten zum Exportieren.");
        return;
    }
    const fields = [
        "datum",
        "show",
        "folge",
        "type",
        "teilnehmer",
        "farbe",
        "komposition",
        "temperatur",
        "zeit",
        "geldStart",
        "geldAenderung",
        "geldAktuell",
        "stempel",
        "textboxText",
        "todoItem",
        "status",
        "schnittTimestamp",
        "cutterInfo",
        "done",
        "id"
    ];

    let content = "";
    let mime = "text/plain;charset=utf-8;";
    let extension = "txt";

    if (format === "json") {
        content = JSON.stringify(rows, null, 2);
        mime = "application/json;charset=utf-8;";
        extension = "json";
    } else if (format === "csv") {
        const header = fields.join(",");
        const lines = rows.map(row => fields.map(field => escapeDelimited(row[field], ",")).join(","));
        content = [header, ...lines].join("\n");
        mime = "text/csv;charset=utf-8;";
        extension = "csv";
    } else {
        const header = fields.join("\t");
        const lines = rows.map(row => fields.map(field => escapeDelimited(row[field], "\t")).join("\t"));
        content = [header, ...lines].join("\n");
        mime = "text/tab-separated-values;charset=utf-8;";
        extension = "tsv";
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `LOCAL_${dateStamp}.${extension}`;

    const blob = new Blob([content], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

function updateMainExportVisibility(syncState) {
    const wrap = document.getElementById("mainExportWrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (syncState === "green") {
        const mini = document.createElement("button");
        mini.className = "main-export-mini";
        mini.title = "Lokalen Export öffnen";
        mini.innerHTML = '<span class="material-icons" style="font-size:18px;">download</span>';
        mini.addEventListener("click", () => exportLocal("tsv"));
        wrap.appendChild(mini);
        return;
    }

    const btn = document.createElement("button");
    btn.className = "btn btn-primary main-export-btn";
    btn.innerHTML = '<span class="material-icons">download</span>Export (lokal)';
    btn.addEventListener("click", () => {
        exportLocal("tsv");
    });
    wrap.appendChild(btn);
}

async function openCloud() {
    if (!session) {
        openCloudModal();
        const body = document.getElementById("cloudTableBody");
        if (body) {
            body.innerHTML = `
                <tr>
                    <td colspan="21">
                        <div class="helper-text">Bitte zuerst einloggen, um die Cloud zu sehen.</div>
                    </td>
                </tr>
            `;
        }
        return;
    }

    openCloudModal();

    const { data, error } = await supabase
        .from("entries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        alert(error.message);
        return;
    }

    cloudRows = data.map(formatCloudRow);
    renderCloudTable();

    // Realtime subscribe
    if (cloudChannel) await supabase.removeChannel(cloudChannel);

    cloudChannel = supabase
        .channel("entries-cloud")
        .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, (payload) => {
            if (payload.eventType === "INSERT") {
                const row = formatCloudRow(payload.new);
                cloudRows = [row, ...cloudRows.filter(item => item.id !== row.id)];
                renderCloudTable();
            }
            if (payload.eventType === "UPDATE") {
                const row = formatCloudRow(payload.new);
                cloudRows = cloudRows.map(item => (item.id === row.id ? row : item));
                renderCloudTable();
            }
            if (payload.eventType === "DELETE") {
                const id = payload.old?.id;
                cloudRows = cloudRows.filter(item => item.id !== id);
                renderCloudTable();
            }
        })
        .subscribe();
}

/** ===== Wire Buttons ===== */
// loginBtn logic is handled in updateAuthUI() to switch between Login and Profile helpers.
// Removing the duplicate event listener that caused immediate logout.

if (cloudBtn) {
    cloudBtn.addEventListener("click", openCloud);
}

initAuth();
console.log("SESSION:", session);

window.saveEntry = saveEntry;

const cloudCloseBtn = document.getElementById("cloudCloseBtn");
if (cloudCloseBtn) {
    cloudCloseBtn.addEventListener("click", closeCloudModal);
}

const cloudCloseBtn2 = document.getElementById("cloudCloseBtn2");
if (cloudCloseBtn2) {
    cloudCloseBtn2.addEventListener("click", closeCloudModal);
}

// ESC key closes cloud page
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const modal = document.getElementById("cloudModal");
        if (modal && modal.style.display !== "none") {
            closeCloudModal();
        }
    }
});

const authModal = document.getElementById("authModal");
const authCloseBtn = document.getElementById("authCloseBtn");
const authLoginBtn = document.getElementById("authLoginBtn");
const authSignupBtn = document.getElementById("authSignupBtn");

function openAuthModal() {
    if (authModal) authModal.style.display = "flex";
}

function closeAuthModal() {
    if (authModal) authModal.style.display = "none";
}

if (authCloseBtn) {
    authCloseBtn.addEventListener("click", closeAuthModal);
}

if (authModal) {
    authModal.addEventListener("click", (event) => {
        if (event.target === authModal) closeAuthModal();
    });
}

if (authLoginBtn) {
    authLoginBtn.addEventListener("click", async () => {
        await doLogin();
    });
}

if (authSignupBtn) {
    authSignupBtn.addEventListener("click", async () => {
        await doSignup();
    });
}

["cloudFilterFolge", "cloudFilterStatus", "cloudSort"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener("input", renderCloudTable);
        input.addEventListener("change", renderCloudTable);
    }
});

const cloudExportTsv = document.getElementById("cloudExportTsv");
const cloudExportCsv = document.getElementById("cloudExportCsv");
const cloudExportJson = document.getElementById("cloudExportJson");

if (cloudExportTsv) {
    cloudExportTsv.addEventListener("click", () => exportCloud("tsv"));
}
if (cloudExportCsv) {
    cloudExportCsv.addEventListener("click", () => exportCloud("csv"));
}
if (cloudExportJson) {
    cloudExportJson.addEventListener("click", () => exportCloud("json"));
}


