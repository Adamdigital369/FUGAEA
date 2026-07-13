// --- 8-BIT RETRO RIVER DATABASE MODULE (SUPABASE INTEGRATION) ---
// Handles link posts storage in Supabase PostgreSQL tables.
// Automatically validates inputs and filters spam before sending data to the DB.

import { supabase } from './supabase-config.js';

// Spam Prevention Keyword Blocklist
const KEYWORD_BLOCKLIST = [
    "spam", "scam", "illegal", "hack", "viagra", "casino", "lottery", "free money",
    "porn", "pornhub", "xvideos", "nsfw", "adult content", "xxx"
];

// Spam & Malicious Domain Blocklist (Cybersecurity Layer 1 Edge check simulation)
export const ILLEGAL_DOMAINS = [
    "malware-site.com",
    "phish-bank.net",
    "virus-download.org",
    "spyware-central.com",
    "illegal-content.xyz",
    "darkweb-link.ru",
    "scam-cash.info",
    "class1-content.gov.au",
    "bit.ly/malicious-link",
    "tinyurl.com/spyware-redir",
    "pornhub.com",
    "xvideos.com",
    "xnxx.com",
    "redtube.com",
    "youporn.com",
    "onlyfans.com",
    "xhamster.com",
    "chaturbate.com",
    "bongacams.com",
    "stripchat.com",
    "spankbang.com"
];

// Basic input sanitization to prevent XSS
function sanitizeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Sanitize URL by removing tracking IDs and email addresses in query parameters (GDPR/CCPA Compliance)
function sanitizeUrlQueryParameters(urlString) {
    try {
        let targetString = urlString.trim();
        if (!/^https?:\/\//i.test(targetString)) {
            targetString = "https://" + targetString;
        }
        
        const urlObj = new URL(targetString);
        const params = new URLSearchParams(urlObj.search);
        const keysToUpdate = [];
        
        const TRACKING_KEYS = [
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
            "fbclid", "gclid", "yclid", "msclkid", "dclid", "li_fat_id"
        ];
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        for (const [key, value] of params.entries()) {
            const lowerKey = key.toLowerCase();
            
            if (TRACKING_KEYS.includes(lowerKey)) {
                keysToUpdate.push(key);
                continue;
            }
            
            if (emailRegex.test(value) || lowerKey.includes("email") || lowerKey.includes("mail")) {
                keysToUpdate.push(key);
            }
        }
        
        keysToUpdate.forEach(key => params.delete(key));
        urlObj.search = params.toString();
        
        let result = urlObj.toString();
        if (!/^https?:\/\//i.test(urlString)) {
            result = result.replace(/^https:\/\//i, "");
        }
        return result;
    } catch (_) {
        return urlString;
    }
}

// Validate URL format (Bypassed to allow wrong URLs)
function isValidURL(string) {
    return true;
}

/**
 * Fetch all posts in the river (ordered by date, oldest first)
 * @returns {Promise<Array>} List of posts
 */
export async function getPosts() {
    const { data, error } = await supabase
        .from('posts')
        .select(`
            id,
            text,
            url,
            sprite,
            created_at,
            clicks,
            profiles (
                username
            )
        `)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error("DB FETCH ERROR: " + error.message.toUpperCase());
    }

    return data.map(post => ({
        id: post.id,
        username: post.profiles?.username || 'unknown',
        text: post.text,
        url: post.url,
        sprite: post.sprite,
        createdAt: post.created_at,
        clicks: post.clicks || 0
    }));
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
    // 1. Get the current active user session to confirm login status and ID
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) {
        throw new Error("MUST BE LOGGED IN TO SUBMIT LINKS");
    }
    const userId = session.user.id;

    if (!text || !url) {
        throw new Error("USERNAME, TEXT AND URL ARE REQUIRED");
    }

    const cleanText = sanitizeHTML(text.trim());
    let cleanUrl = sanitizeUrlQueryParameters(url.trim());

    // Validate content against keyword blocklist
    const lowerText = cleanText.toLowerCase();
    const lowerUrl = cleanUrl.toLowerCase();
    const isBlocked = KEYWORD_BLOCKLIST.some(word => lowerText.includes(word) || lowerUrl.includes(word));
    if (isBlocked) {
        throw new Error("CONTENT CONTAINS BLOCKED KEYWORDS OR PHRASES");
    }

    // Cybersecurity Layer 1 Edge Scan check
    const isIllegalDomain = ILLEGAL_DOMAINS.some(domain => lowerUrl.includes(domain));
    if (isIllegalDomain) {
        throw new Error("BLOCKED BY LAYER 1 (EDGE CHECK): MALICIOUS OR ILLEGAL DESTINATION DOMAIN DETECTED.");
    }

    // If the URL doesn't start with http:// or https://, prepend https://
    if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = "https://" + cleanUrl;
    }

    if (cleanText.length === 0 || cleanText.length > 40) {
        throw new Error("TEXT IS TOO LONG (MAX 40 CHARS)");
    }

    if (!isValidURL(cleanUrl)) {
        throw new Error("INVALID LINK URL FORMAT. ENTER A VALID WEB ADDRESS.");
    }

    const chosenSprite = sprite || "log";

    // Insert the new post into the Supabase database
    // The database level BEFORE INSERT trigger 'on_post_created' handles 
    // credit verification and deductions automatically!
    const { data, error } = await supabase
        .from('posts')
        .insert([
            {
                user_id: userId,
                text: cleanText,
                url: cleanUrl,
                sprite: chosenSprite
            }
        ])
        .select()
        .single();

    if (error) {
        // Capture triggers/RLS error messages from Postgres and raise them to the user
        throw new Error(error.message.toUpperCase());
    }

    return {
        id: data.id,
        username: username,
        text: data.text,
        url: data.url,
        sprite: data.sprite,
        createdAt: data.created_at
    };
}

/**
 * Clear all posts and reset to seed data (Disabled on live shared site)
 * @returns {Promise<Array>} Current posts list
 */
export async function resetDatabase() {
    return getPosts();
}

/**
 * Increment click count of a post in database
 * @param {string} postId 
 * @returns {Promise<void>}
 */
export async function incrementClicks(postId) {
    if (!postId) return;
    const { error } = await supabase.rpc('increment_post_clicks', { post_id: postId });
    if (error) {
        console.error("Error incrementing clicks:", error);
    }
}

/**
 * Fetch total accumulative clicks from global statistics
 * @returns {Promise<number>} Global clicks count
 */
export async function getTotalClicks() {
    const { data, error } = await supabase
        .from('statistics')
        .select('value')
        .eq('key', 'total_clicks')
        .single();
        
    if (error) {
        console.error("Failed to fetch global statistics:", error);
        return 0;
    }
    return data ? Number(data.value) : 0;
}
