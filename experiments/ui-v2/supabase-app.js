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
    if (!modal) {
        console.warn("Profile modal not found in DOM");
        return;
    }
    if (!session) return;

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
    if (!modal) return;

    modal.style.display = "flex"; // Ensure container is visible

    // Inject Console Layout
    modal.innerHTML = `
        <div class="cloud-modal-overlay open">
            <div class="console-layout">
                <!-- Header -->
                <header class="console-header">
                    <div class="header-content">
                        <h2>Cloud-Einträge</h2>
                        <div class="header-meta">
                            Alle Team-Einträge · <span id="cloudRowCount">0</span> Einträge
                        </div>
                    </div>
                    <div class="header-actions">
                        <div class="console-search">
                            <input type="text" id="consoleSearch" placeholder="Suchen (Text/ID)...">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <!-- Exports -->
                        <button class="icon-btn" id="consoleExportTSV" title="Export TSV">
                            <span class="material-icons">description</span>
                        </button>
                         <button class="icon-btn" id="consoleExportJSON" title="Export JSON">
                            <span class="material-icons">code</span>
                        </button>
                        <button class="btn btn-primary" id="consoleCloseBtn" style="height:36px; padding:0 16px;">
                            Schließen
                        </button>
                    </div>
                </header>

                <!-- Toolbar -->
                <div class="console-toolbar">
                     <div class="filter-pill">
                        <span class="material-icons" style="font-size:16px;">filter_list</span>
                        <select id="cloudFilterStatus">
                            <option value="">Status: Alle</option>
                            <option value="draft">Entwurf</option>
                            <option value="ready">Bereit</option>
                            <option value="exported">Exportiert</option>
                            <option value="error">Fehler</option>
                        </select>
                    </div>
                    
                    <div class="filter-pill">
                         <span class="material-icons" style="font-size:16px;">tag</span>
                         <input type="text" id="cloudFilterFolge" placeholder="Folge (z.B. EP01)" style="width: 100px;">
                    </div>

                    <div class="filter-pill" style="margin-left:auto;">
                        <span class="material-icons" style="font-size:16px;">sort</span>
                        <select id="cloudSort">
                            <option value="created_desc">Neueste zuerst</option>
                            <option value="created_asc">Älteste zuerst</option>
                        </select>
                    </div>
                </div>

                <!-- Content -->
                <div class="console-content" id="cloudContentArea">
                    <!-- Cards will be injected here -->
                </div>
            </div>
        </div>
    `;

    // Re-attach listeners
    document.getElementById("consoleCloseBtn")?.addEventListener("click", closeCloudModal);
    document.getElementById("consoleExportTSV")?.addEventListener("click", () => exportCloud("tsv"));
    document.getElementById("consoleExportJSON")?.addEventListener("click", () => exportCloud("json"));

    // Bind filters
    const filterIds = ["cloudFilterFolge", "cloudFilterStatus", "cloudSort", "consoleSearch"];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", renderCloudConsole);
            el.addEventListener("change", renderCloudConsole);
        }
    });

    document.body.style.overflow = "hidden";
}

function closeCloudModal() {
    const modal = document.getElementById("cloudModal");
    if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = "";
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

window.toggleEntryDetails = function (id) {
    const card = document.querySelector(`.entry-card[data-id="${id}"]`);
    if (card) {
        card.classList.toggle("expanded");
    }
};

// Forward declaration for renderCloudConsole to avoid ReferenceError
let renderCloudConsole;

renderCloudConsole = function () {
    const container = document.getElementById("cloudContentArea");
    if (!container) return;

    // Apply basic filters
    let list = applyCloudFilters(cloudRows);

    // Apply Search
    const searchVal = document.getElementById("consoleSearch")?.value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(row => {
            const str = (row.show + " " + row.folge + " " + row.type + " " + row.textboxText + " " + row.todoItem + " " + row.player_name).toLowerCase();
            return str.includes(searchVal);
        });
    }

    // Update count
    const countEl = document.getElementById("cloudRowCount");
    if (countEl) countEl.textContent = list.length;

    if (!list.length) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--text-muted); gap:12px;">
                <span class="material-icons" style="font-size:48px; opacity:0.5;">inbox</span>
                <span>Keine Einträge gefunden.</span>
            </div>
        `;
        return;
    }

    const currentUserId = session?.user?.id;

    container.innerHTML = list.map((row) => {
        // --- Avatar Logic ---
        let userDisplay = "";
        // 1. Try Config
        const metaValues = (row.avatar_config || row.values_json?.avatar_config) ?
            (row.avatar_config || row.values_json.avatar_config) : null;

        const playerName = row.player_name || row.values_json?.player_name || row.created_by_email || "User";

        if (metaValues && metaValues.style && metaValues.seed) {
            const avatarUrl = `https://api.dicebear.com/9.x/${metaValues.style}/svg?seed=${encodeURIComponent(metaValues.seed)}&backgroundColor=${metaValues.bgColor || 'transparent'}`;
            userDisplay = `<img src="${avatarUrl}" class="cloud-avatar-img" title="${playerName}">`;
        } else {
            // Fallback Initials
            const email = row.created_by_email || "???";
            const userCode = emailCode(email);
            const hash = (row.user_id || email).split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
            const hue = Math.abs(hash % 360);
            const pastelColor = `hsl(${hue}, 70%, 80%)`;
            const textColor = `hsl(${hue}, 80%, 20%)`;
            userDisplay = `<div class="cloud-avatar-initials" style="background-color: ${pastelColor}; color: ${textColor};" title="${playerName}">${userCode}</div>`;
        }

        // --- Badges ---
        const typeBadge = row.type ? `<span class="ec-badge type">${row.type}</span>` : "";
        const showBadge = row.show ? `<span class="ec-badge show">${row.show}</span>` : "";
        const folgeBadge = row.folge ? `<span class="ec-badge folge">${row.folge}</span>` : "";

        // --- Preview Text ---
        // Prefer explicit text fields, else generic
        let previewText = row.textboxText || row.todoItem || row.cutterInfo || "Keine Text-Details";
        if (previewText.length > 80) previewText = previewText.slice(0, 80) + "...";

        // --- Status ---
        const statusLabel = row.status || "Entwurf";
        const statusClass = row.status === "ready" ? "ready" : (row.status === "exported" ? "exported" : "draft");

        // --- Date ---
        const dateObj = new Date(row.created_at);
        const day = dateObj.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
        const time = dateObj.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

        return `
        <div class="entry-card" data-id="${row.id}" onclick="toggleEntryDetails('${row.id}')">
            <!-- Left: Avatar & Date -->
            <div class="ec-left">
                ${userDisplay}
                <div class="ec-date">${day}<br>${time}</div>
            </div>

            <!-- Main: Badges & Preview -->
            <div class="ec-main">
                <div class="ec-header">
                    <span style="font-weight:700; font-size:0.9rem; color:var(--text);">${playerName}</span>
                    <div class="ec-badges">
                        ${showBadge}
                        ${folgeBadge}
                        ${typeBadge}
                    </div>
                </div>
                <div class="ec-preview">${previewText.replace(/</g, "&lt;")}</div>
            </div>

            <!-- Meta: Status & Extra -->
            <div class="ec-meta">
                <span class="status-indicator ${statusClass}">${statusLabel}</span>
                <span>${row.komposition || ""}</span>
                <span>${row.zeit || ""}</span>
            </div>

            <!-- Actions -->
            <div class="ec-actions">
                <button class="icon-btn" title="Mehr anzeigen">
                    <span class="material-icons">expand_more</span>
                </button>
            </div>

            <!-- Expanded Details -->
            <div class="entry-details" onclick="event.stopPropagation();">
                <div class="detail-grid">
                    <div class="detail-box">
                        <span class="detail-label">Text / Inhalt</span>
                        <div class="detail-text">${(row.textboxText || row.todoItem || "-").replace(/</g, "&lt;")}</div>
                    </div>
                    <div class="detail-box">
                        <span class="detail-label">Metadaten</span>
                        <div style="font-size:0.85rem; display:grid; grid-template-columns:auto 1fr; gap:8px;">
                            <span style="color:var(--text-muted);">Teilnehmer:</span> <span>${row.teilnehmer || "-"}</span>
                            <span style="color:var(--text-muted);">Farbe:</span> <span>${row.farbe || "-"}</span>
                            <span style="color:var(--text-muted);">Geld:</span> <span>${row.geldStart || "-"} → ${row.geldAktuell || "-"}</span>
                            <span style="color:var(--text-muted);">Cutter Info:</span> <span>${row.cutterInfo || "-"}</span>
                        </div>
                    </div>
                </div>
                <div class="detail-actions">
                     <button class="btn btn-secondary" onclick="exportCloud('tsv')">Export This (TSV)</button>
                     ${(currentUserId === row.user_id) ?
                `<button class="btn btn-primary" onclick="activeEditId='${row.id}'; renderCloudConsole();">Bearbeiten (Coming Soon)</button>` :
                `<span style="color:var(--text-muted); font-size:0.8rem; align-self:center;">Nur eigene Einträge bearbeitbar</span>`
            }
                </div>
            </div>
        </div>
        `;
    }).join("");

    // --- EVENT LISTENERS ---

    // Checkbox Done
    container.querySelectorAll("[data-done]").forEach((checkbox) => {
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
    container.querySelectorAll("[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => {
            const editId = btn.getAttribute("data-edit");
            activeEditId = editId;
            renderCloudTable();
        });
    });

    // Delete
    container.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const deleteId = btn.getAttribute("data-delete");
            if (!confirm("Eintrag wirklich löschen?")) return;
            const { error } = await supabase.from("entries").delete().eq("id", deleteId);
            if (error) alert("Lösch-Fehler: " + error.message);
        });
    });

    // Cancel Edit
    container.querySelectorAll(".cancel-edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeEditId = null;
            renderCloudTable();
        });
    });

    // Save Edit
    container.querySelectorAll(".save-edit-btn").forEach(btn => {
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
    renderCloudConsole();

    // Realtime subscribe
    if (cloudChannel) await supabase.removeChannel(cloudChannel);

    cloudChannel = supabase
        .channel("entries-cloud")
        .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, (payload) => {
            if (payload.eventType === "INSERT") {
                const row = formatCloudRow(payload.new);
                cloudRows = [row, ...cloudRows.filter(item => item.id !== row.id)];
                renderCloudConsole();
            }
            if (payload.eventType === "UPDATE") {
                const row = formatCloudRow(payload.new);
                cloudRows = cloudRows.map(item => (item.id === row.id ? row : item));
                renderCloudConsole();
            }
            if (payload.eventType === "DELETE") {
                const id = payload.old?.id;
                cloudRows = cloudRows.filter(item => item.id !== id);
                renderCloudConsole();
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

// Wrapper function that calls renderCloudConsole for backward compatibility
// Defined early to be available for event listeners
function renderCloudTable() {
    if (typeof renderCloudConsole === 'function') {
        renderCloudConsole();
    } else {
        console.warn("renderCloudConsole not available yet");
    }
}

// Register event listeners AFTER renderCloudTable is defined
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



/** 
 * ==========================================
 * AI REWRITE FEATURE INTEGRATION 
 * ==========================================
 */
// 1. Monkey-patch or poll? Polling is safest for dynamic DOM
let globalAiService = null; // Fix: Scope variable for usage in handleAiClick

async function setupAiFeature() {
    console.log("%cAI Feature: Starting...", "background: #222; color: #bada55; padding: 4px; border-radius: 4px;");

    // Dynamic import to handle potential loading errors gracefully
    try {
        const module = await import("/experiments/ui-v2/ai-service.js");
        globalAiService = module.aiService;
        console.log("AI Service module loaded successfully.");

        // Try to auto-load model from cache (silent)
        try {
            await globalAiService.loadModel(() => {
                // Silent progress - no UI during auto-load
            });
            console.log("AI Model auto-loaded from cache!");
        } catch (e) {
            // Model not in cache - user will need to download on first use
            console.log("AI Model not cached yet - will download on first use");
        }
    } catch (e) {
        console.warn("AI Service failed to load (this is optional):", e.message);
        // AI feature is optional - don't block the app
        return;
    }

    // Polling interval to ensure UI is injected
    setInterval(() => {
        try {
            const textContent = document.getElementById('qTextContent');
            const todoContent = document.getElementById('qTodoContent');

            const targets = [
                { el: textContent, type: 'textbox' },
                { el: todoContent, type: 'todo' }
            ];

            targets.forEach(({ el, type }) => {
                if (el) {
                    const wrapper = el.parentElement;
                    if (wrapper) {
                        // Ensure wrapper is positioned
                        if (getComputedStyle(wrapper).position === 'static') {
                            wrapper.style.position = 'relative';
                        }

                        // Check if button already exists
                        if (!wrapper.querySelector('.ai-btn')) {
                            console.log(`AI: Injecting button for ${type}`);
                            injectAiUI(type, wrapper, el);
                        }
                    }
                }
            });
        } catch (err) {
            console.error("AI Poll Error:", err);
        }
    }, 800);
}

let currentAiAbort = null;

function injectAiUI(type, wrapper, textarea) {
    if (!wrapper || !textarea) return;

    // Create Button
    const btn = document.createElement('div');
    btn.className = 'ai-btn';
    btn.innerHTML = '<span class="material-icons">auto_awesome</span>';
    btn.title = "Rewrite with AI";
    btn.style.zIndex = "10"; // Ensure visibility

    // Attach click handler (using dynamic import variable via closure or window.aiService?)
    // better to attach to handleAiClick which imports aiService separately? 
    // No, handleAiClick is in this file. But 'aiService' variable from import above is scoped to setupAiFeature.
    // Solution: Assign to window or module scope variable.
    // We'll use the imported module via window/global or re-import in handleAiClick? 
    // Re-importing is fine as it's cached.

    btn.onclick = (e) => handleAiClick(e, type, textarea);

    wrapper.appendChild(btn);
    console.log(`AI: Button injected for ${type}`);
}

function removeAiUI() {
    // Cleanup if needed (the form rewrites itself so maybe not strictly needed, but good practice)
    document.querySelectorAll('.ai-suggestions').forEach(el => el.remove());
}

async function handleAiClick(e, type, textarea) {
    e.stopPropagation();
    e.preventDefault();

    const text = textarea.value.trim();
    if (!text) {
        showToast("Bitte erst Text eingeben.");
        return;
    }

    if (text.length > 600) {
        showToast("Text zu lang (max 600 Zeichen).");
        return;
    }

    // Check if model loaded
    if (!globalAiService.engine) {
        showAiConsentModal(() => startAiGeneration(type, textarea));
        return;
    }

    startAiGeneration(type, textarea);
}

function showAiConsentModal(onConfirm) {
    // Create modal
    const modalId = 'aiConsentModal';
    if (document.getElementById(modalId)) return;

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '9999';

    const modelSize = "~600 MB";

    overlay.innerHTML = `
        <div class="modal-content ai-modal-content">
            <div class="ai-hero-icon"><span class="material-icons">auto_awesome</span></div>
            <div class="panel-title" style="margin-bottom:24px; justify-content:center;">Kurzer Hinweis 🦖</div>
            
            <div class="ai-desc-text">
                <p>
                    Wenn du die KI-Taste nutzt, lädt einmalig das KI Modell runter ${modelSize}. Danach läuft alles direkt in deinem Browser – ohne Installation.
                </p>
                
                <div class="ai-divider"></div>
             <p>
  Das KI Modell heißt Llama-3.2-1B und basiert auf
  <a
    href="https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/tree/main"
    target="_blank"
    rel="noreferrer noopener"
    class="ai-link-highlight"
  >
    Open Source
    <svg class="ai-icon-external" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
    </svg>
  </a>
  Dein Text bleibt auf deinem Rechner, es wird nichts an externe Server gesendet.
</p>
                
                <div class="ai-callout">
                    Weil keine Cloud-Rechenzentren pro Anfrage laufen müssen, ist das meistens auch etwas ressourcenschonender.
                </div>
            </div>

            <div class="ai-modal-actions-primary">
                <button class="btn" style="width:100px;" onclick="document.getElementById('${modalId}').remove()">Später</button>
                <button class="btn btn-primary" style="width:100px;" id="aiConfirmBtn">Ok Chef</button>
            </div>
            
            <div class="ai-modal-actions-secondary">
                <a href="/experiments/ui-v2/ai" target="_blank" rel="noreferrer noopener" class="ai-btn-ghost">
                    Mehr erfahren 
                    <svg class="ai-icon-link" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                    </svg>
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('aiConfirmBtn').onclick = async () => {
        // Start download
        document.getElementById(modalId).remove();

        // Create progress indicator
        const progressToast = document.createElement('div');
        progressToast.className = 'notification';
        progressToast.id = 'aiProgressToast';
        progressToast.innerHTML = `
            <span class="material-icons">download</span>
            <div style="flex: 1;">
                <div style="font-size: 0.9rem; margin-bottom: 4px;">Lade AI Model...</div>
                <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                    <div id="aiProgressBar" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(progressToast);

        const btn = document.querySelector('.ai-btn');
        if (btn) btn.classList.add('thinking');

        try {
            await globalAiService.loadModel((progress) => {
                console.log("AI Progress:", progress);
                // Update progress bar
                const progressBar = document.getElementById('aiProgressBar');
                if (progressBar && progress.progress !== undefined) {
                    progressBar.style.width = (progress.progress * 100) + '%';
                }
            });

            if (btn) btn.classList.remove('thinking');
            progressToast.remove();
            showToast("AI Bereit!", 2000);
            onConfirm();
        } catch (err) {
            if (btn) btn.classList.remove('thinking');
            progressToast.remove();
            alert("Fehler beim Laden: " + err.message);
        }
    };
}

async function startAiGeneration(type, textarea) {
    const btn = document.querySelector('.ai-btn');
    if (btn) btn.classList.add('thinking');

    // Remove old suggestions
    document.querySelectorAll('.ai-suggestions').forEach(el => el.remove());

    try {
        const text = textarea.value;
        const suggestions = await globalAiService.generateRewrites(text, type);

        if (btn) btn.classList.remove('thinking');

        if (!suggestions || suggestions.length === 0) {
            showToast("Keine Vorschläge generiert.");
            return;
        }

        showSuggestions(suggestions, textarea);

    } catch (err) {
        if (btn) btn.classList.remove('thinking');
        console.error(err);
        showToast("Fehler bei der Generierung.");
    }
}

function showSuggestions(suggestions, textarea) {
    // Remove any existing suggestions first
    document.querySelectorAll('.ai-suggestions').forEach(el => el.remove());

    const container = document.createElement('div');
    container.className = 'ai-suggestions';



    container.innerHTML = `
        <div class="ai-header">
            <div class="ai-label"><span class="material-icons" style="font-size:14px;">auto_awesome</span> AI Vorschläge</div>
            <button class="icon-btn" style="width:20px; height:20px; border:none;" onclick="this.closest('.ai-suggestions').remove()">
                <span class="material-icons" style="font-size:16px;">close</span>
            </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px; max-height: 70vh; overflow-y:auto; padding-right: 8px;">
            ${suggestions.map((s, i) => `
                <div class="ai-suggestion-card" data-index="${i}">
                    ${s}
                </div>
            `).join('')}
        </div>
        <div class="ai-actions">
            <button class="action-btn" title="Neu generieren" onclick="regenerateAi()">
                <span class="material-icons">refresh</span>
            </button>
        </div>
    `;

    // Position RECHTS vom Composer - fixed on right side
    container.style.position = 'fixed';
    container.style.right = '20px';
    container.style.top = '120px';
    container.style.width = '380px';
    container.style.maxWidth = 'calc(100vw - 500px)';
    container.style.maxHeight = 'calc(100vh - 140px)';
    container.style.zIndex = '10000';

    document.body.appendChild(container);

    // Store reference to textarea for later use
    container.dataset.textareaId = textarea.id;
    container.dataset.suggestions = JSON.stringify(suggestions);

    // Add click handlers to suggestion cards
    container.querySelectorAll('.ai-suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            applySuggestion(card, index);
        });
    });

    // Close on outside click
    setTimeout(() => {
        const closeOnOutsideClick = (e) => {
            if (!container.contains(e.target)) {
                container.remove();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        document.addEventListener('click', closeOnOutsideClick);
    }, 100);
}

function applySuggestion(card, index) {
    const suggestionsContainer = card.closest('.ai-suggestions');
    const suggestions = JSON.parse(suggestionsContainer.dataset.suggestions);
    const text = suggestions[index];

    // Find the textarea by stored ID
    const textareaId = suggestionsContainer.dataset.textareaId;
    const textarea = document.getElementById(textareaId);

    if (!textarea) {
        console.error("Textarea not found with ID:", textareaId);
        return;
    }

    const original = textarea.value;

    // Apply
    textarea.value = text;

    // Trigger input event for autosave/etc if bound
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Remove suggestions
    card.closest('.ai-suggestions').remove();

    // Undo Toast
    const toast = document.createElement('div');
    toast.className = 'notification';
    toast.innerHTML = `
        <span>Text ersetzt.</span>
        <button style="background:transparent; border:none; color:var(--primary); font-weight:700; cursor:pointer; margin-left:10px;" id="undoAi">Rückgängig</button>
    `;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000); // 4s display

    document.getElementById('undoAi').onclick = () => {
        textarea.value = original;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        toast.remove();
    };
}

window.regenerateAi = function () {
    // Just trigger click again on the button
    const btn = document.querySelector('.ai-btn');
    if (btn) btn.click();
};

function showToast(msg, duration = 3000) {
    // Reuse existing showNotification if available globally, else create one
    if (window.showNotification) {
        window.showNotification(msg, duration);
    } else {
        alert(msg);
    }
}

// Start Setup on module load
setupAiFeature();

