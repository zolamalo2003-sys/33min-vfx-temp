
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { initTrackManager } from "./track-manager.js";

/** ================= CONFIG ================= */
const SUPABASE_URL = "https://xdxnprrjnwutpewchjms.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeG5wcnJqbnd1dHBld2Noam1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzgwMzQsImV4cCI6MjA4NTA1NDAzNH0.Njz_nuCzW0IWPqHINXbUmiLFX-h3qQPnlzGzxlB8h8A";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let map;
let participants = []; // ["Jerry", "Marc"]
let selectedParticipant = null; // "Jerry"
let waypointData = []; // Array of { id, lat, lng, mode, person, markerRef }
let routeControls = {}; // { "Jerry": L.Routing.control }
let currentAnimId = null;

const DEFAULT_CENTER = [51.1657, 10.4515]; // Center of Germany

const COLORS = {
    "Jerry": "#19baf0", // Blue
    "Marc": "#10b981",  // Green
    "Taube": "#ef4444", // Red
    "Käthe": "#f97316", // Orange
    "Kodiak": "#8b5cf6", // Purple
    "default": "#9ca3af" // Gray
};

/** ================= INIT ================= */
let currentMode = "planner"; // "planner" or "tracking"

document.addEventListener("DOMContentLoaded", async () => {
    // Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    const userEmailEl = document.getElementById("userEmail");
    if (session) {
        userEmailEl.textContent = session.user.email;
    } else {
        userEmailEl.textContent = "Gast";
    }

    initMap();
    bindEvents();
    initTrackManager(map);
});

/** ================= MODE SWITCHING ================= */
function switchMode(mode) {
    currentMode = mode;

    // Toggle tabs
    document.querySelectorAll(".mode-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.mode === mode);
    });

    // Toggle panels
    document.getElementById("plannerMode").style.display = mode === "planner" ? "flex" : "none";
    document.getElementById("trackingMode").style.display = mode === "tracking" ? "flex" : "none";

    // Toggle map cursor
    if (mode === "tracking") {
        map.getContainer().style.cursor = "grab";
    } else {
        map.getContainer().style.cursor = "crosshair";
    }
}
window.switchMode = switchMode;

/** ================= MAP LOGIC ================= */
function initMap() {
    // Disable default zoom to create custom position or move it
    map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark map tiles with labels
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// Search Logic
let searchTimeout;
function handleSearch(query) {
    if (!query || query.length < 2) return;

    // Clear previous timeout
    if (searchTimeout) clearTimeout(searchTimeout);

    // Check if input is coordinates (e.g. "52.520, 13.405" or "52.520 13.405")
    const coordMatch = query.match(/^\s*(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)\s*$/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            map.flyTo([lat, lng], 14);
            document.getElementById("mapSearchInput").value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            // Hide any open results
            const container = document.getElementById("searchResults");
            if (container) container.style.display = "none";
            return;
        }
    }

    searchTimeout = setTimeout(async () => {
        try {
            // English results but Nominatim still matches German input (e.g. "Köln" → "Cologne")
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&accept-language=en&q=${encodeURIComponent(query)}`);
            const data = await res.json();
            showSearchResults(data);
        } catch (e) {
            console.error("Search error", e);
        }
    }, 500); // 500ms debounce
}

function showSearchResults(results) {
    let container = document.getElementById("searchResults");
    if (!container) {
        // Create if missing (though we should add it to HTML)
        container = document.createElement("div");
        container.id = "searchResults";
        container.className = "absolute top-14 left-0 w-full bg-[#1e293b] border border-white/10 rounded-2xl shadow-float overflow-hidden z-50 max-h-60 overflow-y-auto";
        document.querySelector("#mapSearchInput").parentNode.appendChild(container);
    }

    container.innerHTML = "";
    container.style.display = results.length ? "block" : "none";

    results.forEach(place => {
        const div = document.createElement("div");
        div.className = "px-4 py-3 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 text-sm text-gray-200";
        div.textContent = place.display_name;
        div.onclick = () => {
            const lat = parseFloat(place.lat);
            const lng = parseFloat(place.lon);
            map.flyTo([lat, lng], 14);
            container.style.display = "none";
            document.getElementById("mapSearchInput").value = place.display_name;
        };
        container.appendChild(div);
    });

    // Hide on click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && e.target.id !== 'mapSearchInput') {
            container.style.display = 'none';
        }
    }, { once: true });
}

function createMarkerIcon(person, isSelected) {
    const color = COLORS[person] || COLORS.default;
    const opacity = isSelected ? 1 : 0.3;
    const scale = isSelected ? 1.2 : 0.8;
    const zIndex = isSelected ? 100 : 1;

    // Custom HTML for the marker (glowing dot)
    return L.divIcon({
        className: 'custom-div-icon',
        html: `
            <div style="
                background-color: ${color};
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 10px ${color};
                opacity: ${opacity};
                transform: scale(${scale});
                transition: all 0.3s ease;
            "></div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

function updateVisuals() {
    // 1. Update Route Lines
    updateRoutes();

    // 2. Update Markers Visuals (Opacity based on selection)
    waypointData.forEach(wp => {
        if (wp.markerRef) {
            const isSelected = !selectedParticipant || wp.person === selectedParticipant;
            const icon = createMarkerIcon(wp.person, isSelected);
            wp.markerRef.setIcon(icon);
            wp.markerRef.setZIndexOffset(isSelected ? 1000 : 0);

            // Allow dragging only if selected
            if (isSelected) {
                wp.markerRef.dragging.enable();
            } else {
                wp.markerRef.dragging.disable();
            }
        }
    });

    // 3. Filter Waypoint List in Sidebar
    renderWaypointList();
}

function updateRoutes() {
    // Clean up old controls
    Object.values(routeControls).forEach(ctrl => map.removeControl(ctrl));
    routeControls = {};

    // Group waypoints by person
    const persons = [...new Set(waypointData.map(wp => wp.person))];

    persons.forEach(person => {
        const personWPs = waypointData.filter(wp => wp.person === person);
        if (personWPs.length < 2) return;

        const waypoints = personWPs.map(wp => L.latLng(wp.lat, wp.lng));
        const color = COLORS[person] || COLORS.default;
        const isSelected = !selectedParticipant || person === selectedParticipant;

        // Create route
        const ctrl = L.Routing.control({
            waypoints: waypoints,
            routeWhileDragging: false,
            lineOptions: {
                styles: [{
                    color: color,
                    opacity: isSelected ? 0.8 : 0.15, // Dim inactive routes
                    weight: isSelected ? 5 : 3
                }]
            },
            createMarker: () => null, // No default markers
            show: false,
            addWaypoints: false
        }).addTo(map);

        routeControls[person] = ctrl;
    });
}

/** ================= UI LOGIC ================= */

function bindEvents() {
    // Add Participant
    document.getElementById("participantSelect").addEventListener("change", (e) => {
        const val = e.target.value;
        if (val && !participants.includes(val)) {
            addParticipant(val);
        }
        e.target.value = "";
    });

    // Add Waypoint
    document.getElementById("btnAddWaypoint").addEventListener("click", () => {
        if (!selectedParticipant && participants.length > 0) {
            // Auto-select first if none selected
            selectParticipant(participants[0]);
        }
        if (!selectedParticipant) {
            alert("Bitte zuerst einen Teilnehmer auswählen/hinzufügen.");
            return;
        }

        const center = map.getCenter();
        const offset = (Math.random() - 0.5) * 0.002;
        addWaypoint(center.lat + offset, center.lng + offset, selectedParticipant);
    });

    // Map Click -> Add Waypoint (only in planner mode)
    map.on('click', (e) => {
        if (currentMode !== "planner") return;
        if (!selectedParticipant) {
            if (participants.length > 0) {
                selectParticipant(participants[0]);
            } else {
                return;
            }
        }
        addWaypoint(e.latlng.lat, e.latlng.lng, selectedParticipant);
    });

    // Hover Preview (Cursor change)
    map.getContainer().style.cursor = 'crosshair';

    document.getElementById("btnSave").addEventListener("click", saveAnimation);
    document.getElementById("btnLoadList").addEventListener("click", loadAnimationList);

    // Search Input
    const searchIn = document.getElementById("mapSearchInput");
    if (searchIn) {
        searchIn.addEventListener("input", (e) => handleSearch(e.target.value));
        searchIn.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleSearch(e.target.value);
        });
    }
}

function addParticipant(name) {
    participants.push(name);
    // Auto-select newly added
    selectParticipant(name);
}

function removeParticipant(name) {
    if (!confirm(`Entfernen: ${name}? Alle Marker werden gelöscht.`)) return;

    participants = participants.filter(p => p !== name);
    // Remove waypoints for this person
    const toRemove = waypointData.filter(wp => wp.person === name);
    toRemove.forEach(wp => {
        map.removeLayer(wp.markerRef);
    });
    waypointData = waypointData.filter(wp => wp.person !== name);

    if (selectedParticipant === name) {
        selectedParticipant = participants[0] || null;
    }
    renderParticipants();
    updateVisuals();
}

function selectParticipant(name) {
    selectedParticipant = name;
    renderParticipants();
    updateVisuals();
    updateMapBadge(name);
}

function updateMapBadge(name) {
    const badge = document.getElementById("activeParticipantBadge");
    if (!badge || !name) {
        if (badge) badge.style.display = 'none';
        return;
    }
    const color = COLORS[name] || COLORS.default;
    badge.style.display = 'flex';
    badge.style.backgroundColor = color;
    badge.style.boxShadow = `0 0 15px ${color}66`; // Glow

    // Contrast text color check (simple white/black)
    badge.style.color = '#fff';
    badge.querySelector(".badge-name").textContent = name;
}

function renderParticipants() {
    const container = document.getElementById("participantsChips");
    container.innerHTML = participants.map(p => {
        const isSelected = p === selectedParticipant;
        const color = COLORS[p] || COLORS.default;

        // Style Logic
        let style = "";
        let classes = "cursor-pointer border px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all hover:scale-105";

        if (isSelected) {
            // Active Style (Solid color pop)
            style = `background: ${color}22; border-color: ${color}; color: white; box-shadow: 0 0 8px ${color}44;`;
        } else {
            // Inactive Style (Dimmed)
            style = `background: #1f2937; border-color: #374151; color: #9ca3af;`;
        }

        return `
            <div onclick="window.selectParticipant('${p}')" 
                 class="${classes}"
                 style="${style}">
                <div style="width:8px; height:8px; background:${color}; border-radius:50%;"></div>
                <span class="font-bold text-xs uppercase">${p}</span>
                <button onclick="event.stopPropagation(); window.removeParticipantLink('${p}')" class="hover:text-white flex items-center ml-1">
                    <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
            </div>
        `;
    }).join("");
}

// Global helpers
window.removeParticipantLink = removeParticipant;
window.selectParticipant = selectParticipant;

function addWaypoint(lat, lng, person, mode = "walking") {
    const id = crypto.randomUUID();

    // Create Marker
    const icon = createMarkerIcon(person, true);
    const marker = L.marker([lat, lng], { draggable: true, icon: icon }).addTo(map);

    // Data Object
    const wp = { id, lat, lng, person, mode, markerRef: marker };
    waypointData.push(wp);

    // Drag Listener
    marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        wp.lat = pos.lat;
        wp.lng = pos.lng;
        // Update input if visible
        const inputLat = document.getElementById(`lat-${id}`);
        const inputLng = document.getElementById(`lng-${id}`);
        if (inputLat) inputLat.value = pos.lat.toFixed(6);
        if (inputLng) inputLng.value = pos.lng.toFixed(6);

        updateVisuals(); // Re-route
    });

    // Clicking a marker selects that person
    marker.on('click', () => {
        if (selectedParticipant !== person) {
            selectParticipant(person);
        }
    });

    updateVisuals();
}

function renderWaypointList() {
    const list = document.getElementById("waypointsList");
    if (!selectedParticipant) {
        list.innerHTML = `<div class="text-xs text-gray-500 text-center py-4">Wähle einen Teilnehmer aus.</div>`;
        return;
    }

    const relevantWPs = waypointData.filter(wp => wp.person === selectedParticipant);

    if (relevantWPs.length === 0) {
        list.innerHTML = `<div class="text-xs text-gray-500 text-center py-4">Keine Wegpunkte für ${selectedParticipant}.</div>`;
        return;
    }

    list.innerHTML = "";

    relevantWPs.forEach((wp, index) => {
        const div = document.createElement("div");
        div.className = "waypoint-item bg-[#192d34]/50 border border-border-dark rounded-xl p-3 hover:border-primary/50 transition-colors group mb-2";
        div.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="mt-1 size-8 rounded-full bg-surface-dark border border-gray-600 text-gray-400 flex items-center justify-center shrink-0">
                    <span class="text-xs font-bold" style="color:${COLORS[selectedParticipant]}">${index + 1}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-gray-300">WP ${index + 1}</span>
                        <button class="btn-del-wp size-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-red-400">
                            <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <div class="bg-black/20 rounded px-2 py-1.5 border border-white/5">
                            <label class="block text-[10px] text-gray-500">Lat</label>
                            <input id="lat-${wp.id}" class="w-full bg-transparent border-none p-0 text-xs text-gray-200 focus:ring-0 font-mono" value="${wp.lat.toFixed(6)}">
                        </div>
                        <div class="bg-black/20 rounded px-2 py-1.5 border border-white/5">
                            <label class="block text-[10px] text-gray-500">Lng</label>
                            <input id="lng-${wp.id}" class="w-full bg-transparent border-none p-0 text-xs text-gray-200 focus:ring-0 font-mono" value="${wp.lng.toFixed(6)}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Input Listeners
        const latIn = div.querySelector(`#lat-${wp.id}`);
        const lngIn = div.querySelector(`#lng-${wp.id}`);
        const updateCoords = () => {
            const nLat = parseFloat(latIn.value);
            const nLng = parseFloat(lngIn.value);
            if (!isNaN(nLat) && !isNaN(nLng)) {
                wp.lat = nLat;
                wp.lng = nLng;
                wp.markerRef.setLatLng([nLat, nLng]);
                updateVisuals();
            }
        };
        latIn.addEventListener("change", updateCoords);
        lngIn.addEventListener("change", updateCoords);

        // Delete
        div.querySelector(".btn-del-wp").addEventListener("click", () => {
            map.removeLayer(wp.markerRef);
            waypointData = waypointData.filter(i => i.id !== wp.id);
            updateVisuals();
        });

        list.appendChild(div);
    });
}


/** ================= DATA SYNC ================= */
async function saveAnimation() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert("Bitte einloggen."); return; }

    const animIdStr = document.getElementById("animId").value;
    const duration = document.getElementById("animDuration").value;
    const comment = document.getElementById("animComment").value;
    const status = document.getElementById("animStatus").value;

    const payload = {
        user_id: session.user.id,
        anim_id: animIdStr,
        duration: duration,
        description: comment,
        status: status,
        participants: participants,
        // Save waypoints without the circular markerRef
        waypoints: waypointData.map(wp => ({
            lat: wp.lat,
            lng: wp.lng,
            person: wp.person,
            mode: wp.mode
        })),
        view_state: {
            center: map.getCenter(),
            zoom: map.getZoom()
        }
    };

    let error;
    if (currentAnimId) {
        const res = await supabase.from("map_animations").update(payload).eq("id", currentAnimId);
        error = res.error;
    } else {
        const res = await supabase.from("map_animations").insert([payload]).select();
        if (res.data && res.data[0]) currentAnimId = res.data[0].id;
        error = res.error;
    }

    if (error) alert("Fehler beim Speichern: " + error.message);
    else alert("Animation gespeichert!");
}

// --- LOAD MODAL LOGIC ---
let allAnimations = [];

document.getElementById("btnCloseLoadModal").addEventListener("click", () => {
    document.getElementById("loadModal").classList.add("hidden");
});

document.getElementById("loadSearchInput").addEventListener("input", (e) => {
    renderLoadList(e.target.value);
});

async function loadAnimationList() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert("Bitte einloggen."); return; }

    // Show Modal
    const modal = document.getElementById("loadModal");
    modal.classList.remove("hidden");

    // Fetch Data
    const container = document.getElementById("loadListContainer");
    container.innerHTML = `<div class="text-center py-8 text-gray-500 flex flex-col items-center gap-2"><span class="material-symbols-outlined animate-spin">progress_activity</span> Lade...</div>`;

    const { data, error } = await supabase
        .from("map_animations")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        container.innerHTML = `<div class="text-center py-8 text-red-400">Fehler: ${error.message}</div>`;
        return;
    }

    allAnimations = data || [];
    renderLoadList("");
}

function renderLoadList(filter = "") {
    const container = document.getElementById("loadListContainer");
    const term = filter.toLowerCase();

    const filtered = allAnimations.filter(row => {
        const text = `${row.anim_id} ${row.description || ""} ${row.status}`.toLowerCase();
        return text.includes(term);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Animationen gefunden.</div>`;
        return;
    }

    container.innerHTML = filtered.map(row => {
        const date = new Date(row.created_at).toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const color = row.status === 'done' ? 'text-green-400 border-green-400/30 bg-green-400/10' :
            row.status === 'active' ? 'text-blue-400 border-blue-400/30 bg-blue-400/10' :
                'text-gray-400 border-gray-600 bg-gray-700/30'; // draft

        return `
            <div onclick="window.loadAnimFromModal('${row.id}')" 
                 class="group flex items-center justify-between p-4 bg-[#101d22] border border-[#2a4049] rounded-lg cursor-pointer hover:border-primary/50 hover:bg-[#152329] transition-all">
                <div class="flex-1 min-w-0 mr-4">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-white group-hover:text-primary transition-colors">${row.anim_id || "Unbenannt"}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded border ${color} uppercase tracking-wider font-bold">${row.status || "Entwurf"}</span>
                    </div>
                    <div class="text-sm text-gray-400 truncate">${row.description || "Keine Beschreibung"}</div>
                    <div class="text-xs text-gray-600 mt-1 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[12px]">calendar_today</span> ${date}
                        <span class="mx-1">•</span>
                        <span>${(row.participants || []).length} Teilnehmer</span>
                    </div>
                </div>
                <div class="shrink-0 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="material-symbols-outlined">arrow_forward</span>
                </div>
            </div>
        `;
    }).join("");
}

window.loadAnimFromModal = (id) => {
    const row = allAnimations.find(r => r.id === id);
    if (row) {
        loadAnimation(row);
        document.getElementById("loadModal").classList.add("hidden");
    }
};

function loadAnimation(row) {
    currentAnimId = row.id;
    document.getElementById("animId").value = row.anim_id || "";
    document.getElementById("animDuration").value = row.duration || "";
    document.getElementById("animComment").value = row.description || "";
    document.getElementById("animStatus").value = row.status || "draft";

    participants = row.participants || [];

    // Clear existing
    waypointData.forEach(wp => map.removeLayer(wp.markerRef));
    waypointData = [];

    // Restore
    if (row.waypoints) {
        row.waypoints.forEach(wp => {
            addWaypoint(parseFloat(wp.lat), parseFloat(wp.lng), wp.person, wp.mode);
        });
    }

    selectedParticipant = participants.length ? participants[0] : null;
    renderParticipants();
    updateVisuals();

    if (row.view_state && row.view_state.center) {
        map.setView(row.view_state.center, row.view_state.zoom);
    }
}
