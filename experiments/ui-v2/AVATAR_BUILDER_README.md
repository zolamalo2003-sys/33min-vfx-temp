# DiceBear Avatar Builder - Implementation Summary

## Overview
Implemented a custom avatar builder using the DiceBear API (https://api.dicebear.com) with the "croodles" style. Users can now create and customize their profile avatars directly from their profile page.

## Features Implemented

### 1. **Avatar Builder Modal** (`index.html`)
- Added `#avatarBuilderModal` with:
  - Live preview (140px circular display)
  - Seed input field (with fingerprint icon)
  - Random generator button (dice icon)
  - Save/Cancel actions
  - Soft Clay styling matching the app theme

### 2. **Clickable Profile Avatar** (`index.html`)
- Updated profile modal avatar container:
  - Clickable with hover effects (scale + shadow)
  - Shows "edit" overlay on hover
  - Displays DiceBear avatar or placeholder icon
  - 80px size for better visibility

### 3. **Avatar Builder Logic** (`avatar-builder.js`)
- **API Integration:**
  - Base URL: `https://api.dicebear.com/9.x/croodles/svg`
  - Deterministic avatars using seed parameter
  - SVG format for scalability

- **Functions:**
  - `openAvatarBuilder()` - Opens modal with current/random seed
  - `updateAvatarPreview(seed)` - Updates preview image
  - `generateRandomAvatar()` - Creates random seed
  - `saveAvatar()` - Saves seed to Supabase user_metadata
  - `updateProfileAvatar(seed)` - Updates UI with avatar
  - `loadUserAvatar()` - Loads avatar when profile opens

### 4. **Supabase Integration** (`supabase-app.js`)
- Exposed `window.session` and `window.supabase` globally
- Modified `openProfileModal()` to call `loadUserAvatar()`
- Avatar seed stored in `user_metadata.avatar_seed`

## User Flow

1. **Creating an Avatar:**
   - User clicks on profile icon (sidebar)
   - Profile modal opens
   - User clicks on avatar image
   - Avatar Builder modal opens
   - User enters custom seed OR clicks dice for random
   - Preview updates in real-time
   - User clicks "Übernehmen" to save

2. **Persistence:**
   - Seed saved to Supabase `user_metadata`
   - Avatar loads automatically on profile open
   - Same avatar shown across sessions

## Technical Details

### API Usage
- **Style:** croodles (playful, hand-drawn characters)
- **Format:** SVG (scalable, lightweight)
- **Rate Limit:** 50 requests/second (well within limits)
- **URL Pattern:** `https://api.dicebear.com/9.x/croodles/svg?seed={seed}`

### Data Storage
```javascript
// Supabase user_metadata structure
{
  display_name: "User Name",
  avatar_seed: "random-seed-string"
}
```

### Seed Generation
- Uses user email as default seed (deterministic)
- Random seeds: `Math.random().toString(36)` (alphanumeric)
- User can input custom seed for personalization

## Files Modified

1. **index.html**
   - Added Avatar Builder Modal HTML
   - Updated profile avatar container
   - Added avatar-builder.js script tag

2. **experiments/ui-v2/avatar-builder.js** (NEW)
   - Complete avatar builder logic
   - DiceBear API integration
   - Global function exports

3. **experiments/ui-v2/supabase-app.js**
   - Exposed session/supabase globally
   - Integrated avatar loading in profile modal

## Styling
- Matches Soft Clay theme
- Uses existing CSS variables
- Responsive design (min 400px modal)
- Smooth transitions and hover effects

## Future Enhancements (Optional)
- Add more DiceBear styles as options
- Color customization options
- Download avatar as PNG
- Avatar gallery/history
- Batch avatar generation
