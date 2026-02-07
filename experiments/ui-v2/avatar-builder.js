// Interactive Avatar Builder using DiceBear API
// Supports multiple styles, background colors, and custom seeds

// Verfügbare Farben
const colors = [
    { name: 'Weiß', value: 'ffffff' },
    { name: 'Hellblau', value: 'b6e3f4' },
    { name: 'Grün', value: 'c0aede' },
    { name: 'Gelb', value: 'ffdfbf' },
    { name: 'Rosa', value: 'ffd5dc' },
    { name: 'Orange', value: 'ffad60' },
    { name: 'Lila', value: 'd1d4f9' },
    { name: 'Mint', value: 'c7f9cc' },
    { name: 'Pfirsich', value: 'ffc9c9' },
    { name: 'Türkis', value: '81c5ff' },
    { name: 'Lavendel', value: 'e0aaff' },
    { name: 'Beige', value: 'f4e9cd' }
];

let currentBgColor = 'b6e3f4';
let currentSettings = {};

/**
 * Initialize color grid on page load
 */
window.addEventListener('DOMContentLoaded', function () {
    initializeColorGrid();
});

/**
 * Initialize color picker grid
 */
function initializeColorGrid() {
    const grid = document.getElementById('colorGrid');
    if (!grid) return;

    grid.innerHTML = ''; // Clear existing

    colors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'avatar-color-option';
        div.style.backgroundColor = '#' + color.value;
        div.title = color.name;
        div.onclick = () => selectColor(color.value, div);
        if (color.value === currentBgColor) {
            div.classList.add('selected');
        }
        grid.appendChild(div);
    });
}

/**
 * Select a background color
 */
function selectColor(colorValue, element) {
    document.querySelectorAll('.avatar-color-option').forEach(el => {
        el.classList.remove('selected');
    });
    element.classList.add('selected');
    currentBgColor = colorValue;
    updateAvatar();
}

/**
 * Opens the Avatar Builder Modal
 */
function openAvatarBuilder() {
    const modal = document.getElementById('avatarBuilderModal');
    if (!modal) return;

    // Load current settings from user metadata or localStorage
    const session = window.session;
    if (session?.user?.user_metadata?.avatar_settings) {
        const settings = session.user.user_metadata.avatar_settings;
        loadAvatarSettings(settings);
    } else if (localStorage.getItem('avatarSettings')) {
        const settings = JSON.parse(localStorage.getItem('avatarSettings'));
        loadAvatarSettings(settings);
    } else {
        // Default settings
        const defaultSeed = session?.user?.email || generateRandomSeed();
        document.getElementById('avatarSeed').value = defaultSeed;
        document.getElementById('avatarStyle').value = 'avataaars';
    }

    // Initialize color grid if not already done
    if (document.getElementById('colorGrid').children.length === 0) {
        initializeColorGrid();
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    updateAvatar();
}

/**
 * Load avatar settings into the form
 */
function loadAvatarSettings(settings) {
    if (settings.style) {
        document.getElementById('avatarStyle').value = settings.style;
    }
    if (settings.seed) {
        document.getElementById('avatarSeed').value = settings.seed;
    }
    if (settings.bgColor) {
        currentBgColor = settings.bgColor;
        // Update color selection
        document.querySelectorAll('.avatar-color-option').forEach(el => {
            el.classList.remove('selected');
            const bgColor = el.style.backgroundColor;
            const hexColor = rgbToHex(bgColor);
            if (hexColor === currentBgColor) {
                el.classList.add('selected');
            }
        });
    }
}

/**
 * Convert RGB to Hex
 */
function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return 'ffffff';
    return ((1 << 24) + (parseInt(result[0]) << 16) + (parseInt(result[1]) << 8) + parseInt(result[2]))
        .toString(16)
        .slice(1);
}

/**
 * Close Avatar Creator Modal
 */
function closeAvatarCreator() {
    const modal = document.getElementById('avatarBuilderModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Update avatar preview
 */
function updateAvatar() {
    const style = document.getElementById('avatarStyle')?.value || 'avataaars';
    const seed = document.getElementById('avatarSeed')?.value || generateRandomSeed();

    currentSettings = {
        style: style,
        seed: seed,
        bgColor: currentBgColor
    };

    const avatarUrl = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${currentBgColor}`;
    const previewImg = document.getElementById('avatarPreview');
    if (previewImg) {
        previewImg.src = avatarUrl;
    }
}

/**
 * Generate random avatar
 */
function generateRandomAvatar() {
    const randomSeed = generateRandomSeed();
    const seedInput = document.getElementById('avatarSeed');
    if (seedInput) {
        seedInput.value = randomSeed;
    }

    // Random color
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    currentBgColor = randomColor.value;

    // Update color selection
    document.querySelectorAll('.avatar-color-option').forEach(el => {
        el.classList.remove('selected');
        const bgColor = el.style.backgroundColor;
        const hexColor = rgbToHex(bgColor);
        if (hexColor === currentBgColor) {
            el.classList.add('selected');
        }
    });

    updateAvatar();
}

/**
 * Generate random seed string
 */
function generateRandomSeed() {
    return 'user-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Save avatar to user profile
 */
async function saveAvatar() {
    const previewImg = document.getElementById('avatarPreview');
    if (!previewImg || !previewImg.src) {
        alert('Bitte generiere zuerst einen Avatar!');
        return;
    }

    const supabase = window.supabase;
    const session = window.session;

    if (!supabase || !session) {
        // Fallback: Save to localStorage only
        localStorage.setItem('avatarSettings', JSON.stringify(currentSettings));
        localStorage.setItem('userAvatar', previewImg.src);
        updateProfileAvatar(currentSettings);
        closeAvatarCreator();
        showNotification('✅ Avatar gespeichert (lokal)');
        return;
    }

    try {
        // Save to Supabase user_metadata
        const { data, error } = await supabase.auth.updateUser({
            data: {
                avatar_settings: currentSettings
            }
        });

        if (error) {
            console.error('Error saving avatar:', error);
            alert('Fehler beim Speichern: ' + error.message);
            return;
        }

        // Update session
        if (data.user) {
            window.session.user = data.user;
        }

        // Also save to localStorage as backup
        localStorage.setItem('avatarSettings', JSON.stringify(currentSettings));
        localStorage.setItem('userAvatar', previewImg.src);

        // Update UI
        updateProfileAvatar(currentSettings);
        closeAvatarCreator();
        showNotification('✅ Avatar erfolgreich gespeichert!');

    } catch (err) {
        console.error('Error saving avatar:', err);
        alert('Fehler beim Speichern des Avatars.');
    }
}

/**
 * Update profile avatar display
 */
function updateProfileAvatar(settings) {
    if (!settings || !settings.seed) return;

    const avatarUrl = `https://api.dicebear.com/9.x/${settings.style}/svg?seed=${encodeURIComponent(settings.seed)}&backgroundColor=${settings.bgColor}`;

    // Update profile modal avatar
    const profileImg = document.getElementById('profileAvatarImg');
    const profilePlaceholder = document.getElementById('profileAvatarPlaceholder');

    if (profileImg) {
        profileImg.src = avatarUrl;
        profileImg.style.display = 'block';
    }

    if (profilePlaceholder) {
        profilePlaceholder.style.display = 'none';
    }
}

/**
 * Load user avatar when profile opens
 */
function loadUserAvatar() {
    const session = window.session;
    let settings = null;

    // Try to load from session first
    if (session?.user?.user_metadata?.avatar_settings) {
        settings = session.user.user_metadata.avatar_settings;
    }
    // Fallback to localStorage
    else if (localStorage.getItem('avatarSettings')) {
        settings = JSON.parse(localStorage.getItem('avatarSettings'));
    }

    if (settings) {
        updateProfileAvatar(settings);
    }
}

/**
 * Show notification message
 */
function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--primary, #4CAF50);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: var(--shadow-float, 0 4px 12px rgba(0,0,0,0.15));
        z-index: 100000;
        animation: slideInNotification 0.3s ease;
        font-weight: 600;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutNotification 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInNotification {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutNotification {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Export functions to global scope
window.openAvatarBuilder = openAvatarBuilder;
window.closeAvatarCreator = closeAvatarCreator;
window.updateAvatar = updateAvatar;
window.generateRandomAvatar = generateRandomAvatar;
window.saveAvatar = saveAvatar;
window.updateProfileAvatar = updateProfileAvatar;
window.loadUserAvatar = loadUserAvatar;
window.selectColor = selectColor;
