// --- 8-BIT RETRO RIVER AUTH MODULE (SUPABASE INTEGRATION) ---
// Connects authentication and user profile statistics (like credits) to Supabase.
// Listens to auth state changes to dynamically handle session cache and trigger UI refreshes.

import { supabase } from './supabase-config.js';

let currentUser = null;

// Helper to wait for network/db delay (simulates retro load screen delays if desired)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Listen to auth state changes to keep currentUser in sync in real-time
supabase.auth.onAuthStateChange((event, session) => {
    console.log("[Auth] onAuthStateChange triggered. Event:", event, "Session:", session);
    if (event === 'PASSWORD_RECOVERY') {
        window.dispatchEvent(new CustomEvent('password-recovery-triggered', { detail: { session } }));
    }
    if (session && session.user) {
        // Set temporary user metadata instantly so the UI can update immediately
        currentUser = {
            id: session.user.id,
            email: session.user.email,
            username: session.user.raw_user_meta_data?.username || 'unknown',
            credits: 10 // Temporary default before database fetch completes (increased from 5 to 10)
        };
        
        // Dispatch event immediately to unblock UI transitions
        window.dispatchEvent(new CustomEvent('auth-state-changed'));

        // Query the profiles table in a non-blocking background task to prevent client header deadlocks
        (async () => {
            try {
                console.log("[Auth] Background fetching user profile for ID:", session.user.id);
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('username, credits')
                    .eq('id', session.user.id)
                    .single();

                if (error) {
                    if (error.code !== 'PGRST116') {
                        console.error("Error fetching user profile:", error);
                    }
                } else if (profile) {
                    let userCredits = profile.credits !== undefined ? profile.credits : 10;
                    
                    // Migrate users with 5 credits to 10 credits
                    if (userCredits === 5 && !localStorage.getItem(`migrated_5_to_10_${session.user.id}`)) {
                        userCredits = 10;
                        console.log("[Auth] Upgrading credits from 5 to 10 for user:", session.user.id);
                        supabase.from('profiles').update({ credits: 10 }).eq('id', session.user.id).then(({ error }) => {
                            if (!error) {
                                localStorage.setItem(`migrated_5_to_10_${session.user.id}`, 'true');
                                currentUser.credits = 10;
                                window.dispatchEvent(new CustomEvent('auth-state-changed'));
                            }
                        });
                    }

                    currentUser.username = profile.username || currentUser.username;
                    currentUser.credits = userCredits;
                    console.log("[Auth] Background profile loaded successfully:", currentUser);
                    window.dispatchEvent(new CustomEvent('auth-state-changed'));
                    
                    // Dispatch custom event to trigger daily free credit check in app.js
                    window.dispatchEvent(new CustomEvent('daily-claim-check', { detail: { userId: session.user.id } }));
                }
            } catch (err) {
                console.error("Background auth state change sync failed:", err);
            }
        })();
    } else {
        currentUser = null;
        console.log("[Auth] Current user set to null (logged out)");
        window.dispatchEvent(new CustomEvent('auth-state-changed'));
    }
});

/**
 * Register a new user on Supabase Auth
 * @param {string} email 
 * @param {string} password 
 * @param {string} username 
 * @returns {Promise<object>} Current session details
 */
export async function signUp(email, password, username, captchaToken) {
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
            emailRedirectTo: window.location.origin,
            captchaToken: captchaToken,
            data: {
                username: trimmedUsername
            }
        }
    });

    if (error) {
        throw new Error(error.message.toUpperCase());
    }

    return {
        session: data.session,
        user: data.user
    };
}

/**
 * Log in an existing user via Supabase Auth
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object>} Current session details
 */
export async function signIn(email, password, captchaToken = "") {
    if (!email || !password) {
        throw new Error("EMAIL AND PASSWORD REQUIRED");
    }

    console.log("[Auth] Calling supabase.auth.signInWithPassword for:", email);
    try {
        const options = {};
        if (captchaToken) {
            options.captchaToken = captchaToken;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password,
            options: options
        });
        console.log("[Auth] supabase.auth.signInWithPassword returned. Data:", data, "Error:", error);

        if (error) {
            throw new Error(error.message.toUpperCase());
        }

        return data.session;
    } catch (e) {
        console.error("[Auth] Exception in signIn function:", e);
        throw e;
    }
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
export async function addCredits(userId, creditsAmount, paymentAmount) {
    await delay(600); // Simulate network purchase delay
    
    // Insert purchase record into public.purchases (trigger updates profile credits)
    const { error: insertError } = await supabase
        .from('purchases')
        .insert([
            {
                user_id: userId,
                amount: paymentAmount,
                credits: creditsAmount,
                stripe_id: 'ch_' + Math.random().toString(36).substring(2, 10)
            }
        ]);
        
    if (insertError) {
        throw new Error("SECURE TRANSACTION FAILED: " + insertError.message.toUpperCase());
    }
    
    // Wait briefly for DB trigger to complete
    await delay(200);
    
    // authoritatively refresh profile stats
    const updatedUser = await refreshUserProfile();
    return updatedUser ? updatedUser.credits : 0;
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

/**
 * Resend confirmation email for signup
 * @param {string} email 
 * @returns {Promise<void>}
 */
export async function resendVerification(email) {
    if (!email) {
        throw new Error("EMAIL IS REQUIRED");
    }

    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {
            emailRedirectTo: window.location.origin
        }
    });

    if (error) {
        throw new Error(error.message.toUpperCase());
    }
}

/**
 * Check if email is already registered using a secure RPC
 * @param {string} email 
 * @returns {Promise<boolean>}
 */
export async function checkEmailExists(email) {
    if (!email) return false;
    const { data, error } = await supabase.rpc('check_email_exists', { email_to_check: email.trim().toLowerCase() });
    if (error) {
        throw new Error("DB EMAIL CHECK FAILED: " + error.message.toUpperCase());
    }
    return !!data;
}

/**
 * Check if user already claimed a sharing reward for a platform in the database
 * @param {string} userId 
 * @param {string} platform 
 * @returns {Promise<boolean>}
 */
export async function checkShareClaimed(userId, platform) {
    const { data, error } = await supabase
        .from('claimed_shares')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', platform)
        .maybeSingle();
        
    if (error) {
        console.error("[Auth] Error checking share claim:", error);
        return false;
    }
    return !!data;
}

/**
 * Log a share claim reward in the database (trigger updates profile credits)
 * @param {string} userId 
 * @param {string} platform 
 * @returns {Promise<boolean>}
 */
export async function logShareClaim(userId, platform) {
    const { error } = await supabase
        .from('claimed_shares')
        .insert([
            {
                user_id: userId,
                platform: platform
            }
        ]);
        
    if (error) {
        throw new Error("CLAIM FAILED: " + error.message.toUpperCase());
    }
    
    await delay(200);
    await refreshUserProfile();
    return true;
}

/**
 * Request password reset email
 * @param {string} email 
 * @param {string} captchaToken
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(email, captchaToken = "") {
    if (!email) {
        throw new Error("EMAIL IS REQUIRED");
    }

    const options = {
        redirectTo: window.location.origin
    };
    if (captchaToken) {
        options.captchaToken = captchaToken;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), options);

    if (error) {
        throw error;
    }
}

/**
 * Update current user's password (e.g. during recovery)
 * @param {string} newPassword 
 * @returns {Promise<void>}
 */
export async function updatePassword(newPassword) {
    if (!newPassword) {
        throw new Error("NEW PASSWORD IS REQUIRED");
    }

    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        throw new Error(error.message.toUpperCase());
    }
}


