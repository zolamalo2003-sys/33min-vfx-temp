// Help System Logic
// Handles the Help Modal carousel and content

const helpPages = [
    {
        title: "Willkommen & Cloud Sync",
        html: `
            <div style="font-size: 1rem; line-height: 1.6; color: var(--text-primary);">
                <p style="margin-bottom: 16px;">
                    Willkommen beim <strong>33minutes Production Tracker</strong>!
                </p>
                <p style="margin-bottom: 16px;">
                    Um die volle Funktionalität zu nutzen, solltest du dich <strong>zunächst anmelden</strong>. 
                    Nur so werden deine Einträge sicher in der <strong>Cloud synchronisiert</strong> und sind für das gesamte Team sichtbar.
                </p>
                <div style="background: rgba(234, 67, 53, 0.1); border-left: 4px solid #ea4335; padding: 12px; border-radius: 4px; margin-bottom: 20px;">
                    <strong>Ohne Anmeldung:</strong> Deine Einträge werden nur lokal in diesem Browser gespeichert ("Guest-Modus"). 
                    Wenn du den Browser-Cache löschst, sind diese Daten unwiderruflich weg!
                </div>
                <p style="margin-bottom: 16px;">
                    Sobald du eingeloggt bist, kannst du deine Einträge jederzeit in der Cloud bearbeiten und siehst live, was andere gerade tun.
                </p>
                <div style="margin-top: 24px; border: 1px dashed var(--border); border-radius: 8px; height: 120px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
                    <span style="color: var(--text-secondary); font-style: italic;">(Bild: Screenshot Anmelde-Button)</span>
                </div>
            </div>
        `
    },
    {
        title: "Einträge erfassen",
        html: `
            <div style="font-size: 1rem; line-height: 1.6; color: var(--text-primary);">
                <p style="margin-bottom: 16px;">
                    Im Bereich <strong>"Neuer Eintrag"</strong> kannst du Animationen oder Infos loggen.
                    Alles ist beschriftet und weitgehend selbsterklärend.
                </p>
                <ul style="margin-bottom: 20px; padding-left: 20px; list-style-type: disc;">
                    <li style="margin-bottom: 8px;">
                        <strong>Werte behalten:</strong> Rechts oben gibt es einen Switch. Wenn aktiv, bleiben deine Eingaben (Show, Folge, etc.) nach dem Speichern stehen – praktisch für Masseneingabe.
                    </li>
                    <li style="margin-bottom: 8px;">
                        <strong>Optionale Felder:</strong> Klicke auf den Button <span class="material-icons" style="font-size:14px; vertical-align: middle; background: var(--bg-secondary); padding: 2px; border-radius: 4px;">tune</span> rechts oben, um Felder wie <em>Zeitstempel</em> einzublenden.
                    </li>
                </ul>
                <p style="margin-bottom: 16px;">
                    <strong>Zeitstempel:</strong> Nutze dies wie Marker in DaVinci. Gib an, wo genau in der Timeline die Grafik hin soll.
                </p>
                <p style="margin-bottom: 16px;">
                    <strong>Status:</strong> Setze einen Status wie <span class="status-chip status-draft" style="font-size: 0.8em; padding: 2px 6px;">Entwurf</span>, wenn du noch Daten (z.B. genaue Geldbeträge) nachliefern musst. Der VFX-Artist sieht dann: "Aha, da kommt was, aber ist noch nicht fertig."
                </p>
                <div style="margin-top: 24px; border: 1px dashed var(--border); border-radius: 8px; height: 120px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
                    <span style="color: var(--text-secondary); font-style: italic;">(Bild: Screenshot Eintrag-Fenster)</span>
                </div>
            </div>
        `
    },
    {
        title: "VFX Workflow & Export",
        html: `
            <div style="font-size: 1rem; line-height: 1.6; color: var(--text-primary);">
                <p style="margin-bottom: 16px;">
                    Sobald ein Eintrag fertig definiert ist, setze ihn auf <span class="status-chip status-ready" style="font-size: 0.8em; padding: 2px 6px;">Export bereit</span>.
                    Der VFX-Artist übernimmt dann.
                </p>
                <p style="margin-bottom: 16px;">
                    <strong>Ablauf für VFX:</strong>
                    <br>
                    1. Ich sehe den Status "Ready".<br>
                    2. Ich erstelle/exportiere die Grafik.<br>
                    3. Ich setze den Status auf "Done" oder "Abgeschlossen".<br>
                    4. Ich hinterlege oft einen <strong>Pfad</strong> im Kommentarfeld.
                </p>
                <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom: 20px;">
                    <strong>Pfad öffnen (Mac):</strong><br>
                    Kopiere den Pfad. Gehe im Finder auf "Gehe zu" &rarr; "Gehe zu Ordner" oder drücke:
                    <br>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <kbd style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace;">⇧ Shift</kbd> 
                        + 
                        <kbd style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace;">⌘ Cmd</kbd>
                        + 
                        <kbd style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace;">G</kbd>
                    </div>
                </div>
            </div>
        `
    },
    {
        title: "Automatisierung",
        html: `
            <div style="font-size: 1rem; line-height: 1.6; color: var(--text-primary);">
                <p style="margin-bottom: 16px;">
                    Ich habe ein <strong>After Effects Plugin</strong> zur Automatisierung getestet. 
                    Theoretisch könnte das System automatisch Grafiken rendern, sobald ihr sie auf "Ready" stellt.
                </p>
                <ul style="margin-bottom: 20px; padding-left: 20px; list-style-type: disc;">
                    <li>Cloud Eintrag -> Google Doc -> After Effects Bot -> Server Export.</li>
                    <li>Status wird automatisch aktualisiert.</li>
                </ul>
                <p style="margin-bottom: 16px;">
                    <strong>Problem:</strong> Die Lizenzkosten sind aktuell zu hoch (ca. 470€/Monat für den Server-Bot). 
                    Für dieses Projekt lohnt sich das nicht, aber ich arbeite an einer eigenen, günstigeren Lösung.
                </p>
                <p>Bis dahin: <strong>Handarbeit!</strong> Danke für eure Geduld.</p>
            </div>
        `
    }
];

let currentHelpIndex = 0;

function openHelpModal() {
    const modal = document.getElementById('helpModal');
    if (!modal) return;

    currentHelpIndex = 0;
    renderHelpPage(currentHelpIndex);
    modal.style.display = 'flex';
}

function renderHelpPage(index) {
    if (index < 0 || index >= helpPages.length) return;

    const contentDiv = document.getElementById('helpCarouselContent');
    const dotsDiv = document.getElementById('helpDots');
    const titleParent = document.querySelector('#helpModal .panel-title');
    const nextBtn = document.getElementById('helpNextBtn');

    if (contentDiv && helpPages[index]) {
        contentDiv.innerHTML = helpPages[index].html;
        // Animation trigger
        contentDiv.style.opacity = '0';
        contentDiv.style.transform = 'translateY(5px)';
        setTimeout(() => {
            contentDiv.style.transition = 'all 0.3s ease';
            contentDiv.style.opacity = '1';
            contentDiv.style.transform = 'translateY(0)';
        }, 10);
    }

    if (titleParent) {
        titleParent.textContent = helpPages[index].title;
    }

    // Render Dots
    if (dotsDiv) {
        dotsDiv.innerHTML = helpPages.map((_, i) => `
            <div 
                onclick="renderHelpPage(${i})" 
                style="
                    width: 8px; 
                    height: 8px; 
                    border-radius: 50%; 
                    background: ${i === index ? 'var(--accent-primary)' : 'var(--text-disabled)'}; 
                    cursor: pointer;
                    transition: background 0.2s;
                "
            ></div>
        `).join('');
    }

    // Update Next Button text
    if (nextBtn) {
        if (index === helpPages.length - 1) {
            nextBtn.innerHTML = `Schließen <span class="material-icons" style="font-size: 16px;">close</span>`;
            nextBtn.onclick = () => document.getElementById('helpModal').style.display = 'none';
        } else {
            nextBtn.innerHTML = `Weiter <span class="material-icons" style="font-size: 16px;">arrow_forward</span>`;
            nextBtn.onclick = nextHelpPage;
        }
    }

    currentHelpIndex = index;
}

function nextHelpPage() {
    if (currentHelpIndex < helpPages.length - 1) {
        renderHelpPage(currentHelpIndex + 1);
    }
}

// Expose globally
window.openHelpModal = openHelpModal;
window.renderHelpPage = renderHelpPage;
window.nextHelpPage = nextHelpPage;
