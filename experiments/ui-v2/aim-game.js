
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/** CONFIG */
const SUPABASE_URL = "https://xdxnprrjnwutpewchjms.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeG5wcnJqbnd1dHBld2Noam1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzgwMzQsImV4cCI6MjA4NTA1NDAzNH0.Njz_nuCzW0IWPqHINXbUmiLFX-h3qQPnlzGzxlB8h8A";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** GAME CONSTANTS */
const CONFIG = {
    startHealth: 100,
    maxHealth: 100,
    damagePerMiss: 15,
    healPerHit: 5,
    baseSpawnRate: 1000, // ms between spawns
    minSpawnRate: 350,   // cap speed
    targetLifetime: 2000, // ms before target vanishes
    minLifetime: 800,
    radius: 40,
    colors: {
        primary: "#ee652b",
        danger: "#ef4444",
        hit: "#ffffff"
    }
};

/** STATE */
let state = {
    playing: false,
    score: 0,
    health: 100,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    clicks: 0,
    startTime: 0,
    lastSpawn: 0,
    difficultyMultiplier: 1.0
};

let targets = [];
let particles = [];
let canvas, ctx;
let animationFrame;
let session = null;

/** INIT */
document.addEventListener("DOMContentLoaded", async () => {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    // Auth Check
    const { data } = await supabase.auth.getSession();
    session = data.session;
    updateAuthUI();

    // Resize Handler
    window.addEventListener("resize", resize);
    resize();

    // Input Handlers
    canvas.addEventListener("mousedown", handleInput);
    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !state.playing) startGame();
    });

    // GUI Bindings
    document.getElementById("btnStart").addEventListener("click", startGame);
    document.getElementById("btnRestart").addEventListener("click", startGame);

    // Initial Leaderboard Load
    fetchLeaderboard();

    // Start Loop (for particles/idle anims if desired, basically loop always runs but logic gates)
    loop();
});

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

function updateAuthUI() {
    const avatar = document.getElementById("userAvatar");
    const container = document.getElementById("userAvatarContainer");

    if (session) {
        const email = session.user.email;
        const code = email.slice(0, 2).toUpperCase();
        avatar.textContent = code;
        avatar.style.borderColor = CONFIG.colors.primary;
        avatar.style.color = "white";
        // Remove "Not logged in" tooltip logic or update it
        const tooltip = container.querySelector(".absolute");
        if (tooltip) tooltip.textContent = email;
    }
}

/** GAME LOGIC */

function startGame() {
    if (state.playing) return;

    // Reset State
    state = {
        playing: true,
        score: 0,
        health: CONFIG.startHealth,
        combo: 0,
        maxCombo: 0,
        hits: 0,
        misses: 0,
        clicks: 0,
        startTime: Date.now(),
        lastSpawn: Date.now(),
        difficultyMultiplier: 1.0
    };

    targets = [];
    particles = [];

    // UI Updates
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("gameOverScreen").classList.add("hidden");
    document.getElementById("gameHud").classList.remove("opacity-0");

    updateHUD();
}

function endGame() {
    state.playing = false;

    // Final Stats
    const accuracy = state.clicks > 0 ? Math.round((state.hits / state.clicks) * 100) : 0;

    document.getElementById("finalScore").textContent = state.score;
    document.getElementById("finalAcc").textContent = accuracy + "%";
    document.getElementById("finalHits").textContent = state.hits;
    document.getElementById("finalMisses").textContent = state.misses;

    document.getElementById("gameOverScreen").classList.remove("hidden");
    document.getElementById("gameHud").classList.add("opacity-0");

    saveScore(state.score, accuracy);
}

function updateGame(dt) { // dt in ms
    // 1. Difficulty Scaling over time
    // Increase drastically faster as requested. "Hard after 2 mins"
    const elapsed = Date.now() - state.startTime;
    // Old: +0.1 per 10s. New: +0.3 per 10s. 
    state.difficultyMultiplier = 1 + (elapsed / 10000) * 0.3;

    // 2. Spawning
    const currentSpawnRate = Math.max(CONFIG.minSpawnRate, CONFIG.baseSpawnRate / state.difficultyMultiplier);
    const timeSinceSpawn = Date.now() - state.lastSpawn;

    if (timeSinceSpawn > currentSpawnRate) {
        spawnTarget();
        state.lastSpawn = Date.now();
    }

    // 3. Update Targets
    for (let i = targets.length - 1; i >= 0; i--) {
        let t = targets[i];
        t.age += dt;

        // Lifetime limit
        const limit = Math.max(CONFIG.minLifetime, CONFIG.targetLifetime / state.difficultyMultiplier);

        if (t.age >= limit) {
            // Target expired = Miss
            targets.splice(i, 1);
            handleMiss(true); // true = target timeout
        }
    }

    // 4. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.age += dt;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    // Debug Info
    document.getElementById("debugSpawnRate").textContent = (1000 / currentSpawnRate).toFixed(1) + "/s";
    document.getElementById("debugDifficulty").textContent = "x" + state.difficultyMultiplier.toFixed(2);
}

function spawnTarget() {
    const margin = CONFIG.radius * 2;
    const x = margin + Math.random() * (canvas.width - margin * 2);
    const y = margin + Math.random() * (canvas.height - margin * 2);

    targets.push({
        x, y,
        age: 0,
        id: Math.random()
    });
}

function ambientSpawn() {
    // Only spawn if NOT playing and count < 5
    if (state.playing || targets.length > 5) return;

    // Slow random spawn
    if (Math.random() < 0.02) {
        spawnTarget();
    }
}

/** INPUT & HOTKEY LOGIC */
let bindMode = false;
let shootKey = null;
let mouseX = 0, mouseY = 0;

// Track mouse pos globally
document.addEventListener('mousemove', e => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Bind Button Logic
const bindBtn = document.getElementById('btnBindKey');
if (bindBtn) {
    bindBtn.addEventListener('click', () => {
        bindMode = true;
        bindBtn.textContent = "Taste drücken...";
        bindBtn.classList.add("text-primary", "border-primary");
    });
}

function resetBindBtn() {
    const btn = document.getElementById('btnBindKey');
    if (!btn) return;
    btn.textContent = shootKey ? `Taste: ${shootKey}` : "Taste belegen";
    btn.classList.remove("text-primary", "border-primary");
}

document.addEventListener('keydown', e => {
    // Binding
    if (bindMode) {
        if (e.code === "Escape") {
            bindMode = false;
            resetBindBtn();
            return;
        }
        shootKey = e.code;
        const disp = document.getElementById('currentHotkey');
        if (disp) disp.textContent = e.code;

        bindMode = false;
        resetBindBtn();
        return;
    }

    // Start Game
    if (e.code === "Space" && !state.playing) startGame();

    // Shooting with Hotkey
    if (state.playing && e.code === shootKey) {
        attemptShoot(mouseX, mouseY);
    }
});

function handleInput(e) {
    if (!state.playing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    attemptShoot(x, y);
}

function attemptShoot(clickX, clickY) {
    state.clicks++;

    // Check hits (reverse order to hit top-most first)
    let hit = false;
    for (let i = targets.length - 1; i >= 0; i--) {
        let t = targets[i];
        // Distance check
        const dx = clickX - t.x;
        const dy = clickY - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Current Radius (shrinking)
        const limit = Math.max(CONFIG.minLifetime, CONFIG.targetLifetime / state.difficultyMultiplier);
        const progress = t.age / limit;
        const currentRadius = CONFIG.radius * (1 - progress * 0.5); // Shrinks to 50%

        if (dist < currentRadius) {
            // HIT!
            hit = true;
            targets.splice(i, 1);
            handleHit(clickX, clickY);
            break;
        }
    }

    if (!hit) {
        state.combo = 0;
        state.misses++;
        createParticles(clickX, clickY, CONFIG.colors.danger);
        updateHUD();
    }
}

function handleHit(x, y) {
    state.hits++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    // Score Formula: Base + Combo bonus
    state.score += (100 + (state.combo * 10));

    // Heal
    state.health = Math.min(CONFIG.maxHealth, state.health + CONFIG.healPerHit);

    // FX
    createParticles(x, y, CONFIG.colors.primary);

    // Audio (optional, maybe later)

    updateHUD();
}

function handleMiss(timeout) {
    state.misses++;
    state.combo = 0;

    // Damage
    state.health -= CONFIG.damagePerMiss;

    updateHUD();

    if (state.health <= 0) {
        state.health = 0;
        endGame();
    }
}

function createParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            age: 0,
            color: color,
            alpha: 1
        });
    }
}

/** RENDER LOOP */
function loop() {
    const now = Date.now();
    // Delta time? Just simplified for 60fps
    const dt = 16;

    if (state.playing) {
        updateGame(dt);
    } else {
        // Ambient background movement
        ambientSpawn();
        // Update targets for fade out/animation even if paused
        targets.forEach((t, i) => {
            t.age += dt;
            // Slower death in menu
            if (t.age > 4000) targets.splice(i, 1);
        });
    }

    render();
    animationFrame = requestAnimationFrame(loop);
}

// function render() {
// line 365
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Particles (Always allow particles)
    particles.forEach(p => {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Draw Targets (Always allow if list has them)
    // Lifetime limit calculation for rendering
    const limit = Math.max(CONFIG.minLifetime, CONFIG.targetLifetime / state.difficultyMultiplier);

    targets.forEach(t => {
        const progress = t.age / limit;
        const radius = CONFIG.radius * (1 - progress * 0.5); // Shrinks to 50% size
        const alpha = 1 - progress; // Fades out? Or stays solid?

        // Outer Ring
        ctx.beginPath();
        ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = CONFIG.colors.primary;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = CONFIG.colors.primary;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner Fill
        ctx.fillStyle = `rgba(238, 101, 43, 0.25)`;
        ctx.fill();

        // Center Dot
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
    });
}

function updateHUD() {
    document.getElementById("hudScore").textContent = state.score.toLocaleString();
    document.getElementById("hudCombo").textContent = "x" + state.combo;

    // Health Bar
    const bar = document.getElementById("hudHealthBar");
    const text = document.getElementById("hudHealthText");

    bar.style.width = state.health + "%";
    text.textContent = Math.round(state.health) + "%";

    // Color change on low health
    if (state.health < 30) {
        bar.style.backgroundColor = CONFIG.colors.danger;
        bar.style.boxShadow = `0 0 15px ${CONFIG.colors.danger}`;
    } else {
        bar.style.backgroundColor = CONFIG.colors.primary;
        bar.style.boxShadow = `0 0 15px ${CONFIG.colors.primary}`;
    }
}

/** SUPABASE / DATA */

async function saveScore(score, accuracy) {
    if (!window.session) return;

    const user = window.session.user;
    const meta = user.user_metadata || {};
    const name = meta.display_name || user.email?.split('@')[0] || "Agent";
    const avatarConfig = meta.avatar_settings || null;

    const { error } = await window.supabase.from("aim_scores").insert({
        user_id: user.id,
        score: score,
        accuracy: accuracy,
        hits: state.hits,
        misses: state.misses,
        max_streak: state.maxCombo || 0,
        player_name: name,
        avatar_config: avatarConfig
    });

    if (error) {
        console.error("Error saving score:", error);
    }

    // Refresh leaderboard
    fetchLeaderboard();
    fetchPersonalBest();
}

async function fetchLeaderboard() {
    const list = document.getElementById("leaderboardList");
    if (!list) return;

    const { data, error } = await window.supabase
        .from("aim_scores")
        .select("score, accuracy, user_id, created_at, player_name, avatar_config")
        .order("score", { ascending: false })
        .limit(100);

    if (error) {
        console.error("Leaderboard Error:", error);
        if (error.message?.includes("column")) {
            list.innerHTML = `<div class="text-center text-red-400 py-4 text-xs">
                Datenbank-Update erforderlich:<br>
                Spalten <code>player_name</code> & <code>avatar_config</code> fehlen.
             </div>`;
        } else {
            list.innerHTML = `<div class="text-center text-red-500 py-4 text-xs">Fehler: ${error.message}</div>`;
        }
        return;
    }

    renderLeaderboard(data || [], list);
}

// Fallback function not needed anymore, merged into fetchLeaderboard
async function fetchLeaderboardFallback() { fetchLeaderboard(); }

function renderLeaderboard(data, list) {
    if (!data.length) {
        list.innerHTML = `<div class="text-center text-gray-500 py-4 text-xs">Noch keine Einträge.</div>`;
        return;
    }

    // Filter unique users (keep highest score)
    const uniqueMap = new Map();
    data.forEach(entry => {
        if (!uniqueMap.has(entry.user_id) || entry.score > uniqueMap.get(entry.user_id).score) {
            uniqueMap.set(entry.user_id, entry);
        }
    });

    // Sort by score descending and take top 20
    const top20 = Array.from(uniqueMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    const currentUser = window.session?.user?.id;

    list.innerHTML = top20.map((entry, index) => {
        const isMe = entry.user_id === currentUser;

        const date = new Date(entry.created_at).toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit"
        });

        let displayName = entry.player_name || "Agent";
        if (displayName === "Agent" && entry.user_id) {
            displayName = "Agent " + entry.user_id.slice(0, 4).toUpperCase();
        }

        // Avatar
        let avatarUrl = "";
        if (entry.avatar_config) {
            const settings = entry.avatar_config;
            if (settings.style && settings.seed) {
                avatarUrl = `https://api.dicebear.com/9.x/${settings.style}/svg?seed=${encodeURIComponent(settings.seed)}&backgroundColor=${settings.bgColor || 'transparent'}`;
            }
        }

        if (!avatarUrl) {
            avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=151a26&textColor=f1f5f9`;
        }

        return `
        <div class="flex items-center gap-3 p-2 rounded-lg ${isMe ? 'bg-primary/10 border border-primary/20' : 'bg-surface/50 border border-white/5'} transition-all hover:bg-white/5">
            <div class="font-mono text-xs font-bold w-6 text-center ${index < 3 ? 'text-primary' : 'text-gray-500'}">#${index + 1}</div>
            
            <div class="relative size-8 shrink-0">
                <img src="${avatarUrl}" class="size-8 rounded-full bg-panel border border-white/10 object-cover">
            </div>

            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-text truncate leading-tight">${displayName}</div>
                <div class="text-[10px] text-text-sec flex gap-2">
                    <span>${entry.accuracy}% Acc</span>
                    <span>${date}</span>
                </div>
            </div>
            
            <div class="text-right">
                <div class="font-mono font-bold text-primary text-sm">${entry.score.toLocaleString()}</div>
            </div>
        </div>
        `;
    }).join("");
}

async function fetchPersonalBest() {
    if (!session) return;
    const { data } = await supabase
        .from("aim_scores")
        .select("score")
        .eq("user_id", session.user.id)
        .order("score", { ascending: false })
        .limit(1)
        .single();

    if (data) {
        document.getElementById("finalHighscore").textContent = data.score.toLocaleString();
    }
}
