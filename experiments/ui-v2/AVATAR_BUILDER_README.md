# 🎨 Interactive DiceBear Avatar Builder

## Übersicht
Ein vollständig interaktiver Avatar-Builder mit DiceBear API Integration. Benutzer können aus **11 verschiedenen Avatar-Stilen** wählen, **12 Hintergrundfarben** auswählen und **eigene Seeds** eingeben oder **zufällige Avatare** generieren.

---

## ✨ Features

### 1. **Interaktive Avatar-Erstellung**
- ✅ **11 Avatar-Stile:**
  - Avataaars (Comic)
  - Bottts (Roboter)
  - Personas
  - Lorelei
  - Notionists
  - Adventurer
  - Big Smile
  - Fun Emoji
  - Thumbs
  - Initialen
  - Croodles

- ✅ **12 Hintergrundfarben:**
  - Weiß, Hellblau, Grün, Gelb, Rosa, Orange
  - Lila, Mint, Pfirsich, Türkis, Lavendel, Beige

- ✅ **Custom Seed Input:**
  - Eingabe eigener Namen/Texte
  - Deterministische Generierung (gleicher Seed = gleicher Avatar)

- ✅ **Zufalls-Generator:**
  - Button für komplett zufällige Avatare
  - Zufälliger Seed + zufällige Farbe

### 2. **Live-Vorschau**
- Große 200px Vorschau (rund)
- Echtzeit-Updates bei jeder Änderung
- Soft Clay Design mit Neumorphismus

### 3. **Persistenz**
- Speicherung in **Supabase** `user_metadata.avatar_settings`
- Fallback zu **localStorage** (Guest-Modus)
- Automatisches Laden beim Profil öffnen

### 4. **UI/UX**
- Zwei-Spalten-Layout (Vorschau | Optionen)
- Responsive Design (Mobile: 1 Spalte)
- Soft Clay Theme Integration
- Hover-Effekte auf Farbauswahl
- Benachrichtigungen bei Speichern

---

## 🎯 Benutzer-Flow

### Avatar erstellen:
1. **Profil öffnen** (Sidebar → Profil-Icon klicken)
2. **Avatar anklicken** (großes Profilbild)
3. **Avatar Builder öffnet sich**
4. **Stil auswählen** (Dropdown)
5. **Name eingeben** ODER **Zufällig klicken**
6. **Farbe wählen** (Grid mit 12 Farben)
7. **Vorschau prüfen** (Live-Update)
8. **Speichern klicken**

### Gespeicherte Daten:
```javascript
{
  style: "avataaars",
  seed: "MaxMustermann",
  bgColor: "b6e3f4"
}
```

---

## 🔧 Technische Details

### API-Nutzung
```
https://api.dicebear.com/9.x/{style}/svg?seed={seed}&backgroundColor={bgColor}
```

**Beispiel:**
```
https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4
```

### Datenspeicherung

#### Supabase (wenn eingeloggt):
```javascript
await supabase.auth.updateUser({
  data: { 
    avatar_settings: {
      style: "avataaars",
      seed: "user-abc123",
      bgColor: "b6e3f4"
    }
  }
});
```

#### LocalStorage (Fallback):
```javascript
localStorage.setItem('avatarSettings', JSON.stringify(settings));
localStorage.setItem('userAvatar', avatarUrl);
```

### Funktionen

| Funktion | Beschreibung |
|----------|--------------|
| `openAvatarBuilder()` | Öffnet Modal, lädt gespeicherte Einstellungen |
| `closeAvatarCreator()` | Schließt Modal |
| `updateAvatar()` | Aktualisiert Vorschau bei Änderungen |
| `generateRandomAvatar()` | Generiert zufälligen Avatar |
| `saveAvatar()` | Speichert in Supabase + localStorage |
| `loadUserAvatar()` | Lädt Avatar beim Profil öffnen |
| `selectColor(color, element)` | Wählt Hintergrundfarbe |
| `initializeColorGrid()` | Erstellt Farbauswahl-Grid |

---

## 📁 Dateien

### Geändert:
1. **`index.html`**
   - Neues Modal-Layout (2-Spalten)
   - Farbauswahl-Grid
   - Stil-Dropdown
   - CSS für `.avatar-creator-layout`, `.avatar-color-grid`, `.avatar-color-option`

2. **`experiments/ui-v2/avatar-builder.js`**
   - Komplette Neuentwicklung
   - 12 Farben definiert
   - Interaktive Funktionen
   - Supabase Integration
   - LocalStorage Fallback

3. **`experiments/ui-v2/supabase-app.js`**
   - `window.session` und `window.supabase` global verfügbar
   - `loadUserAvatar()` wird in `openProfileModal()` aufgerufen

---

## 🎨 Design-Integration

### Soft Clay Theme:
- ✅ Verwendet `var(--primary)`, `var(--text)`, `var(--shadow-out)`
- ✅ Neumorphismus-Schatten auf Farboptionen
- ✅ Hover-Effekte mit `transform: scale(1.1)`
- ✅ Selected State: Border + Box-Shadow

### Responsive:
```css
@media (max-width: 768px) {
  .avatar-creator-layout {
    grid-template-columns: 1fr; /* Stacked Layout */
  }
}
```

---

## 🚀 Verwendung

### Als Entwickler:
```javascript
// Avatar programmatisch setzen
window.updateProfileAvatar({
  style: 'bottts',
  seed: 'robot-123',
  bgColor: 'ffad60'
});

// Modal öffnen
window.openAvatarBuilder();

// Zufälligen Avatar generieren
window.generateRandomAvatar();
```

### Als Benutzer:
1. Einloggen
2. Profil öffnen
3. Avatar anklicken
4. Gestalten & Speichern
5. Avatar wird überall angezeigt

---

## 🔮 Zukünftige Erweiterungen (Optional)

- [ ] Avatar-Galerie (Verlauf der letzten 5 Avatare)
- [ ] Download als PNG/SVG
- [ ] Mehr DiceBear-Optionen (z.B. `flip`, `rotate`)
- [ ] Avatar-Vorlagen ("Beliebte Avatare")
- [ ] Social Sharing
- [ ] Avatar in Cloud-Tabelle anzeigen

---

## 📊 Vorteile gegenüber einfacher Lösung

| Feature | Einfach | Interaktiv ✅ |
|---------|---------|--------------|
| Stil-Auswahl | ❌ | ✅ 11 Stile |
| Farb-Auswahl | ❌ | ✅ 12 Farben |
| Zufalls-Generator | ✅ | ✅ + Farbe |
| Live-Vorschau | ✅ | ✅ Größer |
| UI/UX | Basic | Premium |
| Anpassbarkeit | Niedrig | Hoch |

---

## 🎉 Fertig!

Der Avatar-Builder ist vollständig funktional und in dein Soft Clay Design integriert. Benutzer können jetzt kreative, personalisierte Avatare erstellen! 🚀
