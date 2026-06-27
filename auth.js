// --- 8-BIT RETRO RIVER AUTH MODULE (SUPABASE INTEGRATION) ---
// Connects authentication and user profile statistics (like credits) to Supabase.
// Listens to auth state changes to dynamically handle session cache and trigger UI refreshes.

import { supabase } from './supabase-config.js';

let currentUser = null;

// Helper to wait for network/db delay (simulates retro load screen delays if desired)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Listen to auth state changes to keep currentUser in sync in real-time
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        try {
            // Fetch public profile details (credits and username) from database
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('username, credits')
                .eq('id', session.user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error("Error fetching user profile:", error);
            }

            currentUser = {
                id: session.user.id,
                email: session.user.email,
                username: profile?.username || session.user.raw_user_meta_data?.username || 'unknown',
                credits: profile?.credits !== undefined ? profile.credits : 5
            };
        } catch (err) {
            console.error("Auth state change sync failed:", err);
        }
    } else {
        currentUser = null;
    }
    
    // Dispatch a custom event to notify app.js to update the HUD/UI elements
    window.dispatchEvent(new CustomEvent('auth-state-changed'));
});

/**
 * Register a new user on Supabase Auth
 * @param {string} email 
 * @param {string} password 
 * @param {string} username 
 * @returns {Promise<object>} Current session details
 */
export async function signUp(email, password, username) {
    if (!email || !password || !username) {
        throw new Error("ALL FIELDS REQUIRED FOR REGISTRATION");
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
        throw new Error("USERNAME MUST BE AT LEAST 3 CHARACTERS");
    }

    // Call Supabase auth signup
    // Passing username in options.data so our PostgreSQL database trigger can access it
    const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
            data: {
                username: trimmedUsername
            }
        }
    });

    if (error) {
        throw new Error(error.message.toUpperCase());
    }

    // If signup is successful and requires verification or auto-logs in
    if (!data.session) {
        throw new Error("REGISTRATION SUCCESSFUL! PLEASE CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT.");
    }

    return data.session;
}

/**
 * Log in an existing user via Supabase Auth
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object>} Current session details
 */
export async function signIn(email, password) {
    if (!email || !password) {
        throw new Error("EMAIL AND PASSWORD REQUIRED");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
    });

    if (error) {
        throw new Error(error.message.toUpperCase());
    }

    return data.session;
}

/**
 * Log out current user session
 * @returns {Promise<void>}
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        throw new Error(error.message.toUpperCase());
    }
}

/**
 * Retrieve current user session if valid
 * @returns {object|null} Current user object or null
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Deduct 1 credit from a user's account
 * @param {string} userId 
 * @returns {Promise<boolean>} Success state
 */
export async function deductCredit(userId) {
    // --- AUTOMATED DATABASE TRANSACTION ---
    // Note: To prevent race conditions and hacking, credit deduction is now handled 
    // automatically in the database via the 'on_post_created' trigger BEFORE inserts
    // in the 'posts' table. So we return true here as a no-op to maintain API compatibility.
    return true;
}

/**
 * Add credits to a user's account (simulated purchase)
 * @param {string} userId 
 * @param {number} amount 
 * @returns {Promise<number>} New credit count
 */
export async function addCredits(userId, amount) {
    await delay(600); // Simulate network purchase delay
    
    // Fetch current credits
    const { data: profile, error: selectError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
        
    if (selectError) {
        throw new Error("USER PROFILE NOT FOUND");
    }
    
    const newCredits = (profile?.credits || 0) + amount;
    
    // Update public.profiles table (requires active auth token match)
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
        
    if (updateError) {
        throw new Error("CREDIT UPDATE FAILED: " + updateError.message.toUpperCase());
    }
    
    // Update the local cached cache immediately for UI responsiveness
    if (currentUser && currentUser.id === userId) {
        currentUser.credits = newCredits;
    }
    
    return newCredits;
}

/**
 * Force refresh the local cached user profile details from the database
 * @returns {Promise<object|null>} Updated user profile or null
 */
export async function refreshUserProfile() {
    if (!currentUser) return null;
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('credits, username')
        .eq('id', currentUser.id)
        .single();
        
    if (error) {
        console.error("Failed to refresh user profile:", error);
        return currentUser;
    }
    
    if (profile) {
        currentUser.credits = profile.credits;
        currentUser.username = profile.username;
    }
    
    window.dispatchEvent(new CustomEvent('auth-state-changed'));
    return currentUser;
}

