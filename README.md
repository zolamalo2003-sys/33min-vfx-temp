# Grafiken Spreadsheet

Ein modernes, Google-ähnliches Spreadsheet zur Verwaltung von Animationen für das Team.

## Features
- **Animationstypen**: Temperatur, Zeit, Geld, Übersicht, TextBox, To-Do.
- **Google Sheets Integration**: Direktes Speichern und Laden von Daten in/aus Google Sheets.
- **Dino Game**: Ein integriertes Spiel für die Pause.
- **Design**: Clean, responsive und mit Dark Mode Unterstützung.

## Installation
1. Repository klonen.
2. `index.html` im Browser öffnen.

## Nutzung
- Trage deine Daten ein.
- Exportiere sie als CSV oder speichere sie direkt in Google Sheets.
- Die exportierten Daten können direkt in After Effects für automatisierte Animationen genutzt werden.

## AI Assistant (TextBox & To-Do)
Für die AI-Vorschläge läuft ein kleiner Server, damit der API-Key nicht im Frontend landet.

1. Umgebungsvariable setzen:
   ```bash
   export OPENAI_API_KEY="dein-key-hier"
   ```
2. Server starten:
   ```bash
   npm start
   ```
3. Danach im Browser `http://localhost:3000` öffnen.
