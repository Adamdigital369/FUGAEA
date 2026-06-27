// --- 8-BIT RETRO RIVER AUTH MODULE ---
// Mimics a real auth provider (like Supabase Auth or Firebase Auth) using LocalStorage.
// Uses Promises and async methods to make it extremely easy to replace with a real SDK.

const LOCAL_STORAGE_USERS_KEY = "retro_river_users";
const LOCAL_STORAGE_SESSION_KEY = "retro_river_session";

// Helper to simulate network latency
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get all registered users from storage
function getStoredUsers() {
    const data = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    return data ? JSON.parse(data) : [];
}

// Save users array to storage
function saveUsers(users) {
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
}

/**
 * Register a new user
 * @param {string} email 
 * @param {string} password 
 * @param {string} username 
 * @returns {Promise<object>} Current session details
 */
export async function signUp(email, password, username) {
    await delay(600); // Simulate API call delay
    
    if (!email || !password || !username) {
        throw new Error("ALL FIELDS REQUIRED FOR REGISTRATION");
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3) {
        throw new Error("USERNAME MUST BE AT LEAST 3 CHARACTERS");
    }

    const users = getStoredUsers();

    // Check if user already exists
    const emailExists = users.some(u => u.email === trimmedEmail);
    if (emailExists) {
        throw new Error("EMAIL ALREADY REGISTERED");
    }

    const usernameExists = users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
    if (usernameExists) {
        throw new Error("USERNAME ALREADY TAKEN");
    }

    // Add new user
    const newUser = {
        id: "usr_" + Math.random().toString(36).substr(2, 9),
        email: trimmedEmail,
        password: password, // Note: In production, never store raw passwords on a database!
        username: trimmedUsername,
        credits: 5, // 5 free starter credits!
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    // Auto log in after sign up
    return signIn(trimmedEmail, password);
}

/**
 * Log in an existing user
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object>} Current session details
 */
export async function signIn(email, password) {
    await delay(500); // Simulate API call delay

    if (!email || !password) {
        throw new Error("EMAIL AND PASSWORD REQUIRED");
    }

    const trimmedEmail = email.trim().toLowerCase();
    const users = getStoredUsers();

    const user = users.find(u => u.email === trimmedEmail && u.password === password);
    if (!user) {
        throw new Error("INVALID EMAIL OR PASSWORD");
    }

    // Create session (exposing user info, omit password)
    const session = {
        user: {
            id: user.id,
            email: user.email,
            username: user.username
        },
        token: "tok_" + Math.random().toString(36).substr(2, 16),
        expiresAt: Date.now() + 3600000 // 1 hour expiration
    };

    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(session));
    return session;
}

/**
 * Log out current user session
 * @returns {Promise<void>}
 */
export async function signOut() {
    await delay(300);
    localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
}

/**
 * Retrieve current user session if valid
 * @returns {object|null} Current user object or null
 */
export function getCurrentUser() {
    const sessionData = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
    if (!sessionData) return null;

    try {
        const session = JSON.parse(sessionData);
        if (Date.now() > session.expiresAt) {
            // Session expired
            localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
            return null;
        }
        
        // Fetch up-to-date user info (like credits) from the users DB
        const users = getStoredUsers();
        const user = users.find(u => u.id === session.user.id);
        if (!user) {
            localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            credits: user.credits !== undefined ? user.credits : 0
        };
    } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
        return null;
    }
}

/**
 * Deduct 1 credit from a user's account
 * @param {string} userId 
 * @returns {Promise<number>} New credit count
 */
export async function deductCredit(userId) {
    await delay(100);
    const users = getStoredUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("USER NOT FOUND");

    const user = users[userIndex];
    if ((user.credits || 0) < 1) {
        throw new Error("INSUFFICIENT CREDITS");
    }

    user.credits = (user.credits || 0) - 1;
    users[userIndex] = user;
    saveUsers(users);
    return user.credits;
}

/**
 * Add credits to a user's account (simulated purchase)
 * @param {string} userId 
 * @param {number} amount 
 * @returns {Promise<number>} New credit count
 */
export async function addCredits(userId, amount) {
    await delay(600); // simulate payment processing delay
    const users = getStoredUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("USER NOT FOUND");

    const user = users[userIndex];
    user.credits = (user.credits || 0) + amount;
    users[userIndex] = user;
    saveUsers(users);
    return user.credits;
}
