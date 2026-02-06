
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/** ================= CONFIG ================= */
// Using the same credentials as main app
const SUPABASE_URL = "https://xdxnprrjnwutpewchjms.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeG5wcnJqbnd1dHBld2Noam1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzgwMzQsImV4cCI6MjA4NTA1NDAzNH0.Njz_nuCzW0IWPqHINXbUmiLFX-h3qQPnlzGzxlB8h8A";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let map;
let routingControl = null;
let markers = [];
let participants = [];
let currentAnimId = null; // ID of the DB row

// 33 minutes project location default (approx Berlin/Germany or user location)
const DEFAULT_CENTER = [52.520, 13.405]; // Berlin

/** ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    const userEmailEl = document.getElementById("userEmail");
    if (session) {
        userEmailEl.textContent = session.user.email;
    } else {
        userEmailEl.textContent = "Guest (Not Logged In)";
        alert("Bitte einloggen (in der Haupt-App), um zu speichern.");
    }

    // 2. Init Map
    initMap();

    // 3. Bind UI Events
    bindEvents();
});

/** ================= MAP LOGIC ================= */
function initMap() {
    map = L.map('map').setView(DEFAULT_CENTER, 13);

    // CartoDB Dark Matter (User liked the dark vector look)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // On Click Map -> Add Waypoint logic could go here, strictly for "adding last point"
    map.on('click', function (e) {
        // Optional: add waypoint on click? 
        // For now, users use the "Add Waypoint" button which adds center, then they drag.
    });
}

function updateRoute() {
    // Remove old routing
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    // Collect Waypoints
    const waypointElements = document.querySelectorAll(".waypoint-item");
    if (waypointElements.length < 2) return; // Need at least 2 points for a route

    const waypoints = [];
    waypointElements.forEach(el => {
        const lat = parseFloat(el.querySelector(".wp-lat").value);
        const lng = parseFloat(el.querySelector(".wp-lng").value);
        if (!isNaN(lat) && !isNaN(lng)) {
            waypoints.push(L.latLng(lat, lng));
        }
    });

    if (waypoints.length < 2) return;

    // Draw Route
    routingControl = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: false, // Performance
        lineOptions: {
            styles: [{ color: '#19baf0', opacity: 0.8, weight: 6 }]
        },
        createMarker: function () { return null; }, // We handle markers manually
        show: false // Don't show the text instructions container
    }).addTo(map);
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
        const center = map.getCenter();
        addWaypointUI(center.lat, center.lng);
    });

    // Save
    document.getElementById("btnSave").addEventListener("click", saveAnimation);

    // Load List (Simple implementation: Prompt for ID or show list modal - for now simplified)
    document.getElementById("btnLoadList").addEventListener("click", loadAnimationList);
}

function addParticipant(name) {
    participants.push(name);
    renderParticipants();
}

function removeParticipant(name) {
    participants = participants.filter(p => p !== name);
    renderParticipants();
}

function renderParticipants() {
    const container = document.getElementById("participantsChips");
    container.innerHTML = participants.map(p => `
        <div class="bg-primary/20 border border-primary/30 text-primary text-xs font-medium px-2 py-1 rounded flex items-center gap-1">
            ${p}
            <button onclick="window.removeParticipantLink('${p}')" class="hover:text-white"><span class="material-symbols-outlined text-[14px]">close</span></button>
        </div>
    `).join("");
}

// Global hack via window to allow onclick in innerHTML
window.removeParticipantLink = removeParticipant;

function addWaypointUI(lat, lng, mode = "walking") {
    const list = document.getElementById("waypointsList");
    const index = list.children.length;

    // Marker on Map
    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    markers.push({ marker, id: index }); // track markers

    const div = document.createElement("div");
    div.className = "waypoint-item bg-[#192d34]/50 border border-border-dark rounded-xl p-3 hover:border-primary/50 transition-colors group";
    div.dataset.index = index;

    div.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="mt-1 size-8 rounded-full bg-surface-dark border border-gray-600 text-gray-400 flex items-center justify-center shrink-0">
                <span class="text-xs font-bold">${index + 1}</span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-gray-300">Waypoint ${index + 1}</span>
                    <button class="btn-del-wp size-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-red-400">
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div class="bg-black/20 rounded px-2 py-1.5 border border-white/5">
                        <label class="block text-[10px] text-gray-500">Lat</label>
                        <input class="wp-lat w-full bg-transparent border-none p-0 text-xs text-gray-200 focus:ring-0 font-mono" value="${lat.toFixed(6)}" onchange="updateMarkerFromInput(${index})">
                    </div>
                    <div class="bg-black/20 rounded px-2 py-1.5 border border-white/5">
                        <label class="block text-[10px] text-gray-500">Lng</label>
                        <input class="wp-lng w-full bg-transparent border-none p-0 text-xs text-gray-200 focus:ring-0 font-mono" value="${lng.toFixed(6)}" onchange="updateMarkerFromInput(${index})">
                    </div>
                </div>
                <div class="flex items-center gap-2 mt-2">
                     <select class="wp-mode bg-black/40 rounded-full pl-2 pr-6 py-1 border border-white/5 text-xs text-gray-300">
                        <option value="walking" ${mode === 'walking' ? 'selected' : ''}>Walking</option>
                        <option value="driving" ${mode === 'driving' ? 'selected' : ''}>Driving</option>
                        <option value="transit" ${mode === 'transit' ? 'selected' : ''}>Transit</option>
                        <option value="cycling" ${mode === 'cycling' ? 'selected' : ''}>Cycling</option>
                     </select>
                </div>
            </div>
        </div>
    `;

    // Delete validation
    div.querySelector(".btn-del-wp").addEventListener("click", () => {
        div.remove();
        map.removeLayer(marker);
        markers = markers.filter(m => m.id !== index); // simple filter, might need re-indexing logic for robust app
        updateRoute();
    });

    list.appendChild(div);

    // Sync Marker Drag -> Input
    marker.on('dragend', function (e) {
        const pos = e.target.getLatLng();
        div.querySelector(".wp-lat").value = pos.lat.toFixed(6);
        div.querySelector(".wp-lng").value = pos.lng.toFixed(6);
        updateRoute();
    });

    updateRoute();
}

/** ================= DATA SYNC ================= */

async function saveAnimation() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Bitte einloggen.");
        return;
    }

    const animIdStr = document.getElementById("animId").value;
    const duration = document.getElementById("animDuration").value;
    const comment = document.getElementById("animComment").value;
    const status = document.getElementById("animStatus").value;

    // Collect Waypoints
    const wpData = [];
    document.querySelectorAll(".waypoint-item").forEach(el => {
        wpData.push({
            lat: el.querySelector(".wp-lat").value,
            lng: el.querySelector(".wp-lng").value,
            mode: el.querySelector(".wp-mode").value
        });
    });

    const payload = {
        user_id: session.user.id,
        anim_id: animIdStr,
        duration: duration,
        description: comment,
        status: status,
        participants: participants,
        waypoints: wpData,
        view_state: {
            center: map.getCenter(),
            zoom: map.getZoom()
        }
    };

    let error;
    if (currentAnimId) {
        // Update
        const res = await supabase.from("map_animations").update(payload).eq("id", currentAnimId);
        error = res.error;
    } else {
        // Insert
        const res = await supabase.from("map_animations").insert([payload]).select();
        if (res.data && res.data[0]) {
            currentAnimId = res.data[0].id;
        }
        error = res.error;
    }

    if (error) {
        alert("Error saving: " + error.message);
    } else {
        alert("Animation gespeichert!");
    }
}

async function loadAnimationList() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase.from("map_animations").select("*").order("created_at", { ascending: false });
    if (error) {
        alert("Error loading list: " + error.message);
        return;
    }

    // Simple Prompt List for now (V1)
    if (!data.length) {
        alert("Keine Animationen gefunden.");
        return;
    }

    // Create a temporary overlay to pick animation
    // Ideally this should be in the UI properly, but for V1 speed:
    let msg = "Wähle ID (Eingeben):\n";
    data.forEach((row, i) => {
        msg += `[${i}] ${row.anim_id} (${row.status})\n`;
    });
    const idx = prompt(msg);
    if (idx !== null && data[idx]) {
        loadAnimation(data[idx]);
    }
}

function loadAnimation(row) {
    currentAnimId = row.id;
    document.getElementById("animId").value = row.anim_id || "";
    document.getElementById("animDuration").value = row.duration || 10;
    document.getElementById("animComment").value = row.description || "";
    document.getElementById("animStatus").value = row.status || "draft";

    // Participants
    participants = row.participants || [];
    renderParticipants();

    // Clear Map
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    document.getElementById("waypointsList").innerHTML = "";
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    // Waypoints
    if (row.waypoints && Array.isArray(row.waypoints)) {
        row.waypoints.forEach(wp => {
            addWaypointUI(parseFloat(wp.lat), parseFloat(wp.lng), wp.mode);
        });
    }

    // View State
    if (row.view_state && row.view_state.center) {
        map.setView(row.view_state.center, row.view_state.zoom || 13);
    }
}

// Expose for HTML onclick helpers
window.updateMarkerFromInput = (index) => {
    // Logic to update marker pos from input typing would go here
};
