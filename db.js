// --- 8-BIT RETRO RIVER DATABASE MODULE ---
// Handles posts storage in LocalStorage, including validation and seeding.
// Like auth.js, this uses Promises and async methods to facilitate switching to Supabase/Firestore.

const LOCAL_STORAGE_POSTS_KEY = "retro_river_posts";

// Helper to simulate network latency
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Default seed data to ensure the river starts populated with interesting links!
const SEED_POSTS = [
    {
        id: "seed_1",
        username: "ChiptuneHero",
        text: "My favorite 8-bit synth music creator!",
        url: "https://beepbox.co",
        sprite: "log",
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString() // 5 hours ago
    },
    {
        id: "seed_2",
        username: "PixelArtFan",
        text: "Make your own retro pixel art online",
        url: "https://www.pixilart.com",
        sprite: "log",
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString() // 3 hours ago
    },
    {
        id: "seed_3",
        username: "RetroGamer",
        text: "Archive of classic retro games!",
        url: "https://classicreload.com",
        sprite: "log",
        createdAt: new Date(Date.now() - 3600000 * 1).toISOString() // 1 hour ago
    },
    {
        id: "seed_4",
        username: "WebDevKid",
        text: "Google Fonts for retro styling",
        url: "https://fonts.google.com/specimen/Press+Start+2P",
        sprite: "log",
        createdAt: new Date(Date.now() - 1800000).toISOString() // 30 mins ago
    }
];

// Spam Prevention Keyword Blocklist
const KEYWORD_BLOCKLIST = [
    "spam", "scam", "illegal", "hack", "viagra", "casino", "lottery", "free money", "cryptocurrency", "bitcoin"
];

// Read posts from LocalStorage
function getStoredPosts() {
    const data = localStorage.getItem(LOCAL_STORAGE_POSTS_KEY);
    if (!data) {
        // Initialize with seed data on first load
        localStorage.setItem(LOCAL_STORAGE_POSTS_KEY, JSON.stringify(SEED_POSTS));
        return SEED_POSTS;
    }
    try {
        return JSON.parse(data);
    } catch (e) {
        return SEED_POSTS;
    }
}

// Write posts to LocalStorage
function savePosts(posts) {
    localStorage.setItem(LOCAL_STORAGE_POSTS_KEY, JSON.stringify(posts));
}

// Basic input sanitization to prevent XSS
function sanitizeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Validate URL format
function isValidURL(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

/**
 * Fetch all posts in the river (ordered by date)
 * @returns {Promise<Array>} List of posts
 */
export async function getPosts() {
    await delay(300); // Simulate network load
    const posts = getStoredPosts();
    // Sort oldest first (so they flow in historical order) or newest first
    return posts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Add a new link post to the river
 * @param {object} postDetails 
 * @param {string} postDetails.username
 * @param {string} postDetails.text
 * @param {string} postDetails.url
 * @param {string} postDetails.sprite
 * @returns {Promise<object>} The newly created post
 */
export async function addPost({ username, text, url, sprite }) {
    await delay(400); // Simulate write delay

    if (!username || !text || !url) {
        throw new Error("USERNAME, TEXT AND URL ARE REQUIRED");
    }

    const cleanUsername = sanitizeHTML(username.trim().replace(/^@/, ""));
    const cleanText = sanitizeHTML(text.trim());
    let cleanUrl = url.trim();

    // Validate content against keyword blocklist
    const lowerText = cleanText.toLowerCase();
    const lowerUrl = cleanUrl.toLowerCase();
    const isBlocked = KEYWORD_BLOCKLIST.some(word => lowerText.includes(word) || lowerUrl.includes(word));
    if (isBlocked) {
        throw new Error("CONTENT CONTAINS BLOCKED KEYWORDS OR PHRASES");
    }
    // If the URL doesn't start with http:// or https://, prepend https://
    if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = "https://" + cleanUrl;
    }

    if (cleanUsername.length === 0 || cleanUsername.length > 20) {
        throw new Error("INVALID USERNAME LENGTH (1-20 CHARS)");
    }

    if (cleanText.length === 0 || cleanText.length > 40) {
        throw new Error("TEXT IS TOO LONG (MAX 40 CHARS)");
    }

    if (!isValidURL(cleanUrl)) {
        throw new Error("INVALID LINK URL FORMAT. ENTER A VALID WEB ADDRESS.");
    }

    const chosenSprite = "log";

    const posts = getStoredPosts();

    const newPost = {
        id: "post_" + Math.random().toString(36).substr(2, 9),
        username: cleanUsername,
        text: cleanText,
        url: cleanUrl,
        sprite: chosenSprite,
        createdAt: new Date().toISOString()
    };

    posts.push(newPost);
    savePosts(posts);

    return newPost;
}

/**
 * Clear all posts and reset to seed data (admin function)
 * @returns {Promise<Array>} Seeded posts list
 */
export async function resetDatabase() {
    await delay(500);
    localStorage.setItem(LOCAL_STORAGE_POSTS_KEY, JSON.stringify(SEED_POSTS));
    return SEED_POSTS;
}
