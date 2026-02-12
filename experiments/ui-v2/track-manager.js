/**
 * Track Manager – handles GPX/KML/KMZ import, display, editing, comments
 */

const COLORS = {
    "Jerry": "#19baf0",
    "Marc": "#10b981",
    "Taube": "#ef4444",
    "Käthe": "#f97316",
    "Kodiak": "#8b5cf6",
    "default": "#9ca3af"
};

// State
let tracks = []; // Array of track objects
let selectedTrackId = null;
let selectedPointIndex = null;
let trimMode = false;
let trimStart = null;
let trimEnd = null;
let mapRef = null;

/**
 * Track object shape:
 * {
 *   id: string,
 *   name: string,
 *   person: string,
 *   comment: string,
 *   points: [{ lat, lng, ele, time, comment }],
 *   polylineRef: L.Polyline,
 *   markerRefs: L.Marker[],
 *   visible: true
 * }
 */

// ─── INIT ───────────────────────────────────────
export function initTrackManager(map) {
    mapRef = map;
    bindTrackEvents();
}

function bindTrackEvents() {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("trackFileInput");

    if (!dropZone || !fileInput) return;

    // Click to upload
    dropZone.addEventListener("click", (e) => {
        if (e.target.tagName !== "SPAN" || !e.target.classList.contains("text-primary")) {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
        handleFiles(e.target.files);
        fileInput.value = ""; // Reset
    });

    // Drag & Drop
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        handleFiles(e.dataTransfer.files);
    });

    // Clear all tracks
    document.getElementById("btnClearTracks")?.addEventListener("click", () => {
        if (!tracks.length) return;
        if (!confirm("Alle Tracks löschen?")) return;
        clearAllTracks();
    });

    // Trim button
    document.getElementById("btnTrimTrack")?.addEventListener("click", () => {
        toggleTrimMode();
    });

    // Track comment
    document.getElementById("trackComment")?.addEventListener("input", (e) => {
        const track = getSelectedTrack();
        if (track) track.comment = e.target.value;
    });
}

// ─── FILE HANDLING ──────────────────────────────
async function handleFiles(fileList) {
    const person = document.getElementById("trackPersonSelect")?.value || "Jerry";

    for (const file of fileList) {
        const ext = file.name.split(".").pop().toLowerCase();
        try {
            if (ext === "gpx") {
                const text = await file.text();
                const points = parseGPX(text);
                addTrack(file.name, person, points);
            } else if (ext === "kml") {
                const text = await file.text();
                const points = parseKML(text);
                addTrack(file.name, person, points);
            } else if (ext === "kmz") {
                const arrayBuffer = await file.arrayBuffer();
                const points = await parseKMZ(arrayBuffer);
                addTrack(file.name, person, points);
            } else {
                console.warn("Unsupported file type:", ext);
            }
        } catch (err) {
            console.error(`Error parsing ${file.name}:`, err);
            alert(`Fehler beim Laden von "${file.name}": ${err.message}`);
        }
    }
}

// ─── PARSERS ────────────────────────────────────
function parseGPX(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const points = [];

    // Parse <trkpt> elements
    const trkpts = doc.querySelectorAll("trkpt");
    trkpts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute("lat"));
        const lng = parseFloat(pt.getAttribute("lon"));
        const eleEl = pt.querySelector("ele");
        const timeEl = pt.querySelector("time");
        points.push({
            lat, lng,
            ele: eleEl ? parseFloat(eleEl.textContent) : null,
            time: timeEl ? timeEl.textContent : null,
            comment: ""
        });
    });

    // Also parse <wpt> for waypoints
    const wpts = doc.querySelectorAll("wpt");
    wpts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute("lat"));
        const lng = parseFloat(pt.getAttribute("lon"));
        const eleEl = pt.querySelector("ele");
        const nameEl = pt.querySelector("name");
        points.push({
            lat, lng,
            ele: eleEl ? parseFloat(eleEl.textContent) : null,
            time: null,
            comment: nameEl ? nameEl.textContent : ""
        });
    });

    // If no trkpts found, try <rtept> (route points)
    if (trkpts.length === 0 && wpts.length === 0) {
        const rtepts = doc.querySelectorAll("rtept");
        rtepts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute("lat"));
            const lng = parseFloat(pt.getAttribute("lon"));
            points.push({ lat, lng, ele: null, time: null, comment: "" });
        });
    }

    if (points.length === 0) throw new Error("Keine Trackpunkte in GPX gefunden.");
    return points;
}

function parseKML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const points = [];

    // Get all <coordinates> elements
    const coordEls = doc.querySelectorAll("coordinates");
    coordEls.forEach(coordEl => {
        const text = coordEl.textContent.trim();
        const lines = text.split(/\s+/);
        lines.forEach(line => {
            const parts = line.split(",");
            if (parts.length >= 2) {
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                const ele = parts.length >= 3 ? parseFloat(parts[2]) : null;
                if (!isNaN(lat) && !isNaN(lng)) {
                    points.push({ lat, lng, ele, time: null, comment: "" });
                }
            }
        });
    });

    if (points.length === 0) throw new Error("Keine Koordinaten in KML gefunden.");
    return points;
}

async function parseKMZ(arrayBuffer) {
    if (typeof JSZip === "undefined") {
        throw new Error("JSZip nicht geladen. KMZ-Dateien können nicht geöffnet werden.");
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    // Find KML file inside ZIP
    let kmlContent = null;
    for (const [filename, file] of Object.entries(zip.files)) {
        if (filename.toLowerCase().endsWith(".kml")) {
            kmlContent = await file.async("string");
            break;
        }
    }

    if (!kmlContent) throw new Error("Keine KML-Datei im KMZ-Archiv gefunden.");
    return parseKML(kmlContent);
}

// ─── TRACK MANAGEMENT ───────────────────────────
function addTrack(filename, person, points) {
    const id = crypto.randomUUID();
    const color = COLORS[person] || COLORS.default;

    // Create polyline
    const latlngs = points.map(p => [p.lat, p.lng]);
    const polyline = L.polyline(latlngs, {
        color: color,
        weight: 3,
        opacity: 0.85,
        smoothFactor: 1,
        dashArray: null
    }).addTo(mapRef);

    const track = {
        id,
        name: filename.replace(/\.(gpx|kml|kmz)$/i, ""),
        person,
        comment: "",
        points,
        polylineRef: polyline,
        markerRefs: [],
        visible: true
    };

    tracks.push(track);

    // Fit map to track
    if (latlngs.length > 0) {
        mapRef.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    }

    // Click polyline to select track
    polyline.on("click", () => {
        selectTrack(id);
    });

    selectTrack(id);
    renderTracksList();
}

function removeTrack(id) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    // Remove from map
    mapRef.removeLayer(track.polylineRef);
    track.markerRefs.forEach(m => mapRef.removeLayer(m));

    tracks = tracks.filter(t => t.id !== id);

    if (selectedTrackId === id) {
        selectedTrackId = null;
        hideTrackDetail();
    }

    renderTracksList();
}

function clearAllTracks() {
    tracks.forEach(t => {
        mapRef.removeLayer(t.polylineRef);
        t.markerRefs.forEach(m => mapRef.removeLayer(m));
    });
    tracks = [];
    selectedTrackId = null;
    trimMode = false;
    hideTrackDetail();
    renderTracksList();
}

function selectTrack(id) {
    selectedTrackId = id;
    trimMode = false;
    trimStart = null;
    trimEnd = null;

    // Update visual styles
    tracks.forEach(t => {
        const isSelected = t.id === id;
        t.polylineRef.setStyle({
            opacity: isSelected ? 0.9 : 0.3,
            weight: isSelected ? 4 : 2
        });
    });

    showTrackDetail();
    renderTracksList();
    showTrackMarkers(id);
}

function getSelectedTrack() {
    return tracks.find(t => t.id === selectedTrackId) || null;
}

// ─── MARKERS (TRACK POINTS) ────────────────────
function showTrackMarkers(trackId) {
    // Remove all existing markers
    tracks.forEach(t => {
        t.markerRefs.forEach(m => mapRef.removeLayer(m));
        t.markerRefs = [];
    });

    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const color = COLORS[track.person] || COLORS.default;

    // Only show a subset if too many points (performance)
    const maxVisible = 200;
    const step = track.points.length > maxVisible
        ? Math.ceil(track.points.length / maxVisible)
        : 1;

    track.points.forEach((pt, i) => {
        if (i % step !== 0 && i !== track.points.length - 1) return;

        const isFirst = i === 0;
        const isLast = i === track.points.length - 1;
        const size = (isFirst || isLast) ? 12 : 6;
        const borderColor = (isFirst || isLast) ? "#fff" : color;

        const icon = L.divIcon({
            className: "track-point-marker",
            html: `<div style="
                width:${size}px;height:${size}px;
                background:${color};
                border:2px solid ${borderColor};
                border-radius:50%;
                box-shadow:0 0 6px ${color}66;
                cursor:pointer;
                transition: all 0.15s;
            "></div>`,
            iconSize: [size + 4, size + 4],
            iconAnchor: [(size + 4) / 2, (size + 4) / 2]
        });

        const marker = L.marker([pt.lat, pt.lng], {
            icon,
            draggable: true,
            zIndexOffset: (isFirst || isLast) ? 1000 : 0
        }).addTo(mapRef);

        // Drag to edit position
        marker.on("dragend", (e) => {
            const pos = e.target.getLatLng();
            pt.lat = pos.lat;
            pt.lng = pos.lng;
            updatePolyline(track);
            renderTrackPoints();
        });

        // Click to select point
        marker.on("click", () => {
            selectedPointIndex = i;
            renderTrackPoints();

            // Show popup with comment
            const popup = L.popup({
                closeButton: true,
                className: "track-point-popup"
            })
                .setLatLng([pt.lat, pt.lng])
                .setContent(`
                    <div style="min-width:180px">
                        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Punkt ${i + 1} von ${track.points.length}</div>
                        <div style="font-size:12px;margin-bottom:6px">
                            <span style="color:#64748b">Lat:</span> ${pt.lat.toFixed(6)}<br>
                            <span style="color:#64748b">Lng:</span> ${pt.lng.toFixed(6)}
                            ${pt.ele !== null ? `<br><span style="color:#64748b">Höhe:</span> ${pt.ele.toFixed(1)}m` : ""}
                            ${pt.time ? `<br><span style="color:#64748b">Zeit:</span> ${formatTime(pt.time)}` : ""}
                        </div>
                        <textarea id="pointCommentPopup" 
                            style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;color:#fff;font-size:11px;resize:none;height:50px"
                            placeholder="Kommentar...">${pt.comment || ""}</textarea>
                        <div style="display:flex;gap:4px;margin-top:6px">
                            <button onclick="window._trackSavePointComment(${i})" 
                                style="flex:1;background:#8b5cf6;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">
                                Speichern
                            </button>
                            <button onclick="window._trackDeletePoint(${i})"
                                style="background:#ef4444;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">
                                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">delete</span>
                            </button>
                        </div>
                    </div>
                `)
                .openOn(mapRef);
        });

        track.markerRefs.push(marker);
    });

    renderTrackPoints();
}

function updatePolyline(track) {
    const latlngs = track.points.map(p => [p.lat, p.lng]);
    track.polylineRef.setLatLngs(latlngs);
}

// ─── POINT OPERATIONS ───────────────────────────
window._trackSavePointComment = function (index) {
    const track = getSelectedTrack();
    if (!track) return;
    const textarea = document.getElementById("pointCommentPopup");
    if (textarea && track.points[index]) {
        track.points[index].comment = textarea.value;
        mapRef.closePopup();
        renderTrackPoints();
    }
};

window._trackDeletePoint = function (index) {
    const track = getSelectedTrack();
    if (!track || !track.points[index]) return;

    if (track.points.length <= 2) {
        alert("Ein Track braucht mindestens 2 Punkte.");
        return;
    }

    track.points.splice(index, 1);
    mapRef.closePopup();
    updatePolyline(track);
    showTrackMarkers(track.id);
};

// ─── TRIM MODE ──────────────────────────────────
function toggleTrimMode() {
    const track = getSelectedTrack();
    if (!track) return;

    trimMode = !trimMode;
    const btn = document.getElementById("btnTrimTrack");

    if (trimMode) {
        btn.classList.add("bg-primary", "text-white");
        btn.classList.remove("bg-surface-dark", "text-gray-300");
        trimStart = 0;
        trimEnd = track.points.length - 1;
        renderTrimUI(track);
    } else {
        btn.classList.remove("bg-primary", "text-white");
        btn.classList.add("bg-surface-dark", "text-gray-300");
        renderTrackPoints();
    }
}

function renderTrimUI(track) {
    const container = document.getElementById("trackPointsList");
    container.innerHTML = `
        <div class="p-3 bg-primary/10 border border-primary/30 rounded-lg mb-2">
            <p class="text-xs text-primary font-semibold mb-3">Track trimmen – Start & Ende wählen</p>
            <div class="flex flex-col gap-3">
                <div>
                    <label class="text-[10px] text-gray-400 uppercase">Start-Punkt</label>
                    <input type="range" id="trimStartSlider" min="0" max="${track.points.length - 1}" value="${trimStart}" 
                        class="w-full accent-primary" style="height:6px" />
                    <span class="text-xs text-gray-300" id="trimStartLabel">Punkt ${trimStart + 1}</span>
                </div>
                <div>
                    <label class="text-[10px] text-gray-400 uppercase">End-Punkt</label>
                    <input type="range" id="trimEndSlider" min="0" max="${track.points.length - 1}" value="${trimEnd}"
                        class="w-full accent-primary" style="height:6px" />
                    <span class="text-xs text-gray-300" id="trimEndLabel">Punkt ${trimEnd + 1}</span>
                </div>
            </div>
            <button id="btnApplyTrim" 
                class="mt-3 w-full bg-primary hover:bg-[#7c3aed] text-white text-xs font-bold py-2 rounded-lg transition-colors">
                Trimmen anwenden
            </button>
        </div>
    `;

    const startSlider = document.getElementById("trimStartSlider");
    const endSlider = document.getElementById("trimEndSlider");

    startSlider.addEventListener("input", (e) => {
        trimStart = parseInt(e.target.value);
        if (trimStart >= trimEnd) {
            trimStart = trimEnd - 1;
            startSlider.value = trimStart;
        }
        document.getElementById("trimStartLabel").textContent = `Punkt ${trimStart + 1}`;
        previewTrim(track);
    });

    endSlider.addEventListener("input", (e) => {
        trimEnd = parseInt(e.target.value);
        if (trimEnd <= trimStart) {
            trimEnd = trimStart + 1;
            endSlider.value = trimEnd;
        }
        document.getElementById("trimEndLabel").textContent = `Punkt ${trimEnd + 1}`;
        previewTrim(track);
    });

    document.getElementById("btnApplyTrim").addEventListener("click", () => {
        applyTrim(track);
    });
}

function previewTrim(track) {
    // Show only trimmed portion on polyline
    const trimmed = track.points.slice(trimStart, trimEnd + 1);
    track.polylineRef.setLatLngs(trimmed.map(p => [p.lat, p.lng]));
}

function applyTrim(track) {
    track.points = track.points.slice(trimStart, trimEnd + 1);
    trimMode = false;

    const btn = document.getElementById("btnTrimTrack");
    btn.classList.remove("bg-primary", "text-white");
    btn.classList.add("bg-surface-dark", "text-gray-300");

    updatePolyline(track);
    showTrackMarkers(track.id);
}

// ─── UI RENDERING ───────────────────────────────
function renderTracksList() {
    const container = document.getElementById("tracksList");
    if (!container) return;

    if (tracks.length === 0) {
        container.innerHTML = `<div class="text-xs text-gray-500 text-center py-6">Noch keine Tracks importiert.</div>`;
        return;
    }

    container.innerHTML = tracks.map(t => {
        const color = COLORS[t.person] || COLORS.default;
        const isSelected = t.id === selectedTrackId;
        const distance = calculateDistance(t.points);

        return `
            <div class="track-item ${isSelected ? "active" : ""}" onclick="window._selectTrack('${t.id}')">
                <div class="flex items-center gap-3">
                    <div style="width:10px;height:10px;background:${color};border-radius:50%;box-shadow:0 0 8px ${color}66;flex-shrink:0"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-white truncate">${t.name}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 flex-shrink-0">${t.person}</span>
                        </div>
                        <div class="text-[11px] text-gray-500 mt-0.5">
                            ${t.points.length} Punkte · ${distance}
                            ${t.comment ? ' · <span class="text-primary">💬</span>' : ""}
                        </div>
                    </div>
                    <button class="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0" 
                        onclick="event.stopPropagation(); window._removeTrack('${t.id}')">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function showTrackDetail() {
    const track = getSelectedTrack();
    if (!track) return;

    const detail = document.getElementById("trackDetail");
    detail.style.display = "block";

    document.getElementById("trackDetailName").textContent = track.name;
    document.getElementById("trackComment").value = track.comment || "";
    document.getElementById("trackPointCount").textContent = `${track.points.length} Punkte`;

    renderTrackPoints();
}

function hideTrackDetail() {
    const detail = document.getElementById("trackDetail");
    if (detail) detail.style.display = "none";
}

function renderTrackPoints() {
    const track = getSelectedTrack();
    const container = document.getElementById("trackPointsList");
    if (!track || !container) return;

    if (trimMode) return; // Don't overwrite trim UI

    document.getElementById("trackPointCount").textContent = `${track.points.length} Punkte`;

    // Show sampled list (max 100 items)
    const maxItems = 100;
    const step = track.points.length > maxItems
        ? Math.ceil(track.points.length / maxItems)
        : 1;

    let html = "";
    track.points.forEach((pt, i) => {
        if (i % step !== 0 && i !== track.points.length - 1) return;

        const isSelected = i === selectedPointIndex;
        const hasComment = pt.comment && pt.comment.trim().length > 0;
        const isFirst = i === 0;
        const isLast = i === track.points.length - 1;

        html += `
            <div class="track-point-item ${isSelected ? 'selected' : ''}" 
                 onclick="window._selectTrackPoint(${i})"
                 style="cursor:pointer">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono text-gray-500 w-8 flex-shrink-0">${isFirst ? "START" : isLast ? "END" : `#${i + 1}`}</span>
                    <span class="text-[11px] text-gray-300 font-mono flex-1">
                        ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}
                    </span>
                    ${pt.ele !== null ? `<span class="text-[10px] text-gray-500">${pt.ele.toFixed(0)}m</span>` : ""}
                    ${hasComment ? `<span class="text-primary text-[10px]">💬</span>` : ""}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ─── HELPERS ────────────────────────────────────
function calculateDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const p1 = L.latLng(points[i - 1].lat, points[i - 1].lng);
        const p2 = L.latLng(points[i].lat, points[i].lng);
        total += p1.distanceTo(p2);
    }
    if (total > 1000) return (total / 1000).toFixed(2) + " km";
    return Math.round(total) + " m";
}

function formatTime(isoString) {
    try {
        const d = new Date(isoString);
        return d.toLocaleString("de-DE", {
            day: "2-digit", month: "2-digit",
            hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return isoString;
    }
}

// ─── GLOBAL BRIDGE ──────────────────────────────
window._selectTrack = (id) => selectTrack(id);
window._removeTrack = (id) => removeTrack(id);
window._selectTrackPoint = (index) => {
    const track = getSelectedTrack();
    if (!track) return;
    selectedPointIndex = index;
    renderTrackPoints();
    // Fly to point
    const pt = track.points[index];
    if (pt) mapRef.flyTo([pt.lat, pt.lng], Math.max(mapRef.getZoom(), 14));
};

// ─── EXPORTS ────────────────────────────────────
export { tracks, COLORS };
