# Technische Dokumentation: Lokale AI-Integration

Diese Dokumentation erklärt die Funktionsweise, Sicherheit und Technologie hinter der AI-Integration auf unserer Website. Sie ist für Teammitglieder gedacht, die verstehen möchten, wie die "Magie" unter der Haube funktioniert.

---

## A) Wie funktioniert unsere Website?

Unsere Website ist eine moderne **Single-Page-Application (SPA)**. Das bedeutet, sie lädt nur einmal (beim ersten Besuch) und tauscht danach Inhalte dynamisch aus, ohne dass die Seite neu laden muss.

Der Kern der Anwendung ist in `supabase-app.js` geschrieben. Dieser Code verbindet sich mit unserer Datenbank (Supabase) für Echtzeit-Updates, steuert die Benutzeroberfläche und lädt bei Bedarf Zusatzmodule nach – wie unsere AI.

**Code-Beispiel:**
Das "Gehirn" unserer Seite wartet ständig auf Eingabefelder, um dort Funktionen wie den AI-Button bereitzustellen:

```javascript
// supabase-app.js
// Polling interval to ensure UI is injected
setInterval(() => {
    const textContent = document.getElementById('qTextContent');
    const todoContent = document.getElementById('qTodoContent');

    // Wenn ein Eingabefeld gefunden wird, injiziere den AI-Button
    if (textContent && !textContent.parentElement.querySelector('.ai-btn')) {
        injectAiUI('textbox', textContent.parentElement, textContent);
    }
}, 800);
```

---

## B) Was ist diese AI und wie funktioniert sie?

Normalerweise laufen KIs (wie ChatGPT) auf riesigen Serverfarmen in den USA. Du sendest deinen Text dorthin, er wird verarbeitet, und die Antwort kommt zurück.

**Wir machen das anders.**

Wir nutzen eine Technologie namens **WebLLM** (basierend auf WebGPU). Damit laden wir ein "komprimiertes Gehirn" (das Sprachmodell) direkt in den **Arbeitsspeicher deiner Grafikkarte**.

Sobald du auf "Download" klickst, passiert folgendes:
1.  Der Browser lädt die Modell-Dateien (~600MB) von einem Server (HuggingFace) herunter.
2.  Er speichert sie **lokal** in deinem Browser-Cache.
3.  Die "Engine" startet und nutzt **deine eigene Hardware** zum Denken.

**Der Beweis im Code:**
In `ai-service.js` siehst du, dass wir keine API-Keys oder Server-URLs zu OpenAI senden, sondern eine lokale Engine starten:

```javascript
// ai-service.js
import { CreateMLCEngine } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.78/+esm";

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

// Hier startet die lokale Intelligenz auf DEINER Hardware
this.engine = await CreateMLCEngine(
    MODEL_ID,
    {
        initProgressCallback: (progress) => {
            console.log("Lade Modell in Speicher:", progress);
            updateUI(progress);
        }
    }
);
```

Wenn du dann eine Anfrage stellst, bleibt diese **innerhalb dieser Variable `engine`** in deinem Browser-Tab.

---

## C) Was bedeutet Open Source?

Das Modell, das wir verwenden, heißt **Llama-3.2-1B** (entwickelt von Meta, optimiert von der Open-Source-Community MLC.ai).

"Open Source" bedeutet hier zwei Dinge:
1.  **Transparenz:** Der Bauplan und die "Gewichte" (das Wissen) des Modells sind öffentlich einsehbar. Jeder Experte kann prüfen, was drin ist.
2.  **Freiheit:** Wir dürfen es kostenlos nutzen und auf eigener Hardware betreiben, ohne von einer Firma abhängig zu sein, die morgen den Stecker ziehen oder die Regeln ändern könnte.

Wir verwenden eine Version, die speziell für Browser "quantisiert" (verkleinert) wurde, damit sie schnell läuft, aber trotzdem kluge Antworten gibt.

---

## D) Warum ist das sicher und wie werden unsere Daten geschützt?

Das ist der wichtigste Punkt: **Datenschutz durch Design ("Privacy by Design").**

Da die AI **lokal** läuft, verlässt **kein einziges Wort** deinen Computer, nachdem das Modell einmal geladen ist.

### 1. Kein "Nach Hause telefonieren"
Klassische AI-Apps senden deinen Text an eine API/Cloud.
Unser Code hat keine solche Schnittstelle für den Text. Der Text wird nur an die lokale Funktion `engine.chat.completions.create` übergeben.

**Beweis:**
```javascript
// ai-service.js - Die Funktion, die den Text verarbeitet
async generateRewrites(text, type) {
    // Der System-Prompt definiert die Persönlichkeit (Lokal definiert!)
    const systemPrompt = SYSTEM_PROMPTS[type];

    // Die Anfrage bleibt im Browser-Speicher
    const response = await this.engine.chat.completions.create({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text } // Dein Text
        ],
        temperature: 0.6, // Kreativitäts-Regler
    });

    return JSON.parse(response.choices[0].message.content);
}
```

### 2. Isolation
Die AI läuft in einer sogenannten "Sandbox" im Browser. Sie hat keinen Zugriff auf deine Festplatte, andere Tabs oder passwords, es sei denn, du gibst sie explizit ein (was wir nicht tun).

### 3. Was wir dem AI Tool schreiben
Wir senden dem Modell strikte Anweisungen (System Prompts), wie es sich verhalten soll. Auch diese Anweisungen liegen transparent in unserem Code (`ai-service.js`) und werden nicht von extern gesteuert.

**Beispiel unserer Anweisung an die AI:**
```javascript
// ai-service.js
const SYSTEM_PROMPTS = {
    textbox: `
You rewrite on-screen info text for a German TV/YouTube race series.
Context:
- 5 participants: Jerry, Marc, Käthe, Taube, Kodiak.
- Style: informative + slightly narrative.
- Output format: Return ONLY valid JSON.
    `
};
```

**Zusammenfassend:**
Es ist sicher, weil die Intelligenz zu den Daten kommt (auf deinen Laptop), und nicht die Daten zur Intelligenz (in die Cloud) geschickt werden.
