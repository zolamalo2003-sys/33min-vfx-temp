// Avatar Builder using DiceBear API
// Style: croodles

const DICEBEAR_STYLE = 'croodles';
const DICEBEAR_BASE_URL = `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg`;

let currentAvatarSeed = '';

/**
 * Opens the Avatar Builder Modal
 */
function openAvatarBuilder() {
    const modal = document.getElementById('avatarBuilderModal');
    if (!modal) return;

    // Load current avatar seed from user metadata or generate random
    const session = window.session; // Assuming session is globally available
    if (session?.user?.user_metadata?.avatar_seed) {
        currentAvatarSeed = session.user.user_metadata.avatar_seed;
    } else {
        // Generate random seed based on email or random string
        currentAvatarSeed = session?.user?.email || generateRandomSeed();
    }

    // Update input and preview
    const seedInput = document.getElementById('avatarSeedInput');
    if (seedInput) seedInput.value = currentAvatarSeed;

    updateAvatarPreview(currentAvatarSeed);
    modal.style.display = 'flex';
}

/**
 * Updates the avatar preview based on seed
 */
function updateAvatarPreview(seed) {
    if (!seed) seed = generateRandomSeed();
    currentAvatarSeed = seed;

    const previewImg = document.getElementById('avatarBuilderPreview');
    if (previewImg) {
        const avatarUrl = `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}`;
        previewImg.src = avatarUrl;
    }
}

/**
 * Generates a random avatar
 */
function generateRandomAvatar() {
    const randomSeed = generateRandomSeed();
    const seedInput = document.getElementById('avatarSeedInput');
    if (seedInput) seedInput.value = randomSeed;
    updateAvatarPreview(randomSeed);
}

/**
 * Generates a random seed string
 */
function generateRandomSeed() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Saves the avatar to user profile
 */
async function saveAvatar() {
    if (!currentAvatarSeed) {
        alert('Bitte wähle einen Avatar aus.');
        return;
    }

    // Get supabase instance (assuming it's globally available)
    const supabase = window.supabase;
    if (!supabase) {
        alert('Supabase nicht verfügbar.');
        return;
    }

    try {
        // Update user metadata with avatar seed
        const { data, error } = await supabase.auth.updateUser({
            data: { avatar_seed: currentAvatarSeed }
        });

        if (error) {
            console.error('Error saving avatar:', error);
            alert('Fehler beim Speichern des Avatars: ' + error.message);
            return;
        }

        // Update session if available
        if (window.session && data.user) {
            window.session.user = data.user;
        }

        // Update profile avatar display
        updateProfileAvatar(currentAvatarSeed);

        // Close modal
        document.getElementById('avatarBuilderModal').style.display = 'none';

        alert('Avatar erfolgreich gespeichert!');
    } catch (err) {
        console.error('Error saving avatar:', err);
        alert('Fehler beim Speichern des Avatars.');
    }
}

/**
 * Updates the profile avatar display
 */
function updateProfileAvatar(seed) {
    if (!seed) return;

    const avatarUrl = `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}`;

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
 * Loads user avatar on profile open
 */
function loadUserAvatar() {
    const session = window.session;
    if (!session?.user?.user_metadata?.avatar_seed) return;

    updateProfileAvatar(session.user.user_metadata.avatar_seed);
}

// Export functions to global scope
window.openAvatarBuilder = openAvatarBuilder;
window.updateAvatarPreview = updateAvatarPreview;
window.generateRandomAvatar = generateRandomAvatar;
window.saveAvatar = saveAvatar;
window.updateProfileAvatar = updateProfileAvatar;
window.loadUserAvatar = loadUserAvatar;
