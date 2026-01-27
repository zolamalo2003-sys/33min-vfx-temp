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

    const storageOk = await isStorageReliable();
    let state = "orange";
    let title = "Guest-Modus";
    let text = "Einträge werden nur lokal im Browser gespeichert. Bleiben bei Reload, können aber durch Browserdaten löschen/Inkognito verloren gehen.";

    if (!storageOk) {
        state = "red";
        title = "Nicht sicher gespeichert";
        text = "Privater Modus oder Speicher nicht dauerhaft. Einträge können beim Schließen/Browser-Cleanup verloren gehen.";
    } else if (session) {
        state = "green";
        title = "Cloud aktiv";
        text = "Eingeloggt. Einträge werden im Account in der Cloud gespeichert und sind im Team sichtbar.";
    }

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
    updateAuthUI();
    updateSyncIndicator();

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session = newSession;
        updateAuthUI();
        updateSyncIndicator();
        if (session) {
            closeAuthModal();
            // direkt nach Login: lokalen Kram in Cloud übernehmen
            await syncLocalToCloud();
        }
    });
}

function updateAuthUI() {
    const loggedIn = !!session;

    // Login button text
    if (loginBtn) loginBtn.textContent = loggedIn ? "Logout" : "Login";

    // Cloud Button sperren wenn nicht eingeloggt
    if (cloudBtn) cloudBtn.disabled = !loggedIn;
}

/** ===== Login/Logout ===== */
async function doLogin() {
  const email = document.getElementById("authEmail")?.value?.trim() || prompt("E-Mail:");
  if (!email) return;

  const password = document.getElementById("authPassword")?.value || prompt("Passwort:");
  if (!password) return;

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
        created_by_email: row.created_by_email || null
    };
};

function openCloudModal() {
    const modal = document.getElementById("cloudModal");
    if (modal) modal.style.display = "flex";
}

function closeCloudModal() {
    const modal = document.getElementById("cloudModal");
    if (modal) modal.style.display = "none";
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
        const aVal = new Date(a.datum || 0).getTime();
        const bVal = new Date(b.datum || 0).getTime();
        return sortValue === "datum_asc" ? aVal - bVal : bVal - aVal;
    });
    return filtered;
}

function renderCloudTable() {
    const body = document.getElementById("cloudTableBody");
    if (!body) return;
    const list = applyCloudFilters(cloudRows);
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
    body.innerHTML = list.map((row) => {
        const canEdit = currentUserId && row.user_id === currentUserId;
        const userCode = emailCode(row.created_by_email);
        const userColor = hashToColor(row.user_id || "");
        return `
            <tr data-cloud-id="${row.id}">
                <td>
                    <span class="user-badge" style="background:${userColor}" title="User: ${userCode}">${userCode}</span>
                </td>
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
                    <span class="cloud-badge ${cloudStatusClass(row.status)}">${row.status || "draft"}</span>
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

    body.querySelectorAll("[data-done]").forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
            if (checkbox.disabled) return;
            const id = checkbox.getAttribute("data-done");
            const row = cloudRows.find(item => item.id === id);
            if (!row) return;
            const { error } = await supabase
                .from("entries")
                .update({ done: checkbox.checked })
                .eq("id", id);
            if (error) alert(error.message);
        });
    });

    body.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            const id = btn.getAttribute("data-edit");
            const row = cloudRows.find(item => item.id === id);
            if (!row) return;
            const status = prompt('Status setzen ("draft", "ready", "done"):', row.status || "draft");
            if (!status) return;
            const normalized = status.toLowerCase();
            const allowed = ["draft", "ready", "done"];
            if (!allowed.includes(normalized)) {
                alert("Ungültiger Status.");
                return;
            }
            const { error } = await supabase
                .from("entries")
                .update({ status: normalized })
                .eq("id", id);
            if (error) alert(error.message);
        });
    });

    body.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            const id = btn.getAttribute("data-delete");
            const confirmed = confirm("Eintrag wirklich löschen?");
            if (!confirmed) return;
            const { error } = await supabase
                .from("entries")
                .delete()
                .eq("id", id);
            if (error) alert(error.message);
        });
    });
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
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    if (session) {
      await doLogout();
      return;
    }
    openAuthModal();
  });
}

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

const cloudModal = document.getElementById("cloudModal");
if (cloudModal) {
    cloudModal.addEventListener("click", (event) => {
        if (event.target === cloudModal) closeCloudModal();
    });
}

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
