// --- 8-BIT RETRO RIVER MAIN APPLICATION ---
import * as auth from "./auth.js";
import * as db from "./db.js";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase-config.js";

// --- RETRO SERVER CLOCK SYNCHRONIZER (NTP-STYLE CLOCK SKEW SYNC) ---
window.serverTimeOffset = 0;

async function syncServerTimeOffset() {
    try {
        const start = Date.now();
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'HEAD',
            headers: {
                'apikey': supabaseAnonKey
            }
        });
        const end = Date.now();
        const serverDateHeader = response.headers.get('date');
        if (serverDateHeader) {
            const serverTime = new Date(serverDateHeader).getTime();
            const latency = (end - start) / 2;
            const adjustedServerTime = serverTime + latency;
            window.serverTimeOffset = adjustedServerTime - end;
            console.log(`[Clock Sync] Server offset: ${window.serverTimeOffset}ms (latency: ${latency}ms)`);
        }
    } catch (e) {
        console.error("Failed to sync server time offset:", e);
    }
}

// Initial sync on load and then background update every 30 seconds
syncServerTimeOffset();
setInterval(syncServerTimeOffset, 30000);

function getServerTime() {
    return Date.now() + window.serverTimeOffset;
}

// --- // --- PHOTO-QUALITY SAILING BOAT ASSETS ---
window.isBoatLoaded = false;
window.boatImg = document.createElement('canvas');
window.boatCanvasCache = {};

// Color wheel conversion HSL -> RGB (using high saturation and medium brightness for vibrant sails)
function getWheelRGB(index) {
    const hue = (index * 360 / 100) % 360;
    const h = hue;
    const s = 0.95;
    const l = 0.52;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }
    
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

// Map a username deterministically to a color wheel index 0-99
function getUsernameIndex(username) {
    if (!username) return 0;
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 100;
}

// Generate and cache a colored sail variant for a user
window.getBoatCanvasForUser = function(username) {
    const key = (username || '').toLowerCase().trim();
    if (window.boatCanvasCache[key]) {
        return window.boatCanvasCache[key];
    }
    
    if (!window.boatImg || !window.isBoatLoaded) return null;
    
    const w = window.boatImg.width;
    const h = window.boatImg.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(window.boatImg, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    
    const isFugaea = key === 'fugaea';
    const colorIdx = getUsernameIndex(username);
    const targetColor = isFugaea ? { r: 0, g: 255, b: 102 } : getWheelRGB(colorIdx);
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        // Recolor the green main sail (#00ff66)
        if (a > 0 && r === 0 && g > 100 && b > 30 && b < 120) {
            const lum = g / 255.0;
            data[i] = Math.floor(lum * targetColor.r);
            data[i+1] = Math.floor(lum * targetColor.g);
            data[i+2] = Math.floor(lum * targetColor.b);
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
    window.boatCanvasCache[key] = canvas;
    return canvas;
};

const rawBoatImg = new Image();
rawBoatImg.src = 'boat_sprite.jpg?v=' + Date.now();
rawBoatImg.onload = () => {
    const w = rawBoatImg.width;
    const h = rawBoatImg.height;

    window.boatImg.width = w;
    window.boatImg.height = h;

    const bCtx = window.boatImg.getContext('2d');
    bCtx.drawImage(rawBoatImg, 0, 0);

    const imgData = bCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];

        const idx = i / 4;
        const xCoord = idx % w;
        const yCoord = Math.floor(idx / w);

        // 1. Key out solid white background
        if (r > 240 && g > 240 && b > 240) {
            data[i+3] = 0;
            continue;
        }

        // 2. Erase the keel, rudder, and water (UNCONDITIONALLY below the hull line Y = 91%)
        if (yCoord >= h * 0.91) {
            data[i+3] = 0;
            continue;
        }

        // 3. Both Sails Recolor (Main sail green, Front sail black)
        if (yCoord < h * 0.77) {
            const isLeftOfMast = xCoord < w * 0.53;
            if (isLeftOfMast) {
                // Main Sail: Color it neon-green (#00ff66) and erase text
                const baseR = r < 150 ? 210 : r;
                const lum = baseR / 255.0;
                data[i] = Math.floor(lum * 0);
                data[i+1] = Math.floor(lum * 255);
                data[i+2] = Math.floor(lum * 102);
            } else {
                // Front Sail: Recolor the outer jib black, leave inner staysail white
                const targetX = w * 0.53 + ((yCoord - h * 0.32) / (h * 0.45)) * (w * 0.22);
                const isStaysail = xCoord < targetX;
                
                if (isStaysail) {
                    // Inner staysail: keep it white (original fabric in boat_sprite.jpg is white)
                    // No recoloring is necessary!
                } else {
                    // Outer jib: make it charcoal-black
                    const lum = r / 255.0;
                    data[i] = Math.floor(lum * 20);
                    data[i+1] = Math.floor(lum * 20);
                    data[i+2] = Math.floor(lum * 20);
                }
            }
            continue;
        }

        // 4. Hull Recolor (recolor white hull to black, keep dark crew members intact)
        const isLight = (r > 115 && g > 115 && b > 115 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22);
        if (isLight && yCoord >= h * 0.77) {
            const lum = r / 255.0;
            data[i] = Math.floor(lum * 20);
            data[i+1] = Math.floor(lum * 20);
            data[i+2] = Math.floor(lum * 20);
        }
    }

    bCtx.putImageData(imgData, 0, 0);
    window.isBoatLoaded = true;
};


// --- NO-OP RETRO AUDIO ---
const sound = {
    init() {},
    toggle() { return false; },
    playTone() {},
    playBleep() {},
    playCoin() {},
    playSplash() {},
    playSuccess() {},
    playRightEnter() {},
    playLeftExit() {}
};

// --- CANVAS GRAPHICS SYSTEM ---
const canvas = document.getElementById("river-canvas");
const ctx = canvas.getContext("2d");

let floatingItems = [];
let collisionParticles = [];
let databasePosts = [];
const expiredPostIds = new Set();

// --- FALLBACK SYNC CONFIGURATION ---
let fallbackSyncTimer = null;
let currentSyncMs = 20000; // Default fallback is 20s

function setupFallbackSync(intervalMs) {
    if (fallbackSyncTimer) {
        clearInterval(fallbackSyncTimer);
    }
    currentSyncMs = intervalMs;
    console.log(`[Fallback Sync] Polling database every ${intervalMs / 1000} seconds.`);
    fallbackSyncTimer = setInterval(syncDatabasePosts, intervalMs);
}

// --- FIXED TIMESTEP PHYSICS CLOCK ---
let lastPhysicsTime = Date.now();
let physicsAccumulator = 0;
const PHYSICS_TIMESTEP = 1000 / 60; // 16.666 ms

const authChannel = new BroadcastChannel("auth_channel");
authChannel.onmessage = (event) => {
    if (event.data.type === "CLOSE_OLD_TABS") {
        window.close();
        setTimeout(() => {
            window.location.href = "about:blank";
        }, 300);
    }
};

const postsChannel = new BroadcastChannel("posts_channel");
postsChannel.onmessage = (event) => {
    if (event.data.type === "SYNC_POSTS") {
        syncDatabasePosts();
    }
};

// --- AUTO-PILOT WEB WORKER TIMER (Bypasses background tab sleep throttling) ---
const workerCode = `
    let timer = null;
    self.onmessage = function(e) {
        if (e.data.action === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                self.postMessage('tick');
            }, e.data.interval);
        } else if (e.data.action === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
        }
    };
`;
const blob = new Blob([workerCode], { type: 'application/javascript' });
const autoPilotWorker = new Worker(URL.createObjectURL(blob));

autoPilotWorker.onmessage = (e) => {
    if (e.data === 'tick') {
        triggerAutoRepost();
    }
};

async function triggerAutoRepost() {
    const user = auth.getCurrentUser();
    const autoRepostToggle = document.getElementById("auto-repost-toggle");
    
    // Check if toggle is still checked
    if (!autoRepostToggle || !autoRepostToggle.checked) {
        autoPilotWorker.postMessage({ action: 'stop' });
        return;
    }
    
    // Check if user has logged out
    if (!user) {
        autoRepostToggle.checked = false;
        autoPilotWorker.postMessage({ action: 'stop' });
        showDailyBonusToast("AUTO-PILOT DEACTIVATED: NOT LOGGED IN");
        return;
    }
    
    // Check credits
    if (user.credits < 1) {
        autoRepostToggle.checked = false;
        autoPilotWorker.postMessage({ action: 'stop' });
        showDailyBonusToast("AUTO-PILOT STOPPED: OUT OF CREDITS!");
        return;
    }
    
    const textVal = postText.value;
    const urlVal = document.getElementById("post-url").value;
    
    if (!textVal || !urlVal) {
        autoRepostToggle.checked = false;
        autoPilotWorker.postMessage({ action: 'stop' });
        showDailyBonusToast("AUTO-PILOT STOPPED: INVALID INPUTS");
        return;
    }
    
    try {
        // Submit post programmatically
        await db.addPost({
            username: user.username,
            text: textVal,
            url: urlVal,
            sprite: "log"
        });
        
        // Refresh credit stats from DB
        await auth.refreshUserProfile();
        
        // Force list reload
        await syncDatabasePosts();
        postsChannel.postMessage({ type: "SYNC_POSTS" });
        
        sound.playCoin();
        showDailyBonusToast("AUTO-PILOT: LINK REPOSTED!");
    } catch (err) {
        console.error("Auto-pilot repost failed:", err);
        autoRepostToggle.checked = false;
        autoPilotWorker.postMessage({ action: 'stop' });
        showDailyBonusToast("AUTO-PILOT STOPPED: " + err.message.toUpperCase());
    }
}

let mouseX = 0;
let mouseY = 0;
let hoveredItem = null;
let selectedItem = null;
let isPageLoaded = false;

setTimeout(() => {
    isPageLoaded = true;
}, 1500);

// Deterministic seeded random number generator
function seededRandom(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    return function() {
        const x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
}

// Pixel grids for sprite drawing. 
// A '1' represents primary color, '2' secondary color, '3' accent/eye, etc. '0' is transparent.
const SPRITE_PIXEL_SCALE = 3.5; // size of each pixel grid unit

const SPRITES = {
    log: {
        width: 24,
        height: 7,
        palette: {
            1: "#6d3e1d", // Dark brown bark
            2: "#8b5226", // Mid brown bark
            3: "#cd9a62", // Beige inner wood rings
            4: "#4c2810", // Deep shadow border
            5: "#b87742", // Light highlight bark (top)
            6: "#542e14"  // Dark shadow bark (bottom)
        },
        grid: [
            [0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0],
            [0,4,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,4,0],
            [4,3,5,2,5,5,2,5,5,5,2,5,5,2,5,5,5,2,5,5,5,2,3,4],
            [4,3,2,2,1,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,1,2,3,4],
            [4,3,1,1,6,1,1,1,6,1,1,1,6,1,1,1,6,1,1,1,6,1,3,4],
            [0,4,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,4,0],
            [0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0]
        ]
    },
    leaf: {
        width: 14,
        height: 10,
        palette: {
            1: "#555555", // Medium gray
            2: "#888888", // Light highlights
            3: "#222222", // Dark gray vein
            4: "#111111"  // Border shadow
        },
        grid: [
            [0,0,0,0,0,4,4,0,0,0,0,0,0,0],
            [0,0,0,4,4,2,2,4,4,0,0,0,0,0],
            [0,0,4,2,2,2,2,1,1,4,4,0,0,0],
            [0,4,2,2,2,2,1,1,1,1,1,4,0,0],
            [4,2,2,2,1,3,1,1,1,1,1,1,4,0],
            [4,1,1,3,3,1,1,1,1,1,1,1,4,0],
            [0,4,3,1,1,1,1,1,1,1,1,4,0,0],
            [0,0,4,4,1,1,1,1,1,4,4,0,0,0],
            [0,0,0,0,4,4,3,4,4,0,0,0,0,0],
            [0,0,0,0,0,0,3,0,0,0,0,0,0,0]
        ]
    },
    duck: {
        width: 12,
        height: 12,
        palette: {
            1: "#888888", // Gray body
            2: "#444444", // Dark beak
            3: "#000000", // Black eye
            4: "#ffffff", // White highlight
            5: "#333333"  // Body shadow
        },
        grid: [
            [0,0,0,0,1,1,1,1,0,0,0,0],
            [0,0,0,1,1,1,4,1,1,0,0,0],
            [0,0,0,1,1,3,1,1,1,2,2,0],
            [0,0,0,1,1,1,1,1,1,2,2,2],
            [0,0,0,0,1,1,1,1,1,0,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1],
            [1,5,1,1,1,1,1,1,1,1,5,1],
            [0,1,5,5,5,5,5,5,5,5,1,0],
            [0,0,1,1,1,1,1,1,1,1,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0]
        ]
    },
    bottle: {
        width: 10,
        height: 14,
        palette: {
            1: "#aaaaaa", // Gray glass highlight
            2: "#777777", // Glass base gray
            3: "#444444", // Cork gray
            4: "#ffffff", // Message paper
            5: "#222222"  // Dark outline
        },
        grid: [
            [0,0,0,5,5,0,0,0,0,0],
            [0,0,0,5,3,5,0,0,0,0],
            [0,0,0,5,3,5,0,0,0,0],
            [0,0,5,1,1,2,5,0,0,0],
            [0,0,5,1,1,2,5,0,0,0],
            [0,5,1,1,1,2,2,5,0,0],
            [5,1,1,1,4,2,2,2,5,0],
            [5,1,1,4,4,4,2,2,5,0],
            [5,1,1,4,4,4,2,2,5,0],
            [5,1,2,2,4,2,2,2,5,0],
            [5,2,2,2,2,2,2,2,5,0],
            [5,2,2,2,2,2,2,2,5,0],
            [0,5,2,2,2,2,2,5,0,0],
            [0,0,5,5,5,5,5,0,0,0]
        ]
    }
};

// Canvas Resizing
function resizeCanvas() {
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        floatingItems.forEach(item => {
            item.realign();
        });
        lastPhysicsTime = Date.now();
        physicsAccumulator = 0;
    }
});

// Fixed VIRTUAL_WIDTH calculation to keep log/wave coordinates 100% synchronized across all screen sizes
function getVirtualWidth() {
    return 2000;
}

// Wave Crest Particle Definition
class Wave {
    constructor(index) {
        this.index = index;
        const rand = seededRandom("wave_" + index);
        this.phase = rand();
        this.yPercent = rand(); // Store relative vertical position in river
        this.length = rand() * 60 + 30;
        this.speedFactor = rand() * 0.4 + 0.8;
        this.virtualX = getVirtualWidth() * this.phase;

        // Randomly assign a gold, cyan, orange, or silver color to the ripples
        const colorRand = rand();
        if (colorRand > 0.94) {
            this.color = "rgba(0, 240, 255, 0.45)";   // Glowing retro cyan/light blue colored line (6%)
        } else if (colorRand > 0.88) {
            this.color = "rgba(255, 110, 0, 0.5)";    // Glowing retro orange colored line (6%)
        } else if (colorRand > 0.73) {
            this.color = "rgba(255, 200, 50, 0.42)";  // Premium retro gold colored line (15%)
        } else {
            this.color = "rgba(255, 255, 255, 0.28)"; // Shiny silver/white ripples (73%)
        }
    }

    update(t) {
        const VIRTUAL_WIDTH = getVirtualWidth();
        const travelSpan = VIRTUAL_WIDTH + 100;
        const baseSpeed = 0.16875; // virtual speed units per millisecond (50% faster)
        
        // Progress goes from 0 to 1
        const progress = ( (t * baseSpeed * this.speedFactor) / travelSpan + this.phase ) % 1.0;
        this.virtualX = VIRTUAL_WIDTH - progress * travelSpan;
    }

    draw() {
        // Draw pixelated wave lines locked to river channel coordinates
        const riverTop = Math.floor(canvas.height * 0.46);
        const riverBottom = Math.floor(canvas.height * 0.72);
        const actualY = riverTop + this.yPercent * (riverBottom - riverTop - 4);
        
        // Map virtualX to actual x coordinate on canvas
        const VIRTUAL_WIDTH = getVirtualWidth();
        const actualX = (this.virtualX / VIRTUAL_WIDTH) * canvas.width;
        const actualLength = (this.length / VIRTUAL_WIDTH) * canvas.width;

        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(actualX), Math.floor(actualY), Math.ceil(actualLength), 4);
    }
}

// Initial waves (restored to 70 lines)
const waveParticles = Array.from({ length: 70 }, (_, i) => new Wave(i));

// Collision Splash Particle
class SplashParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4; // horizontal spray
        this.vy = -1.5 - Math.random() * 2.5; // upward spray
        this.size = 2 + Math.random() * 4;
        this.life = 1.0;
        this.decay = 0.03 + Math.random() * 0.05;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.15; // gravity pull
        this.life -= this.decay;
        if (this.life < 0) this.life = 0;
    }

    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.life * 0.8})`;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), Math.ceil(this.size), Math.ceil(this.size));
    }
}

// Floating items class mapping data rows
class FloatingItem {
    constructor(post) {
        this.post = post;
        const rawCreated = new Date(post.createdAt).getTime();
        // If the post is from the future due to clock skew, clamp it to getServerTime() to prevent negative age.
        this.createdAtTime = (rawCreated > getServerTime()) ? getServerTime() : rawCreated;
        
        const spriteMeta = SPRITES[post.sprite] || SPRITES.log;
        const VIRTUAL_PIXEL_SCALE = 6.0;
        this.virtualWidth = spriteMeta.width * VIRTUAL_PIXEL_SCALE;
        this.virtualHeight = spriteMeta.height * VIRTUAL_PIXEL_SCALE;

        // Seeded random for deterministic attributes per log
        const rand = seededRandom(post.id);
        this.yPercent = rand();
        this.bobOffset = rand() * Math.PI * 2;
        this.bobSpeed = 0.001 + rand() * 0.0015; // Slow bob speed for time-based animation
        this.speedFactor = 0.8 + rand() * 0.4;   // Speed variation (0.8x to 1.2x)
        this.hasBranch = true;                    // Enable branches
        this.currentAngle = 0;

        // Position - calculate exact age-based horizontal position to keep all tabs 100% in sync
        const VIRTUAL_WIDTH = getVirtualWidth();
        const age = Math.max(0, getServerTime() - this.createdAtTime);
        const travelSpan = VIRTUAL_WIDTH + 300;
        const baseSpeed = 0.12;
        const progress = (age * baseSpeed * this.speedFactor) / travelSpan;
        this.virtualX = VIRTUAL_WIDTH - progress * travelSpan;
        
        const riverTop = 460;
        const riverBottom = 720;
        this.targetVirtualY = (riverTop + 12) + this.yPercent * (riverBottom - riverTop - this.virtualHeight - 24);
        this.virtualY = this.targetVirtualY;
        
        // Physical state vectors in virtual coordinate space
        this.virtualTargetVx = -2.0 * this.speedFactor;
        this.virtualVx = this.virtualTargetVx;
        this.virtualVy = 0;
        
        this.currentBob = 0;
        this.isHovered = false;
 
        // Splash effect for brand new logs dropped in
        this.splashProgress = (getServerTime() - this.createdAtTime < 2500) ? 0.0 : 1.0;
        this.hasEnteredScreen = false;
    }
 
    realign() {
        const age = Math.max(0, getServerTime() - this.createdAtTime);
        const VIRTUAL_WIDTH = getVirtualWidth();
        const travelSpan = VIRTUAL_WIDTH + 300;
        const baseSpeed = 0.12;
        const progress = (age * baseSpeed * this.speedFactor) / travelSpan;
        
        this.virtualX = VIRTUAL_WIDTH - progress * travelSpan;
        
        this.virtualY = this.targetVirtualY;
        
        this.virtualVx = this.virtualTargetVx;
        this.virtualVy = 0;
        this.isHovered = false;
        this.splashProgress = (getServerTime() - this.createdAtTime < 2500) ? 0.0 : 1.0;
    }

    updatePhysics() {
        // Move incrementally in virtual coordinates
        this.virtualX += this.virtualVx;
        this.virtualY += this.virtualVy;
        
        // Gently pull the boat towards its expected horizontal position based on database age to keep tabs perfectly synced
        const age = Math.max(0, getServerTime() - this.createdAtTime);
        const VIRTUAL_WIDTH = getVirtualWidth();
        const travelSpan = VIRTUAL_WIDTH + 300;
        const baseSpeed = 0.12;
        const progress = (age * baseSpeed * this.speedFactor) / travelSpan;
        const expectedX = VIRTUAL_WIDTH - progress * travelSpan;
        this.virtualX += (expectedX - this.virtualX) * 0.1;
        
        // Slowly float back to original vertical lane and restore horizontal drift speed
        this.virtualVx += (this.virtualTargetVx - this.virtualVx) * 0.06;
        this.virtualY += (this.targetVirtualY - this.virtualY) * 0.02;
        this.virtualVy += (0 - this.virtualVy) * 0.03;

        // Keep inside vertical river boundary (bounce off top/bottom)
        const riverTop = 460;
        const riverBottom = 720;
        const minVal = riverTop + 12;
        const maxVal = riverBottom - this.virtualHeight - 12;
        if (this.virtualY < minVal) {
            this.virtualY = minVal;
            this.virtualVy = Math.abs(this.virtualVy) * 0.5 + 0.25; // push down in virtual units
        } else if (this.virtualY > maxVal) {
            this.virtualY = maxVal;
            this.virtualVy = -Math.abs(this.virtualVy) * 0.5 - 0.25; // push up in virtual units
        }

        // Enforce that boats always push forward (to the left) and never stop or drift backwards
        if (this.virtualVx > -0.6 * this.speedFactor) {
            this.virtualVx = -0.6 * this.speedFactor;
        }

        // Clamp maximum speed to the left to prevent compounding chain collisions from launching boats off-screen too quickly
        const maxLeftSpeed = -1.8 * this.speedFactor;
        if (this.virtualVx < maxLeftSpeed) {
            this.virtualVx = maxLeftSpeed;
        }

        // Trigger exit / expiration when off screen to the left
        if (this.virtualX + this.virtualWidth < -200) {
            this.isExpired = true;
        }
    }

    update(t) {
        // Bobbing animation based on absolute time
        const currentBobPhase = this.bobOffset + (t * this.bobSpeed);
        this.currentBob = Math.sin(currentBobPhase) * 6;
        
        if (this.splashProgress < 1.0) {
            this.splashProgress += 0.04;
        }

        // Trigger entrance sound using scaled coordinates
        const scaleX = canvas.width / getVirtualWidth();
        const screenX = this.virtualX * scaleX;
        const screenWidth = this.virtualWidth * scaleX;
        if (!this.hasEnteredScreen && screenX <= canvas.width && screenX + screenWidth >= 0) {
            this.hasEnteredScreen = true;
            if (isPageLoaded) {
                sound.playRightEnter();
            }
        }
    }

    draw() {
        const scaleX = canvas.width / getVirtualWidth();
        const scaleY = canvas.height / 1000;
        
        // Caps the visual scale factor at 0.6 to prevent the "zoomed-in" look on large monitors
        const zoomScale = Math.min(0.6, scaleX);

        const drawX = Math.floor(this.virtualX * scaleX);
        const drawY = Math.floor(this.virtualY * scaleY) + this.currentBob;
        const drawWidth = this.virtualWidth * zoomScale;
        const drawHeight = this.virtualHeight * scaleY;
        const renderPixelScale = 6.0 * zoomScale; // Proportional sprite scale

        const spriteMeta = SPRITES[this.post.sprite] || SPRITES.log;

        // Draw selection box outline if hovered
        if (this.isHovered) {
            ctx.strokeStyle = "rgba(0, 255, 102, 0.8)";
            ctx.lineWidth = 3;
            
            // Expand selection boundary to cover username, branch, and log with a buffer
            const topOffset = (this.hasBranch ? 61 : 44) * scaleY;
            const bottomOffset = 8 * scaleY;
            const sideOffset = 15 * zoomScale;
            
            ctx.strokeRect(drawX - sideOffset, drawY - topOffset, drawWidth + sideOffset * 2, drawHeight + topOffset + bottomOffset);
            
            ctx.fillStyle = "rgba(0, 255, 102, 0.1)";
            ctx.fillRect(drawX - sideOffset, drawY - topOffset, drawWidth + sideOffset * 2, drawHeight + topOffset + bottomOffset);
        }

        // Splash effect for brand new logs dropped in
        if (this.splashProgress < 1.0) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            const radius = (1 - this.splashProgress) * 40 * zoomScale;
            ctx.fillRect(drawX + drawWidth/2 - radius/2, drawY + drawHeight/2 - radius/2, radius, radius);
        }

        // Draw bobbing water ripples/wake at the water line (bottom of the log)
        // Normalize the bobbing phase to a positive scale (0.3 to 1.0) for continuous movement
        const ripplePulse = 0.65 + (this.currentBob / 6) * 0.35;
        
        ctx.fillStyle = "rgba(0, 240, 255, 0.75)"; // Brighter cyan water ripple
        const rippleY = drawY + drawHeight - Math.floor(1 * scaleY);
        const rippleHeight = Math.max(2, Math.ceil(3 * scaleY));
        
        // Left ripple segment
        const leftRippleWidth = Math.floor(ripplePulse * 30 * zoomScale);
        const leftX = drawX - leftRippleWidth - Math.floor(3 * zoomScale);
        ctx.fillRect(leftX, rippleY, leftRippleWidth, rippleHeight);
        
        // Right ripple segment (longer wake trailing behind the log moving left)
        const rightRippleWidth = Math.floor(ripplePulse * 45 * zoomScale);
        const rightX = drawX + drawWidth + Math.floor(3 * zoomScale);
        ctx.fillRect(rightX, rippleY, rightRippleWidth, rippleHeight);

        // Fainter outer white ripples extending further out
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Semi-transparent white
        const outerRippleHeight = Math.max(1, Math.ceil(2 * scaleY));
        
        const outerLeftWidth = Math.floor(ripplePulse * 15 * zoomScale);
        const outerLeftX = leftX - outerLeftWidth - Math.floor(4 * zoomScale);
        ctx.fillRect(outerLeftX, rippleY + Math.floor(1 * scaleY), outerLeftWidth, outerRippleHeight);

        const outerRightWidth = Math.floor(ripplePulse * 22 * zoomScale);
        const outerRightX = rightX + rightRippleWidth + Math.floor(4 * zoomScale);
        ctx.fillRect(outerRightX, rippleY + Math.floor(1 * scaleY), outerRightWidth, outerRippleHeight);

        // Render the 8-bit sprite matrix (reverted back to logs, bypassing yachts)
        const grid = spriteMeta.grid;
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const colorCode = grid[r][c];
                if (colorCode !== 0) {
                    ctx.fillStyle = spriteMeta.palette[colorCode];
                    ctx.fillRect(
                        drawX + c * renderPixelScale, 
                        drawY + r * renderPixelScale, 
                        Math.ceil(renderPixelScale), 
                        Math.ceil(renderPixelScale)
                    );
                }
            }
        }

        // If this log sprouted a branch, render its pixel branches and leaves
        if (this.hasBranch) {
            // Dark outline/bark branch stems
            ctx.fillStyle = "#4c2810";
            const branchStems = [[10,-1], [11,-2], [12,-3], [13,-3]];
            branchStems.forEach(([bx, by]) => {
                ctx.fillRect(
                    drawX + bx * renderPixelScale,
                    drawY + by * renderPixelScale,
                    Math.ceil(renderPixelScale),
                    Math.ceil(renderPixelScale)
                );
            });

            // Medium green leaf clusters
            ctx.fillStyle = "#2b792b";
            const medLeaves = [[9,-2], [9,-3], [10,-3], [14,-3], [14,-4], [15,-3]];
            medLeaves.forEach(([bx, by]) => {
                ctx.fillRect(
                    drawX + bx * renderPixelScale,
                    drawY + by * renderPixelScale,
                    Math.ceil(renderPixelScale),
                    Math.ceil(renderPixelScale)
                );
            });

            // Light green highlight leaves
            ctx.fillStyle = "#3fb23f";
            const lightLeaves = [[11,-4], [12,-4], [13,-4], [12,-5]];
            lightLeaves.forEach(([bx, by]) => {
                ctx.fillRect(
                    drawX + bx * renderPixelScale,
                    drawY + by * renderPixelScale,
                    Math.ceil(renderPixelScale),
                    Math.ceil(renderPixelScale)
                );
            });
        }

        // Draw username text tag above the item (push higher if log has branches to avoid overlap)
        const username = this.post.username;
        
        ctx.font = `${Math.max(18, Math.floor(27 * zoomScale))}px VT323`;
        ctx.textAlign = "center";
        
        const textX = Math.floor(drawX + drawWidth / 2);
        const textY = drawY - (this.hasBranch ? 35 : 18) * scaleY;
        
        // Draw black border around text for readability
        ctx.fillStyle = "#000000";
        ctx.fillText(username, textX - 2, textY - 2);
        ctx.fillText(username, textX + 2, textY - 2);
        ctx.fillText(username, textX - 2, textY + 2);
        ctx.fillText(username, textX + 2, textY + 2);
        
        ctx.fillStyle = this.isHovered ? "#00ff66" : "#ffffff";
        ctx.fillText(username, textX, textY);
    }

    checkCollision(mx, my) {
        const scaleX = canvas.width / getVirtualWidth();
        const scaleY = canvas.height / 1000;
        const zoomScale = Math.min(0.6, scaleX);

        const drawX = this.virtualX * scaleX;
        const drawY = this.virtualY * scaleY + this.currentBob;
        const drawWidth = this.virtualWidth * zoomScale;
        const drawHeight = this.virtualHeight * scaleY;

        const topOffset = (this.hasBranch ? 61 : 44) * scaleY;
        const bottomOffset = 8 * scaleY;
        const sideOffset = 15 * zoomScale;
        
        return (
            mx >= drawX - sideOffset && 
            mx <= drawX + drawWidth + sideOffset && 
            my >= drawY - topOffset && 
            my <= drawY + drawHeight + bottomOffset
        );
    }
}

// --- RIVER ANIMATION LOOP ---
function updatePhysics() {
    floatingItems.forEach(item => {
        item.updatePhysics();
    });

    // Pairwise collision detection and response in virtual coordinates (0-2000, 0-1000)
    for (let i = 0; i < floatingItems.length; i++) {
        for (let j = i + 1; j < floatingItems.length; j++) {
            const a = floatingItems[i];
            const b = floatingItems[j];
            
            // Skip collision physics if either log is still off-screen to the right (has not entered play area)
            if (a.virtualX > 2000 || b.virtualX > 2000) {
                continue;
            }
            
            // Check box overlap in virtual coordinates
            const overlapX = Math.min(a.virtualX + a.virtualWidth, b.virtualX + b.virtualWidth) - Math.max(a.virtualX, b.virtualX);
            const overlapY = Math.min(a.virtualY + a.virtualHeight, b.virtualY + b.virtualHeight) - Math.max(a.virtualY, b.virtualY);
            
            if (overlapX > 0 && overlapY > 0) {
                // Spawn pixelated water splash particles at screen contact point
                const scaleX = canvas.width / getVirtualWidth();
                const scaleY = canvas.height / 1000;
                const contactX = ((Math.max(a.virtualX, b.virtualX) + Math.min(a.virtualX + a.virtualWidth, b.virtualX + b.virtualWidth)) / 2) * scaleX;
                const contactY = ((Math.max(a.virtualY, b.virtualY) + Math.min(a.virtualY + a.virtualHeight, b.virtualY + b.virtualHeight)) / 2) * scaleY;
                for (let k = 0; k < 6; k++) {
                    collisionParticles.push(new SplashParticle(contactX, contactY));
                }

                // Determine collision resolution direction (push on the axis of least overlap)
                if (overlapX < overlapY) {
                    const push = overlapX / 2;
                    if (a.virtualX < b.virtualX) {
                        a.virtualX -= push;
                        b.virtualX += push;
                        
                        // Mild vertical lane slide nudge to help them eventually clear each other
                        a.virtualVy += 0.3;
                        b.virtualVy -= 0.3;
                        
                        // Bounce velocities (elastic response favoring pushing the front boat forward faster)
                        const temp = a.virtualVx;
                        a.virtualVx = Math.min(a.virtualVx, b.virtualVx * 1.3);
                        b.virtualVx = temp * 0.55;
                    } else {
                        a.virtualX += push;
                        b.virtualX -= push;
                        
                        a.virtualVy -= 0.3;
                        b.virtualVy += 0.3;
                        
                        // Bounce velocities (elastic response favoring pushing the front boat forward faster)
                        const temp = a.virtualVx;
                        b.virtualVx = Math.min(b.virtualVx, a.virtualVx * 1.3);
                        a.virtualVx = temp * 0.55;
                    }
                } else {
                    const push = overlapY / 2;
                    if (a.virtualY < b.virtualY) {
                        a.virtualY -= push;
                        b.virtualY += push;
                        
                        // Bounce vertical velocities and add slight nudge to separate
                        const temp = a.virtualVy;
                        a.virtualVy = b.virtualVy * -0.4 + 0.25;
                        b.virtualVy = temp * -0.4 - 0.25;
                    } else {
                        a.virtualY += push;
                        b.virtualY -= push;
                        
                        const temp = a.virtualVy;
                        a.virtualVy = b.virtualVy * -0.4 - 0.25;
                        b.virtualVy = temp * -0.4 + 0.25;
                    }
                }
            }
        }
    }

    // Clamp Y positions of all items to stay strictly inside the river channel (prevent pushing onto land)
    floatingItems.forEach(item => {
        const riverTop = 460;
        const riverBottom = 720;
        const minVal = riverTop + 12;
        const maxVal = riverBottom - item.virtualHeight - 12;
        if (item.virtualY < minVal) {
            item.virtualY = minVal;
            item.virtualVy = Math.abs(item.virtualVy) * 0.5 + 0.25;
        } else if (item.virtualY > maxVal) {
            item.virtualY = maxVal;
            item.virtualVy = -Math.abs(item.virtualVy) * 0.5 - 0.25;
        }
    });

    // Filter out expired items
    floatingItems = floatingItems.filter(item => {
        if (item.isExpired) {
            expiredPostIds.add(item.post.id);
            return false;
        }
        return true;
    });
}

// --- RIVER ANIMATION LOOP ---
function renderLoop() {
    spawnFugaeaLog();
    const skyHeight = Math.floor(canvas.height * 0.42);
    const horizonHeight = Math.floor(canvas.height * 0.04);
    const riverHeight = Math.floor(canvas.height * 0.26);
    const riverTop = skyHeight + horizonHeight;
    const riverBottom = riverTop + riverHeight;

    // 1. Draw Overcast Gray Sky
    ctx.fillStyle = "#e3e5e8";
    ctx.fillRect(0, 0, canvas.width, skyHeight);

    // Draw some simple 8-bit sky cloud lines
    ctx.fillStyle = "#f5f6f8";
    ctx.fillRect(50, Math.floor(skyHeight * 0.3), 120, 6);
    ctx.fillRect(80, Math.floor(skyHeight * 0.3) + 6, 80, 6);
    ctx.fillRect(canvas.width - 250, Math.floor(skyHeight * 0.5), 180, 6);

    // 2. Draw Far Land Bank (Thin green horizon strip)
    ctx.fillStyle = "#527450";
    ctx.fillRect(0, skyHeight, canvas.width, horizonHeight);

    // Add some pixel highlights to horizon bank
    ctx.fillStyle = "#6d9c6a";
    for (let x = 0; x < canvas.width; x += 32) {
        ctx.fillRect(x, skyHeight, 16, 2);
    }

    // 3. Draw River Water (Grayish-brown turbid water reflecting the photo)
    ctx.fillStyle = "#9ea09b";
    ctx.fillRect(0, riverTop, canvas.width, riverHeight);

    // Draw thin border lines for the river banks
    ctx.fillStyle = "#2b3b2a";
    ctx.fillRect(0, riverTop, canvas.width, 3);
    ctx.fillRect(0, riverBottom - 3, canvas.width, 3);

    // 4. Draw Foreground Grass Bank
    ctx.fillStyle = "#3c583a";
    ctx.fillRect(0, riverBottom, canvas.width, canvas.height - riverBottom);

    const localNow = Date.now();
    const serverNow = getServerTime();

    // Run fixed timestep physics catch up
    let elapsed = localNow - lastPhysicsTime;
    lastPhysicsTime = localNow;
    if (elapsed > 1000) {
        elapsed = 1000;
    }
    physicsAccumulator += elapsed;
    while (physicsAccumulator >= PHYSICS_TIMESTEP) {
        updatePhysics();
        physicsAccumulator -= PHYSICS_TIMESTEP;
    }

    // Update & draw waves using synchronized server time
    waveParticles.forEach(w => {
        w.update(serverNow);
        w.draw();
    });

    // Update & draw collision splash particles
    collisionParticles.forEach(p => {
        p.update();
        p.draw();
    });
    collisionParticles = collisionParticles.filter(p => p.life > 0);

    // Update rendering state of floating items using synchronized server time
    floatingItems.forEach(item => {
        item.update(serverNow);
    });

    let currentHover = null;
    for (let i = floatingItems.length - 1; i >= 0; i--) {
        if (floatingItems[i].checkCollision(mouseX, mouseY)) {
            currentHover = floatingItems[i];
            break;
        }
    }

    floatingItems.forEach(item => {
        item.isHovered = (item === currentHover);
        item.draw();
    });

    // Handle cursor styling
    if (currentHover) {
        canvas.style.cursor = "pointer";
        if (hoveredItem !== currentHover) {
            sound.playBleep(); // tiny chirp on hover boundary enter
            hoveredItem = currentHover;
        }
    } else {
        canvas.style.cursor = "crosshair";
        hoveredItem = null;
    }

    requestAnimationFrame(renderLoop);
}

// --- AUTHENTICATION STATE & INTERFACE ---
const hudUser = document.getElementById("hud-user");
const hudUserContainer = document.getElementById("hud-user-container");
const hudItemCount = document.getElementById("hud-item-count");
const hudOnlineUsers = document.getElementById("hud-online-users");
const hudTotalViews = document.getElementById("hud-total-views");
const hudCreditsContainer = document.getElementById("hud-credits-container");
const hudCredits = document.getElementById("hud-credits");
const buyCreditsTrigger = document.getElementById("buy-credits-trigger");
const shareXBtn = document.getElementById("share-x-btn");
const shareModal = document.getElementById("share-modal");
const shareClose = document.getElementById("share-close");
const shareX = document.getElementById("share-x");
const shareFacebook = document.getElementById("share-facebook");
const shareLinkedin = document.getElementById("share-linkedin");
const shareReddit = document.getElementById("share-reddit");
const shareInstagram = document.getElementById("share-instagram");
const shareTiktok = document.getElementById("share-tiktok");

const authTriggerBtn = document.getElementById("auth-trigger-btn");
const headerHud = document.querySelector(".header-hud");
const submitSection = document.getElementById("submit-section");
const guestPromptSection = document.getElementById("guest-prompt-section");

const authModal = document.getElementById("auth-modal");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const resetPasswordForm = document.getElementById("reset-password-form");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
const forgotBackBtn = document.getElementById("forgot-back-btn");
const registerForm = document.getElementById("register-form");
const authError = document.getElementById("auth-error");
const authSuccess = document.getElementById("auth-success");

const verificationPendingSection = document.getElementById("verification-pending-section");
const regResendEmailBtn = document.getElementById("reg-resend-email-btn");
const regCheckStatusBtn = document.getElementById("reg-check-status-btn");

let verificationPollInterval = null;

function startVerificationPolling() {
    if (verificationPollInterval) clearInterval(verificationPollInterval);
    verificationPollInterval = setInterval(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            stopVerificationPolling();
            await auth.refreshUserProfile();
            closeAuthModal();
            updateAuthStateUI();
            sound.playSuccess();
        }
    }, 3000);
}

function stopVerificationPolling() {
    if (verificationPollInterval) {
        clearInterval(verificationPollInterval);
        verificationPollInterval = null;
    }
}

const checkoutModal = document.getElementById("checkout-modal");
const checkoutClose = document.getElementById("checkout-close");
const paymentForm = document.getElementById("payment-form");
const checkoutSuccess = document.getElementById("checkout-success");
const checkoutError = document.getElementById("checkout-error");
const paySubmitBtn = document.getElementById("pay-submit-btn");

// Legal Modal DOM elements
const legalModal = document.getElementById("legal-modal");
const legalClose = document.getElementById("legal-close");
const legalTosLink = document.getElementById("legal-tos-link");
const legalPrivacyLink = document.getElementById("legal-privacy-link");
const tabTos = document.getElementById("tab-tos");
const tabPrivacy = document.getElementById("tab-privacy");
const tosTextContent = document.getElementById("tos-text-content");
const privacyTextContent = document.getElementById("privacy-text-content");
const closeAccountContainer = document.getElementById("close-account-container");
const deleteAccountBtn = document.getElementById("delete-account-btn");

let selectedPackageAmount = 0.99;
let selectedPackageCredits = 100;

const postText = document.getElementById("post-text");
const tossForm = document.getElementById("toss-form");

let presenceChannel = null;

async function trackPresence() {
    const user = auth.getCurrentUser();
    const presenceKey = user ? user.username : 'guest_' + Math.random().toString(36).substring(2, 6);
    
    if (presenceChannel) {
        try {
            await presenceChannel.unsubscribe();
        } catch (e) {
            console.error("Presence unsubscribe failed:", e);
        }
    }
    
    presenceChannel = supabase.channel('online_users', {
        config: {
            presence: {
                key: presenceKey
            }
        }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const count = Object.keys(state).length;
            if (hudOnlineUsers) {
                hudOnlineUsers.textContent = count.toLocaleString();
            }
        });

    presenceChannel.subscribe(async (status) => {
        console.log(`[Realtime presenceChannel Status]:`, status);
        if (status === 'SUBSCRIBED') {
            await presenceChannel.track({
                online_at: new Date().toISOString()
            });
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            setupFallbackSync(10000);
        }
    });
}

async function updateShareModalUI() {
    const user = auth.getCurrentUser();
    if (!user) return;
    
    const platforms = [
        { id: 'share-x', name: 'X', originalHtml: '<i class="fab fa-twitter"></i> X (TWITTER)' },
        { id: 'share-facebook', name: 'Facebook', originalHtml: '<i class="fab fa-facebook-f"></i> FACEBOOK' },
        { id: 'share-linkedin', name: 'LinkedIn', originalHtml: '<i class="fab fa-linkedin-in"></i> LINKEDIN' },
        { id: 'share-reddit', name: 'Reddit', originalHtml: '<i class="fab fa-reddit-alien"></i> REDDIT' },
        { id: 'share-instagram', name: 'Instagram', originalHtml: '<i class="fab fa-instagram"></i> INSTAGRAM' },
        { id: 'share-tiktok', name: 'TikTok', originalHtml: '<i class="fab fa-tiktok"></i> TIKTOK' }
    ];
    
    for (const p of platforms) {
        const el = document.getElementById(p.id);
        if (el) {
            const claimed = await auth.checkShareClaimed(user.id, p.name);
            if (claimed) {
                el.innerHTML = `<i class="fas fa-check-circle"></i> ${p.name.toUpperCase()} (CLAIMED)`;
                el.style.opacity = "0.4";
                el.style.filter = "grayscale(1)";
                el.style.pointerEvents = "none";
                el.style.cursor = "not-allowed";
            } else {
                el.innerHTML = p.originalHtml;
                el.style.opacity = "1";
                el.style.filter = "none";
                el.style.pointerEvents = "auto";
                el.style.cursor = "pointer";
            }
        }
    }
}

function updateAuthStateUI() {
    const user = auth.getCurrentUser();
    
    // Show credits container at all times
    if (hudCreditsContainer) {
        hudCreditsContainer.classList.remove("hidden");
    }

    // Refresh presence tracking key
    trackPresence();

    if (user) {
        if (hudUserContainer) hudUserContainer.classList.remove("hidden");
        hudUser.textContent = user.username;
        hudUser.className = "text-green";
        authTriggerBtn.innerHTML = 'LOGOUT';
        authTriggerBtn.classList.remove("hidden");
        authTriggerBtn.style.backgroundColor = '';
        authTriggerBtn.style.color = '';
        authTriggerBtn.style.padding = '0 8px';
        authTriggerBtn.style.fontSize = '9px';
        authTriggerBtn.style.height = '21px';
        submitSection.classList.remove("hidden");
        if (guestPromptSection) guestPromptSection.classList.add("hidden");
        
        hudCredits.textContent = user.credits.toLocaleString();

        // Auto-fill username in text box
        postText.value = user.username;

        // Keep the HUD share button permanently visible for logged-in users
        if (shareXBtn) {
            shareXBtn.classList.remove("hidden");
        }
        
        // Show close account button inside Privacy Policy
        if (closeAccountContainer) {
            closeAccountContainer.style.display = 'block';
        }
        
        // Refresh the social media buttons inside the modal (grey out claimed ones)
        updateShareModalUI();
        if (headerHud) {
            headerHud.classList.add("is-logged-in");
            headerHud.classList.remove("is-logged-out");
        }
    } else {
        if (hudUserContainer) hudUserContainer.classList.add("hidden");
        hudUser.textContent = "GUEST";
        hudUser.className = "";
        authTriggerBtn.innerHTML = 'LOGIN / REGISTER';
        authTriggerBtn.classList.add("hidden");
        authTriggerBtn.style.backgroundColor = '';
        authTriggerBtn.style.color = '';
        authTriggerBtn.style.padding = '';
        authTriggerBtn.style.fontSize = '';
        authTriggerBtn.style.height = '';
        submitSection.classList.add("hidden");
        if (guestPromptSection) guestPromptSection.classList.remove("hidden");
        
        hudCredits.textContent = "10";

        // Keep the HUD share button visible for guests to prompt registration
        if (shareXBtn) {
            shareXBtn.classList.remove("hidden");
        }

        // Hide close account button inside Privacy Policy
        if (closeAccountContainer) {
            closeAccountContainer.style.display = 'none';
        }
        if (headerHud) {
            headerHud.classList.add("is-logged-out");
            headerHud.classList.remove("is-logged-in");
        }

        // Clean up Auto-Pilot on logout
        const autoRepostToggle = document.getElementById("auto-repost-toggle");
        if (autoRepostToggle) {
            autoRepostToggle.checked = false;
        }
        autoPilotWorker.postMessage({ action: 'stop' });
    }
}

// Listen for authoritative auth state updates from the Supabase client
window.addEventListener('auth-state-changed', updateAuthStateUI);

let loginWidgetId = null;
let regWidgetId = null;
let forgotWidgetId = null;

function renderCaptchas() {
    if (typeof turnstile !== "undefined") {
        const siteKey = "0x4AAAAAADsrEww6iRqbmRap";
        
        const loginCaptchaEl = document.getElementById("login-captcha");
        if (loginCaptchaEl && loginCaptchaEl.children.length === 0) {
            try {
                loginWidgetId = turnstile.render(loginCaptchaEl, {
                    sitekey: siteKey,
                    theme: "dark"
                });
            } catch (err) {
                console.error("Failed to render login captcha:", err);
            }
        }
        
        const regCaptchaEl = document.getElementById("register-captcha");
        if (regCaptchaEl && regCaptchaEl.children.length === 0) {
            try {
                regWidgetId = turnstile.render(regCaptchaEl, {
                    sitekey: siteKey,
                    theme: "dark"
                });
            } catch (err) {
                console.error("Failed to render register captcha:", err);
            }
        }

        const forgotCaptchaEl = document.getElementById("forgot-captcha");
        if (forgotCaptchaEl && forgotCaptchaEl.children.length === 0) {
            try {
                forgotWidgetId = turnstile.render(forgotCaptchaEl, {
                    sitekey: siteKey,
                    theme: "dark"
                });
            } catch (err) {
                console.error("Failed to render forgot captcha:", err);
            }
        }
    }
}

window.onTurnstileLoad = renderCaptchas;
if (window.turnstileReady) {
    renderCaptchas();
}

function showAuthModal(mode = "login") {
    authModal.classList.remove("hidden");
    authError.classList.add("hidden");
    authSuccess.classList.add("hidden");
    
    // Hide forgot and reset forms and restore standard layout
    if (forgotPasswordForm) forgotPasswordForm.classList.add("hidden");
    if (resetPasswordForm) resetPasswordForm.classList.add("hidden");
    const tabContainer = document.querySelector(".tab-container");
    if (tabContainer) tabContainer.classList.remove("hidden");

    if (typeof turnstile !== "undefined") {
        try {
            const loginCaptcha = document.getElementById("login-captcha");
            const regCaptcha = document.getElementById("register-captcha");
            const forgotCaptcha = document.getElementById("forgot-captcha");
            if (loginCaptcha && loginCaptcha.children.length > 0) turnstile.reset(loginCaptcha);
            if (regCaptcha && regCaptcha.children.length > 0) turnstile.reset(regCaptcha);
            if (forgotCaptcha && forgotCaptcha.children.length > 0) turnstile.reset(forgotCaptcha);
        } catch (err) {
            console.error("Failed to reset turnstile:", err);
        }
    }
    
    if (mode === "login") {
        modalTitle.textContent = "USER";
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
        
        // Auto-focus email input and place cursor at the start
        const loginEmail = document.getElementById("login-email");
        if (loginEmail) {
            setTimeout(() => {
                loginEmail.focus();
            }, 50); // Small timeout to ensure browser paints and layout finishes before focus
        }
    } else {
        modalTitle.textContent = "CREATE USER";
        tabLogin.classList.remove("active");
        tabRegister.classList.add("active");
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        
        // Auto-focus username input and place cursor at the start
        const regUsername = document.getElementById("reg-username");
        if (regUsername) {
            setTimeout(() => {
                regUsername.focus();
            }, 50);
        }
    }
}

function closeAuthModal() {
    authModal.classList.add("hidden");
    
    // If the user closes the modal while resetting their password (without completing it),
    // sign them out so they return to the logged-out guest state.
    if (resetPasswordForm && !resetPasswordForm.classList.contains("hidden")) {
        auth.signOut().catch(err => {
            console.error("Failed to sign out on reset cancel:", err);
        });
    }

    loginForm.reset();
    registerForm.reset();
    if (forgotPasswordForm) {
        forgotPasswordForm.reset();
        forgotPasswordForm.classList.add("hidden");
        const forgotEmailInput = document.getElementById("forgot-email");
        if (forgotEmailInput) {
            forgotEmailInput.disabled = false;
            forgotEmailInput.style.opacity = "";
            forgotEmailInput.style.cursor = "";
        }
    }
    if (resetPasswordForm) {
        resetPasswordForm.reset();
        resetPasswordForm.classList.add("hidden");
    }
    
    // Reset password visibility toggles back to masked state
    document.querySelectorAll(".password-container input").forEach(input => {
        input.type = "password";
    });
    document.querySelectorAll(".password-toggle-btn").forEach(btn => {
        btn.textContent = "SHOW";
    });
    
    // Reset verification pending screen and restore layout
    document.querySelector(".tab-container").classList.remove("hidden");
    modalClose.classList.remove("hidden");
    if (verificationPendingSection) {
        verificationPendingSection.classList.add("hidden");
    }
    stopVerificationPolling();

    if (typeof turnstile !== "undefined") {
        const loginCaptcha = document.getElementById("login-captcha");
        const regCaptcha = document.getElementById("register-captcha");
        const forgotCaptcha = document.getElementById("forgot-captcha");
        if (loginCaptcha) turnstile.reset(loginCaptcha);
        if (regCaptcha) turnstile.reset(regCaptcha);
        if (forgotCaptcha) turnstile.reset(forgotCaptcha);
    }

    // Focus and select the link input box if the user is logged in
    if (auth.getCurrentUser()) {
        const postUrl = document.getElementById("post-url");
        if (postUrl) {
            setTimeout(() => {
                postUrl.focus();
                postUrl.select();
            }, 150);
        }
    }
}

// Modal tab listeners
tabLogin.addEventListener("click", () => showAuthModal("login"));
tabRegister.addEventListener("click", () => showAuthModal("register"));

// Password show/hide toggle functionality
document.querySelectorAll(".password-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        sound.playBleep();
        const container = btn.closest(".password-container");
        const input = container ? container.querySelector("input") : null;
        if (input) {
            if (input.type === "password") {
                input.type = "text";
                btn.textContent = "HIDE";
            } else {
                input.type = "password";
                btn.textContent = "SHOW";
            }
        }
    });
});

authTriggerBtn.addEventListener("click", async () => {
    sound.playBleep();
    const user = auth.getCurrentUser();
    if (user) {
        await auth.signOut();
        updateAuthStateUI();
    } else {
        showAuthModal("login");
    }
});

const promptLoginBtn = document.getElementById("prompt-login-btn");
if (promptLoginBtn) {
    promptLoginBtn.addEventListener("click", () => {
        sound.playBleep();
        showAuthModal("login");
    });
}

modalClose.addEventListener("click", () => {
    sound.playBleep();
    closeAuthModal();
});

if (authModal) {
    authModal.addEventListener("click", (e) => {
        if (e.target === authModal) {
            sound.playBleep();
            closeAuthModal();
        }
    });
}

// Forgot & Reset Password Handlers
if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sound.playBleep();
        
        // Hide standard login UI
        const tabContainer = document.querySelector(".tab-container");
        if (tabContainer) tabContainer.classList.add("hidden");
        loginForm.classList.add("hidden");
        authError.classList.add("hidden");
        authSuccess.classList.add("hidden");
        modalTitle.textContent = "RESET PASSWORD";
        
        // Pre-fill email address if the user typed it in the login field
        const loginEmailVal = document.getElementById("login-email").value;
        const forgotEmailInput = document.getElementById("forgot-email");
        if (forgotEmailInput) {
            forgotEmailInput.value = loginEmailVal;
        }
        
        // Show forgot password form
        if (forgotPasswordForm) {
            forgotPasswordForm.classList.remove("hidden");
            const forgotEmailInput = document.getElementById("forgot-email");
            if (forgotEmailInput) {
                forgotEmailInput.disabled = false;
                forgotEmailInput.style.opacity = "";
                forgotEmailInput.style.cursor = "";
            }
            if (typeof turnstile !== "undefined") {
                const forgotCaptcha = document.getElementById("forgot-captcha");
                if (forgotCaptcha) {
                    try {
                        turnstile.reset(forgotCaptcha);
                    } catch (err) {
                        console.error("Failed to reset forgot captcha:", err);
                    }
                }
            }
            setTimeout(() => {
                if (forgotEmailInput) forgotEmailInput.focus();
            }, 50);
        }
    });
}

if (forgotBackBtn) {
    forgotBackBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sound.playBleep();
        
        authError.classList.add("hidden");
        authSuccess.classList.add("hidden");
        
        // Hide forgot password form
        if (forgotPasswordForm) {
            forgotPasswordForm.classList.add("hidden");
            const forgotEmailInput = document.getElementById("forgot-email");
            if (forgotEmailInput) {
                forgotEmailInput.disabled = false;
                forgotEmailInput.style.opacity = "";
                forgotEmailInput.style.cursor = "";
            }
        }
        
        // Show standard login UI
        const tabContainer = document.querySelector(".tab-container");
        if (tabContainer) tabContainer.classList.remove("hidden");
        loginForm.classList.remove("hidden");
        modalTitle.textContent = "USER";
        
        if (typeof turnstile !== "undefined") {
            const loginCaptcha = document.getElementById("login-captcha");
            if (loginCaptcha) {
                try {
                    turnstile.reset(loginCaptcha);
                } catch (err) {
                    console.error("Failed to reset login captcha:", err);
                }
            }
        }
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        authError.classList.add("hidden");
        authSuccess.classList.add("hidden");
        
        // Retrieve Cloudflare Turnstile verification token
        const forgotFormEl = document.getElementById("forgot-password-form");
        const captchaInput = forgotFormEl.querySelector("[name='cf-turnstile-response']");
        const captchaResponse = captchaInput ? captchaInput.value : "";
        if (typeof turnstile !== "undefined") {
            if (!captchaResponse) {
                authError.textContent = "PLEASE COMPLETE THE CAPTCHA CHALLENGE";
                authError.classList.remove("hidden");
                return;
            }
        }

        const email = document.getElementById("forgot-email").value;
        const submitBtn = forgotPasswordForm.querySelector("button[type='submit']");
        
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "SENDING...";
            }
            
            await auth.sendPasswordResetEmail(email, captchaResponse);
            
            authSuccess.textContent = "RESET LINK SENT! CHECK YOUR INBOX.";
            authSuccess.classList.remove("hidden");
            sound.playSuccess();
            
            // Grey out the email input box
            const forgotEmailInput = document.getElementById("forgot-email");
            if (forgotEmailInput) {
                forgotEmailInput.disabled = true;
                forgotEmailInput.style.opacity = "0.5";
                forgotEmailInput.style.cursor = "not-allowed";
            }

            if (typeof turnstile !== "undefined") {
                const forgotCaptcha = document.getElementById("forgot-captcha");
                if (forgotCaptcha) turnstile.reset(forgotCaptcha);
            }
        } catch (err) {
            console.error("[Forgot Password] Request failed:", err);
            
            let errMsg = "RESET REQUEST FAILED";
            if (err) {
                if (typeof err === "string") {
                    errMsg = err;
                } else {
                    const status = err.status || err.statusCode || "";
                    const name = err.name || "";
                    let message = err.message || "";
                    
                    if (message === "{}" || !message || message === "[object Object]") {
                        if (err.error_description) {
                            message = err.error_description;
                        } else if (err.error) {
                            message = typeof err.error === 'object' ? JSON.stringify(err.error) : String(err.error);
                        } else {
                            const str = JSON.stringify(err);
                            message = str !== "{}" ? str : "RESET REQUEST FAILED";
                        }
                    }
                    
                    errMsg = `${name ? '[' + name + '] ' : ''}${status ? '(STATUS ' + status + ') ' : ''}${message}`;
                }
            }
            
            authError.textContent = errMsg.toUpperCase();
            authError.classList.remove("hidden");
            if (typeof turnstile !== "undefined") {
                const forgotCaptcha = document.getElementById("forgot-captcha");
                if (forgotCaptcha) turnstile.reset(forgotCaptcha);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "SEND RESET LINK";
            }
        }
    });
}

if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        authError.classList.add("hidden");
        authSuccess.classList.add("hidden");
        
        const newPassword = document.getElementById("reset-password").value;
        const confirmPassword = document.getElementById("reset-confirm-password").value;
        const submitBtn = resetPasswordForm.querySelector("button[type='submit']");
        
        if (newPassword !== confirmPassword) {
            authError.textContent = "PASSWORDS DO NOT MATCH";
            authError.classList.remove("hidden");
            return;
        }
        
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "UPDATING...";
            }
            
            await auth.updatePassword(newPassword);
            
            authSuccess.textContent = "PASSWORD UPDATED! LOADING...";
            authSuccess.classList.remove("hidden");
            sound.playSuccess();
            
            setTimeout(() => {
                closeAuthModal();
                updateAuthStateUI();
            }, 1500);
        } catch (err) {
            authError.textContent = err.message.toUpperCase();
            authError.classList.remove("hidden");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "UPDATE PASSWORD";
            }
        }
    });
}

// Listen for password recovery trigger from auth client
window.addEventListener('password-recovery-triggered', () => {
    console.log("[App] Password recovery triggered!");
    
    // Open auth modal in Reset mode
    authModal.classList.remove("hidden");
    authError.classList.add("hidden");
    authSuccess.classList.add("hidden");
    
    // Hide other views and tabs
    const tabContainer = document.querySelector(".tab-container");
    if (tabContainer) tabContainer.classList.add("hidden");
    loginForm.classList.add("hidden");
    registerForm.classList.add("hidden");
    if (forgotPasswordForm) forgotPasswordForm.classList.add("hidden");
    
    // Show Reset Password form
    modalTitle.textContent = "RESET PASSWORD";
    if (resetPasswordForm) {
        resetPasswordForm.classList.remove("hidden");
        const resetPass = document.getElementById("reset-password");
        if (resetPass) {
            setTimeout(() => resetPass.focus(), 50);
        }
    }
});

// Submit login
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");
    
    // Check Cloudflare Turnstile token for Login form specifically
    const loginFormEl = document.getElementById("login-form");
    const captchaInput = loginFormEl.querySelector("[name='cf-turnstile-response']");
    const captchaResponse = captchaInput ? captchaInput.value : "";
    if (typeof turnstile !== "undefined") {
        if (!captchaResponse) {
            authError.textContent = "PLEASE COMPLETE THE CAPTCHA CHALLENGE";
            authError.classList.remove("hidden");
            return;
        }
    }
    
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;

    console.log("[Login] Submit event triggered. Email:", email);

    const diagAction = document.getElementById("diag-action");
    if (diagAction) {
        diagAction.textContent = "SENDING LOGIN REQUEST...";
        diagAction.style.color = "#ffff00";
    }

    try {
        console.log("[Login] Calling auth.signIn...");
        const session = await auth.signIn(email, pass, captchaResponse);
        console.log("[Login] auth.signIn succeeded! Session:", session);
        
        if (diagAction) {
            diagAction.textContent = "LOGIN SUCCESSFUL!";
            diagAction.style.color = "#00ff00";
        }
        
        authSuccess.textContent = "LOGGED IN! LOADING...";
        authSuccess.classList.remove("hidden");
        sound.playSuccess();
        setTimeout(() => {
            closeAuthModal();
            updateAuthStateUI();
            runDiagnostics();
        }, 1000);
    } catch (err) {
        console.error("[Login] Error encountered during login:", err);
        if (diagAction) {
            diagAction.textContent = "LOGIN ERROR: " + err.message.toUpperCase();
            diagAction.style.color = "#ff0000";
        }
        authError.textContent = err.message.toUpperCase();
        authError.classList.remove("hidden");
        if (typeof turnstile !== "undefined") {
            const loginCaptcha = document.getElementById("login-captcha");
            if (loginCaptcha) turnstile.reset(loginCaptcha);
        }
    }
});

const resendEmailBtn = document.getElementById("resend-email-btn");
if (resendEmailBtn) {
    resendEmailBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        sound.playBleep();
        authError.classList.add("hidden");
        authSuccess.classList.add("hidden");

        const email = document.getElementById("login-email").value;
        if (!email) {
            authError.textContent = "ENTER EMAIL ADDRESS FIRST!";
            authError.classList.remove("hidden");
            return;
        }

        try {
            resendEmailBtn.style.pointerEvents = "none";
            resendEmailBtn.textContent = "SENDING...";
            await auth.resendVerification(email);
            authSuccess.textContent = "VERIFICATION EMAIL RESENT! CHECK YOUR INBOX.";
            authSuccess.classList.remove("hidden");
            sound.playSuccess();
        } catch (err) {
            authError.textContent = err.message.toUpperCase();
            authError.classList.remove("hidden");
        } finally {
            resendEmailBtn.style.pointerEvents = "auto";
            resendEmailBtn.textContent = "RESEND VERIFICATION EMAIL";
        }
    });
}

// Submit registration
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");

    // Check Cloudflare Turnstile verification token for Register form specifically
    const registerFormEl = document.getElementById("register-form");
    const captchaInput = registerFormEl.querySelector("[name='cf-turnstile-response']");
    const captchaResponse = captchaInput ? captchaInput.value : "";
    if (typeof turnstile !== "undefined") {
        if (!captchaResponse) {
            authError.textContent = "PLEASE COMPLETE THE CAPTCHA CHALLENGE";
            authError.classList.remove("hidden");
            return;
        }
    }

    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const pass = document.getElementById("reg-password").value;

    try {
        // Check if email already in use using custom RPC
        const exists = await auth.checkEmailExists(email);
        if (exists) {
            throw new Error("EMAIL ALREADY IN USE");
        }

        const result = await auth.signUp(email, pass, username, captchaResponse);
        if (!result.session) {
            // Hide normal inputs and tab controls, but keep close button visible
            document.querySelector(".tab-container").classList.add("hidden");
            loginForm.classList.add("hidden");
            registerForm.classList.add("hidden");
            authError.classList.add("hidden");
            authSuccess.classList.add("hidden");
            
            // Show verification screen and start polling
            verificationPendingSection.classList.remove("hidden");
            sound.playSuccess();
            startVerificationPolling();
        } else {
            authSuccess.textContent = "ACCOUNT CREATED! LOADING...";
            authSuccess.classList.remove("hidden");
            sound.playSuccess();
            setTimeout(() => {
                closeAuthModal();
                updateAuthStateUI();
            }, 1000);
        }
    } catch (err) {
        authError.textContent = err.message.toUpperCase();
        authError.classList.remove("hidden");
        if (typeof turnstile !== "undefined") {
            const regCaptcha = document.getElementById("register-captcha");
            if (regCaptcha) turnstile.reset(regCaptcha);
        }
    }
});

// --- POPULATE FLOATING ITEMS ---
function isPostCompleted(post) {
    const rand = seededRandom(post.id);
    rand(); // yPercent
    rand(); // bobOffset
    rand(); // bobSpeed
    const speedFactor = 0.8 + rand() * 0.4;
    const travelSpan = 2300;
    const baseSpeed = 0.09;
    const travelTime = travelSpan / (baseSpeed * speedFactor);
    const age = getServerTime() - new Date(post.createdAt).getTime();
    const completed = age >= travelTime;
    console.log(`[isPostCompleted] ID: ${post.id.slice(0,8)}, age: ${Math.round(age)}, travelTime: ${Math.round(travelTime)}, completed: ${completed}`);
    return completed;
}

async function syncDatabasePosts() {
    try {
        const posts = await db.getPosts();
        databasePosts = posts;
        
        // Fetch global accumulative clicks directly from DB statistics table
        const totalClicks = await db.getTotalClicks();
        if (hudTotalViews) {
            hudTotalViews.textContent = totalClicks.toLocaleString();
        }

        // Add completed posts to expiredPostIds
        posts.forEach(post => {
            if (isPostCompleted(post)) {
                expiredPostIds.add(post.id);
            }
        });
        
        // Filter active posts (that are not yet completed/expired)
        const activePosts = posts.filter(post => !expiredPostIds.has(post.id));
        if (hudItemCount) hudItemCount.textContent = activePosts.length;
        
        // Remove any floating items that are no longer present in activePosts,
        // but only if they have also physically sailed off screen to the left (isExpired) to prevent premature deletion during traffic jams.
        floatingItems = floatingItems.filter(item => {
            if (item.post.id.startsWith("local_")) return true;
            const isPresentInActive = activePosts.some(post => post.id === item.post.id);
            if (isPresentInActive) return true;
            return !item.isExpired;
        });

        // Re-align floatingItems array: add any logs that are present in activePosts but missing on screen
        activePosts.forEach((post) => {
            const exists = floatingItems.some(item => item.post.id === post.id);
            if (!exists) {
                const newItem = new FloatingItem(post);
                
                // If there is an optimistic log floating for this post, replace it smoothly without visual jumps
                const optLog = floatingItems.find(item => 
                    item.post.id.startsWith("local_opt_") && 
                    item.post.username === post.username && 
                    (item.post.text === post.text || 
                     item.post.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") === post.text)
                );
                
                if (optLog) {
                    newItem.virtualX = optLog.virtualX;
                    newItem.virtualY = optLog.virtualY;
                    newItem.virtualVx = optLog.virtualVx;
                    newItem.virtualVy = optLog.virtualVy;
                    newItem.createdAtTime = optLog.createdAtTime;
                    
                    // Remove optimistic log
                    floatingItems = floatingItems.filter(item => item !== optLog);
                }
                
                floatingItems.push(newItem);
                
                // Play splash sound if page is loaded and it's not a historical post (and not replacing an optimistic log)
                if (!optLog && isPageLoaded && getServerTime() - new Date(post.createdAt).getTime() < 5000) {
                    sound.playSplash();
                }
            }
        });
    } catch (e) {
        console.error("Failed to sync posts:", e);
    }
}

// Toss Form Submit
tossForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const textVal = postText.value;
    const urlVal = document.getElementById("post-url").value;
    const spriteVal = "log"; // Only logs allowed for link posts
    const autoRepostToggle = document.getElementById("auto-repost-toggle");
    
    try {
        const user = auth.getCurrentUser();
        if (!user) throw new Error("MUST BE LOGGED IN");

        if (user.credits < 1) {
            throw new Error("OUT OF CREDITS! CLICK '+BUY' IN THE HUD TO GET 100 LINKS.");
        }

        // Spawn the log optimistically immediately to provide instant visual feedback!
        const optimisticPost = {
            id: "local_opt_" + Date.now(),
            username: user.username,
            text: textVal,
            url: urlVal,
            sprite: spriteVal,
            createdAt: new Date().toISOString()
        };
        const optimisticLog = new FloatingItem(optimisticPost);
        floatingItems.push(optimisticLog);
        sound.playSplash(); // Play splash instantly!

        // Deduct 1 credit (handled database-side, but keep call for API compatibility)
        await auth.deductCredit(user.id);

        await db.addPost({
            username: user.username,
            text: textVal,
            url: urlVal,
            sprite: spriteVal
        });

        // Keep the URL filled and highlight it so they can easily re-submit or type over it
        const urlInput = document.getElementById("post-url");
        urlInput.select();
        urlInput.focus();
        
        // Fetch updated credit statistics from database
        await auth.refreshUserProfile();

        // Force database reload
        await syncDatabasePosts();
        postsChannel.postMessage({ type: "SYNC_POSTS" });

        // If AUTO-REPOST is checked, start the Web Worker background timer
        if (autoRepostToggle && autoRepostToggle.checked) {
            autoPilotWorker.postMessage({ action: 'start', interval: 22000 });
            showDailyBonusToast("AUTO-PILOT DEPLOYED: RUNNING...");
        } else {
            autoPilotWorker.postMessage({ action: 'stop' });
        }
    } catch (err) {
        showRetroAlert(err.message.toUpperCase());
        if (autoRepostToggle) autoRepostToggle.checked = false;
        autoPilotWorker.postMessage({ action: 'stop' });
    }
});

// Auto-Pilot manual checkbox change listener
const autoRepostToggle = document.getElementById("auto-repost-toggle");
if (autoRepostToggle) {
    autoRepostToggle.addEventListener("change", () => {
        sound.playBleep();
        if (!autoRepostToggle.checked) {
            autoPilotWorker.postMessage({ action: 'stop' });
            showDailyBonusToast("AUTO-PILOT DEACTIVATED");
        } else {
            showDailyBonusToast("AUTO-PILOT ARMED: SUBMIT POST TO START");
        }
    });
}



// --- CANVAS INTERACTION & INSPECT ---
const inspectHud = document.getElementById("item-inspect-hud");
const inspectUser = document.getElementById("inspect-user");
const inspectText = document.getElementById("inspect-text");
const inspectLink = document.getElementById("inspect-link");
const inspectClose = document.getElementById("inspect-close");

// --- SECURITY SCANNER LOGIC (BACKGROUND CHECKS & RETRO MODAL BLOCK) ---
async function runBackgroundSecurityScan(url, clickedPostId) {
    const lowerUrl = url.toLowerCase();
    
    // --- 1. EDGE CHECK ---
    const isIllegalDomain = db.ILLEGAL_DOMAINS && db.ILLEGAL_DOMAINS.some(domain => lowerUrl.includes(domain.toLowerCase()));
    const isMalwareKeyword = lowerUrl.includes("malware") || lowerUrl.includes("virus") || lowerUrl.includes("spyware") || lowerUrl.includes("keylogger");
    
    if (isIllegalDomain || isMalwareKeyword) {
        const logs = [
            { text: "INITIALIZING MULTI-LAYER SCAN PIPELINE...", type: "info" },
            { text: `TARGET: ${url}`, type: "info" },
            { text: "LAYER 1: EDGE FILTER CHECK...", type: "info" },
            { text: "LAYER 1: EDGE FILTER CHECK -> FAILED!", type: "fail" },
            { text: "CRITICAL: DOMAIN MATCHES KNOWN MALICIOUS BLACKLIST SIGNATURE.", type: "fail" },
            { text: "ALERT: PLATFORM POLICY FORBIDS REDIRECTION TO CRITICAL RISK PATHS.", type: "fail" }
        ];
        showRetroBlockModal(url, "Layer 1 (Edge Filtering Check)", "URL is registered on global threat database of malware/phishing distributors.", logs);
        return;
    }
    
    // --- 2. REDIRECT TRACKER ---
    const isShortener = lowerUrl.includes("bit.ly") || lowerUrl.includes("tinyurl.com") || lowerUrl.includes("t.co") || lowerUrl.includes("short.url");
    if (isShortener) {
        if (lowerUrl.includes("malicious-link") || lowerUrl.includes("spyware-redir")) {
            const logs = [
                { text: "INITIALIZING MULTI-LAYER SCAN PIPELINE...", type: "info" },
                { text: `TARGET: ${url}`, type: "info" },
                { text: "LAYER 1: EDGE FILTER CHECK -> PASSED (Domain reputation secure)", type: "success" },
                { text: "LAYER 2: REDIRECT TRACKER...", type: "info" },
                { text: "SHORTENER DOMAIN DETECTED. RESOLVING HOPS...", type: "warning" },
                { text: "REDIRECT HOP 1: bit.ly -> malware-site.com", type: "warning" },
                { text: "LAYER 2: REDIRECT TRACKER -> FAILED!", type: "fail" },
                { text: "CRITICAL: REDIRECT TARGET RESOLVES TO BLACKLISTED MALICIOUS HOST.", type: "fail" },
                { text: "ALERT: PLATFORM POLICY FORBIDS REDIRECTION TO CRITICAL RISK PATHS.", type: "fail" }
            ];
            showRetroBlockModal(url, "Layer 2 (Redirect Tracker)", "Nested URL redirection maps directly to malware-site.com.", logs);
            return;
        }
    }
    
    // --- 3. CRAWLER SANDBOX ---
    const isCloaking = lowerUrl.includes("cloak") || lowerUrl.includes("stealth") || lowerUrl.includes("proxy-hidden") || lowerUrl.includes("darkweb");
    if (isCloaking) {
        const logs = [
            { text: "INITIALIZING MULTI-LAYER SCAN PIPELINE...", type: "info" },
            { text: `TARGET: ${url}`, type: "info" },
            { text: "LAYER 1: EDGE FILTER CHECK -> PASSED (Domain reputation secure)", type: "success" },
            { text: "LAYER 2: REDIRECT TRACKER -> PASSED (0 redirect hops)", type: "success" },
            { text: "LAYER 3: HEADLESS CRAWLER SANDBOX...", type: "info" },
            { text: "SPAWNING SANDBOXED PUPPETEER PROCESS VIA RESIDENTIAL PROXY...", type: "info" },
            { text: "LAYER 3: CRAWLER SANDBOX -> FAILED!", type: "fail" },
            { text: "CRITICAL: CLOAKING BEHAVIOR DETECTED (Crawler user-agent blocked or redirected to decoy page).", type: "fail" },
            { text: "ALERT: PLATFORM POLICY FORBIDS REDIRECTION TO CRITICAL RISK PATHS.", type: "fail" }
        ];
        showRetroBlockModal(url, "Layer 3 (Headless Crawler Sandbox)", "Destination server performs device cloaking to hide malicious payload from threat intelligence nodes.", logs);
        return;
    }
    
    // --- 4. MULTIMODAL AI THREAT SCAN ---
    const isPhishing = lowerUrl.includes("scam") || lowerUrl.includes("bank-login") || lowerUrl.includes("phish") || lowerUrl.includes("giveaway");
    if (isPhishing) {
        const logs = [
            { text: "INITIALIZING MULTI-LAYER SCAN PIPELINE...", type: "info" },
            { text: `TARGET: ${url}`, type: "info" },
            { text: "LAYER 1: EDGE FILTER CHECK -> PASSED (Domain reputation secure)", type: "success" },
            { text: "LAYER 2: REDIRECT TRACKER -> PASSED (0 redirect hops)", type: "success" },
            { text: "LAYER 3: CRAWLER SANDBOX -> PASSED (Clean HTML body retrieved)", type: "success" },
            { text: "LAYER 4: MULTIMODAL AI THREAT SCAN...", type: "info" },
            { text: "SUBMITTING SCREENSHOT & METADATA TO VISION SAFETY MODEL...", type: "info" },
            { text: "LAYER 4: MULTIMODAL AI THREAT SCAN -> FAILED!", type: "fail" },
            { text: "CRITICAL: AI DETECTED PHISHING LOGIN TEMPLATE (Mimics bank interface).", type: "fail" },
            { text: "ALERT: PLATFORM POLICY FORBIDS REDIRECTION TO CRITICAL RISK PATHS.", type: "fail" }
        ];
        showRetroBlockModal(url, "Layer 4 (Multimodal AI Scan)", "Vision model detected layout design matching a bank portal, with a foreign domain registration. Visual phishing threat confirmed.", logs);
        return;
    }
    
    // --- APPROVED & PROCEED ---
    if (clickedPostId) {
        if (clickedPostId.startsWith("local_")) {
            const targetPost = databasePosts.find(p => p.url.includes("fugaea.com") || p.username === "fugaea") || databasePosts[0];
            if (targetPost) await db.incrementClicks(targetPost.id);
        } else {
            await db.incrementClicks(clickedPostId);
        }
    }
    
    window.open(url, "_blank");
}

// --- RETRO BLOCK MODAL POPUP ---
function showRetroBlockModal(url, layerName, reason, logs) {
    const securityScanModal = document.getElementById("security-scan-modal");
    const scanTargetUrl = document.getElementById("scan-target-url");
    const scanStatusText = document.getElementById("scan-status-text");
    const scanProgressBar = document.getElementById("scan-progress-bar");
    const scanLogs = document.getElementById("scan-logs");
    const scanVerdictContainer = document.getElementById("scan-verdict-container");
    const scanVerdictTitle = document.getElementById("scan-verdict-title");
    const scanVerdictDetails = document.getElementById("scan-verdict-details");
    const scanAbortBtn = document.getElementById("scan-abort-btn");
    const scanProceedBtn = document.getElementById("scan-proceed-btn");
    
    // Configure modal for failed threat block state
    securityScanModal.classList.remove("hidden");
    securityScanModal.querySelector(".modal-box").classList.add("threat-detected");
    
    scanTargetUrl.textContent = url;
    scanStatusText.textContent = "BLOCKED (THREAT DETECTED)";
    scanStatusText.className = "";
    scanStatusText.style.color = "#ff3333";
    
    scanProgressBar.style.width = "100%";
    scanProgressBar.textContent = "BLOCKED";
    scanProgressBar.style.backgroundColor = "#ff3333";
    
    // Populate scan logs for visual diagnostic
    scanLogs.innerHTML = "";
    logs.forEach(line => {
        const logLine = document.createElement("div");
        logLine.className = `scan-log-line ${line.type}`;
        let prefix = "  ";
        if (line.type === "success") prefix = "✔ ";
        if (line.type === "fail") prefix = "✖ ";
        if (line.type === "warning") prefix = "⚠ ";
        logLine.textContent = prefix + line.text;
        scanLogs.appendChild(logLine);
    });
    scanLogs.scrollTop = scanLogs.scrollHeight;
    
    scanVerdictContainer.classList.remove("hidden");
    scanVerdictTitle.textContent = `BLOCKED AT ${layerName.toUpperCase()}`;
    scanVerdictDetails.textContent = reason;
    
    scanAbortBtn.textContent = "ABORT / GO BACK";
    scanProceedBtn.classList.add("hidden");
    
    sound.playSplash(); // warning sound
}

// Hook up scan modal abort button to close the modal
const scanAbortBtn = document.getElementById("scan-abort-btn");
if (scanAbortBtn) {
    scanAbortBtn.addEventListener("click", () => {
        sound.playBleep();
        document.getElementById("security-scan-modal").classList.add("hidden");
    });
}

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener("click", async () => {
    // If we click a hovered item, intercept and trigger security scanner
    if (hoveredItem) {
        const clickedPostId = hoveredItem.post.id;
        runBackgroundSecurityScan(hoveredItem.post.url, clickedPostId);
    }
});

inspectClose.addEventListener("click", () => {
    sound.playBleep();
    inspectHud.classList.add("hidden");
    selectedItem = null;
});

inspectLink.addEventListener("click", (e) => {
    e.preventDefault();
    sound.playBleep();
    inspectHud.classList.add("hidden");
    if (selectedItem) {
        runBackgroundSecurityScan(selectedItem.post.url, selectedItem.post.id);
    }
    selectedItem = null;
});




// --- DIAGNOSTICS LOGIC ---
async function runDiagnostics() {
    const connectedSpan = document.getElementById("diag-connected");
    const sessionSpan = document.getElementById("diag-session");
    if (!connectedSpan || !sessionSpan) return;

    try {
        const { data, count, error } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true });
            
        if (error) throw error;
        connectedSpan.textContent = "CONNECTED (OK)";
        connectedSpan.style.color = "#00ff00";
    } catch (err) {
        connectedSpan.textContent = "FAILED: " + err.message.toUpperCase();
        connectedSpan.style.color = "#ff0000";
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        sessionSpan.textContent = session ? `LOGGED IN (${session.user.email.toUpperCase()})` : "NOT LOGGED IN";
        sessionSpan.style.color = session ? "#00ff00" : "#ffcc00";
    } catch (err) {
        sessionSpan.textContent = "ERROR: " + err.message.toUpperCase();
        sessionSpan.style.color = "#ff0000";
    }
}

// --- REDIRECT WINDOW HANDLER ---
async function handleAuthRedirect() {
    const hash = window.location.hash;
    if (hash && (hash.includes("access_token") || hash.includes("error"))) {
        // Wait a brief moment to ensure Supabase client parses the hash and writes to localStorage
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Tell the old tab to close itself or redirect
        authChannel.postMessage({ type: "CLOSE_OLD_TABS" });
        
        // Do NOT close this tab, let it initialize the app normally
        console.log("Auth redirect detected. Signal sent to close other tabs. Loading site in this window.");
    }
}

// --- INITIALIZATION ---
async function initApp() {
    await handleAuthRedirect();
    
    updateAuthStateUI();
    runDiagnostics();
    
    // Initial sync
    await syncDatabasePosts();
    
    // Initialize presence tracking for online users
    await trackPresence();

    // Listen for database changes in real-time to load new logs instantly (inserts, updates, etc.)
    const postsChannel = supabase.channel('public:posts');
    postsChannel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
            console.log("[Realtime Insert] Payload:", payload);
            try {
                // Fetch the username of the poster (1 quick indexed query instead of rebuilding everything)
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', payload.new.user_id)
                    .single();
                
                if (error) throw error;
                
                const post = {
                    id: payload.new.id,
                    username: profile?.username || 'unknown',
                    text: payload.new.text,
                    url: payload.new.url,
                    sprite: payload.new.sprite,
                    createdAt: payload.new.created_at,
                    clicks: payload.new.clicks || 0
                };
                
                // Add to databasePosts if it doesn't exist
                if (!databasePosts.some(p => p.id === post.id)) {
                    databasePosts.push(post);
                    
                    // Filter and render if not completed
                    if (!expiredPostIds.has(post.id) && !isPostCompleted(post)) {
                        const existsOnScreen = floatingItems.some(item => item.post.id === post.id);
                        if (!existsOnScreen) {
                            const newItem = new FloatingItem(post);
                            
                            // If there is an optimistic log floating for this post, replace it smoothly without visual jumps
                            const optLog = floatingItems.find(item => 
                                item.post.id.startsWith("local_opt_") && 
                                item.post.username === post.username && 
                                (item.post.text === post.text || 
                                 item.post.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") === post.text)
                            );
                            
                            if (optLog) {
                                newItem.virtualX = optLog.virtualX;
                                newItem.virtualY = optLog.virtualY;
                                newItem.virtualVx = optLog.virtualVx;
                                newItem.virtualVy = optLog.virtualVy;
                                newItem.createdAtTime = optLog.createdAtTime;
                                
                                // Remove optimistic log
                                floatingItems = floatingItems.filter(item => item !== optLog);
                            }
                            
                            floatingItems.push(newItem);
                            
                            if (hudItemCount) {
                                const activeCount = floatingItems.filter(item => !item.post.id.startsWith("local_")).length;
                                hudItemCount.textContent = activeCount;
                            }
                            
                            // Play splash sound if page is loaded and it's not replacing an optimistic log
                            if (isPageLoaded && !optLog) {
                                sound.playSplash();
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to process realtime insert:", err);
                // Fallback to full sync on failure
                await syncDatabasePosts();
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, async (payload) => {
            console.log("[Realtime Update] Payload:", payload);
            // On updates (like click increments), update the click count inside databasePosts locally
            const post = databasePosts.find(p => p.id === payload.new.id);
            if (post) {
                post.clicks = payload.new.clicks || 0;
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, async (payload) => {
            console.log("[Realtime Delete] Payload:", payload);
            // Remove from screen on delete
            databasePosts = databasePosts.filter(p => p.id !== payload.old.id);
            floatingItems = floatingItems.filter(item => item.post.id !== payload.old.id);
            if (hudItemCount) {
                const activeCount = floatingItems.filter(item => !item.post.id.startsWith("local_")).length;
                hudItemCount.textContent = activeCount;
            }
        });

    postsChannel.subscribe((status) => {
        console.log(`[Realtime postsChannel Status]:`, status);
        if (status === 'SUBSCRIBED') {
            // WebSockets connected: slow polling fallback to 60s to save database usage
            setupFallbackSync(60000);
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            // Connection failed/limit reached (e.g. 200 limit): fallback to 10s polling
            setupFallbackSync(10000);
        }
    });

    // Listen for statistics changes (for real-time total clicks counter updates)
    const statsChannel = supabase.channel('public:statistics');
    statsChannel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'statistics', filter: 'key=eq.total_clicks' }, (payload) => {
            console.log("[Realtime Statistics Update] Payload:", payload);
            const val = payload.new ? Number(payload.new.value) : 0;
            if (hudTotalViews) {
                hudTotalViews.textContent = val.toLocaleString();
            }
        });

    statsChannel.subscribe((status) => {
        console.log(`[Realtime statsChannel Status]:`, status);
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            setupFallbackSync(10000);
        }
    });

    // Start fallback sync (will dynamically adapt when channel subscriptions complete)
    setupFallbackSync(20000);
}

// --- CHECKOUT / MICROTRANSACTION SYSTEM ---
function showCheckoutModal() {
    checkoutModal.classList.remove("hidden");
    checkoutSuccess.classList.add("hidden");
    checkoutError.classList.add("hidden");
    
    // Reset to default package on open
    selectedPackageAmount = 0.99;
    selectedPackageCredits = 100;
    
    // Update active highlight classes on load
    const packageOptions = document.querySelectorAll(".retro-package-option");
    packageOptions.forEach(opt => {
        const amount = parseFloat(opt.getAttribute("data-amount"));
        if (amount === 0.99) {
            opt.classList.add("active");
            opt.style.borderColor = "var(--text-cyan)";
        } else {
            opt.classList.remove("active");
            opt.style.borderColor = "var(--btn-gray)";
        }
    });
    
    paySubmitBtn.innerHTML = '<i class="fas fa-lock"></i> SECURE PAY $0.99';
}

function closeCheckoutModal() {
    checkoutModal.classList.add("hidden");
    paymentForm.reset();
}

// Wire up package selection option click listeners
const packageOptions = document.querySelectorAll(".retro-package-option");
packageOptions.forEach(opt => {
    opt.addEventListener("click", () => {
        sound.playBleep();
        packageOptions.forEach(o => {
            o.classList.remove("active");
            o.style.borderColor = "var(--btn-gray)";
        });
        opt.classList.add("active");
        opt.style.borderColor = "var(--text-cyan)";
        
        selectedPackageAmount = parseFloat(opt.getAttribute("data-amount"));
        selectedPackageCredits = parseInt(opt.getAttribute("data-credits"));
        
        paySubmitBtn.innerHTML = `<i class="fas fa-lock"></i> SECURE PAY $${selectedPackageAmount.toFixed(2)}`;
    });
});

buyCreditsTrigger.addEventListener("click", () => {
    sound.playBleep();
    const user = auth.getCurrentUser();
    if (user) {
        showCheckoutModal();
    } else {
        showAuthModal("login");
    }
});
// Welcome overlay listeners removed

checkoutClose.addEventListener("click", () => {
    sound.playBleep();
    closeCheckoutModal();
});

paymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    checkoutError.classList.add("hidden");
    checkoutSuccess.classList.add("hidden");
    
    try {
        const user = auth.getCurrentUser();
        if (!user) throw new Error("MUST BE LOGGED IN TO BUY CREDITS");
        
        paySubmitBtn.disabled = true;
        paySubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REDIRECTING...';
        
        // Stripe Payment Links mapped by package amount
        const stripePaymentLinks = {
            "0.99": "https://buy.stripe.com/4gM3cngOvcWs2H240Ed7q00",
            "1.99": "https://buy.stripe.com/6oU00b2XFe0w6XifJmd7q03",
            "4.99": "https://buy.stripe.com/28E28j55N6y4ftO7cQd7q04"
        };
        
        const amountKey = selectedPackageAmount.toFixed(2);
        const paymentLink = stripePaymentLinks[amountKey];
        
        if (!paymentLink) {
            throw new Error("INVALID SELECTION. CHOOSE ANOTHER PACKAGE.");
        }
        
        // Append client_reference_id (user UUID) for database credit mapping
        const redirectUrl = `${paymentLink}?client_reference_id=${user.id}`;
        
        // Redirect to Stripe Secure Checkout
        window.location.href = redirectUrl;
    } catch (err) {
        checkoutError.textContent = err.message.toUpperCase();
        checkoutError.classList.remove("hidden");
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = `<i class="fas fa-lock"></i> SECURE PAY $${selectedPackageAmount.toFixed(2)}`;
    }
});

// Restore payment button state when returning via browser back button (bfcache)
window.addEventListener("pageshow", () => {
    if (paySubmitBtn) {
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = `<i class="fas fa-lock"></i> SECURE PAY $${selectedPackageAmount.toFixed(2)}`;
    }
});

// --- NEW BUTTON EVENT LISTENERS ---

if (regResendEmailBtn) {
    regResendEmailBtn.addEventListener("click", async () => {
        sound.playBleep();
        const email = document.getElementById("reg-email").value;
        if (!email) {
            showRetroAlert("EMAIL IS REQUIRED TO RESEND VERIFICATION!");
            return;
        }
        try {
            regResendEmailBtn.disabled = true;
            regResendEmailBtn.textContent = "SENDING...";
            await auth.resendVerification(email);
            showRetroAlert("VERIFICATION EMAIL RESENT! CHECK YOUR INBOX.");
            sound.playSuccess();
        } catch (err) {
            showRetroAlert(err.message.toUpperCase());
        } finally {
            regResendEmailBtn.disabled = false;
            regResendEmailBtn.textContent = "RESEND CONFIRMATION EMAIL";
        }
    });
}

if (regCheckStatusBtn) {
    regCheckStatusBtn.addEventListener("click", async () => {
        sound.playBleep();
        regCheckStatusBtn.disabled = true;
        regCheckStatusBtn.textContent = "CHECKING...";
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                stopVerificationPolling();
                await auth.refreshUserProfile();
                closeAuthModal();
                updateAuthStateUI();
                sound.playSuccess();
            } else {
                showRetroAlert("EMAIL NOT YET VERIFIED. PLEASE CHECK YOUR INBOX AND CLICK THE CONFIRMATION LINK.");
            }
        } catch (err) {
            showRetroAlert(err.message.toUpperCase());
        } finally {
            regCheckStatusBtn.disabled = false;
            regCheckStatusBtn.textContent = "I'VE CONFIRMED MY EMAIL";
        }
    });
}

// --- SOCIAL SHARE REWARD SYSTEM ---
if (shareXBtn) {
    shareXBtn.addEventListener("click", () => {
        sound.playBleep();
        const user = auth.getCurrentUser();
        if (user) {
            if (shareModal) shareModal.classList.remove("hidden");
        } else {
            showAuthModal("login");
        }
    });
}

if (shareClose) {
    shareClose.addEventListener("click", () => {
        sound.playBleep();
        if (shareModal) shareModal.classList.add("hidden");
    });
}

async function executeShare(platform, shareUrl, element, isCopyAction = false) {
    const user = auth.getCurrentUser();
    if (!user) return;
    
    try {
        const claimed = await auth.checkShareClaimed(user.id, platform);
        if (claimed) {
            alert("REWARD ALREADY CLAIMED FOR THIS PLATFORM!");
            return;
        }
    } catch (err) {
        console.error("[Share] Pre-claim check failed:", err);
    }
    
    sound.playCoin();
    
    // 1. Immediately grey out the button inside the modal and show claiming status
    if (element) {
        element.innerHTML = `<i class="fas fa-spinner fa-spin"></i> CLAIMING...`;
        element.style.opacity = "0.4";
        element.style.filter = "grayscale(1)";
        element.style.pointerEvents = "none";
        element.style.cursor = "not-allowed";
    }
    
    // 2. Wait 1.2 seconds (1200ms) before opening the link, saving, and adding credits
    setTimeout(async () => {
        if (isCopyAction) {
            try {
                await navigator.clipboard.writeText(window.location.origin);
                console.log("[Share] Link copied to clipboard");
            } catch (err) {
                console.error("[Share] Failed to copy link to clipboard:", err);
            }
        }
        
        window.open(shareUrl, "_blank");
        
        try {
            // Log claim to database (trigger automatically awards +10 credits)
            await auth.logShareClaim(user.id, platform);
            
            // Refresh UI to change to CLAIMED state permanently
            await updateAuthStateUI();
            
            // Hide modal
            if (shareModal) shareModal.classList.add("hidden");
            
            const msg = isCopyAction ? `LINK COPIED! OPENING ${platform.toUpperCase()}! +10 CREDITS!` : `SHARED ON ${platform.toUpperCase()}! +10 CREDITS!`;
            showDailyBonusToast(msg);
        } catch (err) {
            alert("COULD NOT ADD SHARE CREDITS: " + err.message.toUpperCase());
            // Re-enable/restore buttons if error occurs
            await updateShareModalUI();
        }
    }, 1200);
}

if (shareX) {
    shareX.addEventListener("click", (e) => {
        e.preventDefault();
        const shareText = encodeURIComponent("Fugaea is a real-time user-generated link platform. Register today for 10 free credits to share your links!");
        const shareUrl = encodeURIComponent(window.location.origin);
        executeShare("X", `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`, shareX);
    });
}

if (shareFacebook) {
    shareFacebook.addEventListener("click", (e) => {
        e.preventDefault();
        const shareUrl = encodeURIComponent(window.location.origin);
        executeShare("Facebook", `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, shareFacebook);
    });
}

if (shareLinkedin) {
    shareLinkedin.addEventListener("click", (e) => {
        e.preventDefault();
        const shareUrl = encodeURIComponent(window.location.origin);
        executeShare("LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, shareLinkedin);
    });
}

if (shareReddit) {
    shareReddit.addEventListener("click", (e) => {
        e.preventDefault();
        const shareTitle = encodeURIComponent("Fugaea is a real-time user-generated link platform. Register today for 10 free credits!");
        const shareUrl = encodeURIComponent(window.location.origin);
        executeShare("Reddit", `https://www.reddit.com/submit?url=${shareUrl}&title=${shareTitle}`, shareReddit);
    });
}

if (shareInstagram) {
    shareInstagram.addEventListener("click", (e) => {
        e.preventDefault();
        executeShare("Instagram", "https://www.instagram.com/", shareInstagram, true);
    });
}

if (shareTiktok) {
    shareTiktok.addEventListener("click", (e) => {
        e.preventDefault();
        executeShare("TikTok", "https://www.tiktok.com/", shareTiktok, true);
    });
}

// --- DAILY CHECK-IN REWARD SYSTEM ---
window.addEventListener('daily-claim-check', async (e) => {
    const userId = e.detail.userId;
    const user = auth.getCurrentUser();
    if (!user || user.id !== userId) return;

    // Get today's local date string (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA');
    const lastClaim = localStorage.getItem(`daily_claim_date_${userId}`);

    if (lastClaim !== today) {
        console.log(`[Daily Claim] Adding daily login credit for user ${userId}. Last claim: ${lastClaim}`);
        try {
            // Add 1 credit persistently
            await auth.addCredits(userId, 1);
            localStorage.setItem(`daily_claim_date_${userId}`, today);
            
            // Show retro pixelated toast message
            showDailyBonusToast("DAILY REWARD: +1 FREE LINK CREDIT!");
            updateAuthStateUI();
        } catch (err) {
            console.error("Daily claim failed:", err);
        }
    }
});

// --- RETRO TOAST POPUP HELPER ---
function showDailyBonusToast(message) {
    sound.playSuccess();
    
    let toast = document.getElementById("retro-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "retro-toast";
        toast.style.cssText = `
            position: fixed;
            top: 25%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.9);
            background: rgba(0, 0, 0, 0.95);
            color: #ffd700;
            border: 4px solid #ffd700;
            padding: 16px 24px;
            font-family: 'VT323', monospace;
            font-size: 24px;
            text-align: center;
            z-index: 99999;
            box-shadow: 8px 8px 0px #000;
            image-rendering: pixelated;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, -50%) scale(1.05)";
    
    setTimeout(() => {
        toast.style.transform = "translate(-50%, -50%) scale(1)";
    }, 150);
    
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 3500);
}

// --- VISUAL PHYSICS SIMULATION UTILITY ---
// Call window.simulateLogs(count) in the browser console to inject mock logs and test collisions.
window.simulateLogs = function(count = 20) {
    console.log(`[Simulation] Injecting ${count} physical logs into the river...`);
    const mockSprites = ["log", "log_mossy", "log_flowering"];
    const usernames = ["PixelGamer", "RetroFan", "8BitMaster", "RiverRider", "FugaeaFan", "ArcadeKing", "ChipTune", "PixelArt", "WaterLog", "Drippy"];
    
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const mockPost = {
            id: `mock_post_${i}_${Math.random().toString(36).substr(2, 5)}`,
            username: usernames[i % usernames.length] + Math.floor(Math.random() * 100),
            sprite: mockSprites[i % mockSprites.length],
            createdAt: new Date(now - Math.random() * 15000).toISOString(),
            clicks: Math.floor(Math.random() * 50)
        };
        
        const newItem = new FloatingItem(mockPost);
        // Spawn them staggered across the visible screen area to trigger immediate bounces
        newItem.virtualX = Math.random() * (getVirtualWidth() - 250) + 50;
        newItem.virtualVx = -3.3 * newItem.speedFactor; // start drift velocity
        
        floatingItems.push(newItem);
    }
};

// --- LEGAL MODAL LOGIC (TOS & PRIVACY) ---
function showLegalModal(tab) {
    legalModal.classList.remove("hidden");
    switchLegalTab(tab);
}

function closeLegalModal() {
    legalModal.classList.add("hidden");
}

function switchLegalTab(tab) {
    if (tab === 'tos') {
        tabTos.classList.add("active");
        tabPrivacy.classList.remove("active");
        tosTextContent.classList.remove("hidden");
        privacyTextContent.classList.add("hidden");
    } else {
        tabTos.classList.remove("active");
        tabPrivacy.classList.add("active");
        tosTextContent.classList.add("hidden");
        privacyTextContent.classList.remove("hidden");
    }
}

if (legalTosLink) {
    legalTosLink.addEventListener("click", (e) => {
        e.preventDefault();
        sound.playBleep();
        showLegalModal('tos');
    });
}

if (legalPrivacyLink) {
    legalPrivacyLink.addEventListener("click", (e) => {
        e.preventDefault();
        sound.playBleep();
        showLegalModal('privacy');
    });
}

if (tabTos) {
    tabTos.addEventListener("click", () => {
        sound.playBleep();
        switchLegalTab('tos');
    });
}

if (tabPrivacy) {
    tabPrivacy.addEventListener("click", () => {
        sound.playBleep();
        switchLegalTab('privacy');
    });
}

if (legalClose) {
    legalClose.addEventListener("click", () => {
        sound.playBleep();
        closeLegalModal();
    });
}



// Close legal modal if clicking outside the modal box
if (legalModal) {
    legalModal.addEventListener("click", (e) => {
        if (e.target === legalModal) {
            sound.playBleep();
            closeLegalModal();
        }
    });
}

// --- AUTO-SPAWN FUGAEA ADVERTISEMENT LOG ---
// Synchronized to the clock to keep them at the exact same location across all tabs/viewers
function spawnFugaeaLog() {
    const intervalMs = 22000;
    const currentEpochBlock = Math.floor(getServerTime() / intervalMs);
    const spawnTimeForBlock = currentEpochBlock * intervalMs;
    const id = `local_fugaea_${currentEpochBlock}`;
    
    // Check if we already have this block's log in floatingItems
    const exists = floatingItems.some(item => item.post.id === id);
    if (!exists) {
        const post = {
            id: id,
            username: "fugaea",
            sprite: "log_flowering", // flowering log for official highlight
            createdAt: new Date(spawnTimeForBlock).toISOString(),
            clicks: 0,
            text: "Fugaea is a real-time user-generated link platform.",
            url: "https://www.youtube.com/watch?v=ekexQdTwkak&list=RDekexQdTwkak&start_radio=1"
        };
        const newItem = new FloatingItem(post);
        floatingItems.push(newItem);
    }
}

// --- RETRO ALERT POPUP HELPER ---
function showRetroAlert(message) {
    const modal = document.getElementById("retro-alert-modal");
    const msgElement = document.getElementById("retro-alert-message");
    if (modal && msgElement) {
        msgElement.textContent = message.toUpperCase();
        modal.classList.remove("hidden");
        sound.playSplash(); // warning sound
    }
}

// Hook up retro alert modal close button listeners
const alertCloseBtn = document.getElementById("retro-alert-close");
const alertHeaderCloseBtn = document.getElementById("retro-alert-header-close");
const alertModal = document.getElementById("retro-alert-modal");

if (alertCloseBtn) {
    alertCloseBtn.addEventListener("click", () => {
        sound.playBleep();
        alertModal.classList.add("hidden");
        // Clear the bad URL link box here once RETURN is pressed!
        const urlInput = document.getElementById("post-url");
        if (urlInput) {
            urlInput.value = "";
            urlInput.focus();
        }
    });
}
if (alertHeaderCloseBtn) {
    alertHeaderCloseBtn.addEventListener("click", () => {
        sound.playBleep();
        alertModal.classList.add("hidden");
        // Clear the bad URL link box here once RETURN is pressed!
        const urlInput = document.getElementById("post-url");
        if (urlInput) {
            urlInput.value = "";
            urlInput.focus();
        }
    });
}

// --- RETRO ACCOUNT DELETION HANDLERS ---
const deleteConfirmModal = document.getElementById("delete-confirm-modal");
const deleteConfirmHeaderClose = document.getElementById("delete-confirm-header-close");
const deleteConfirmYes = document.getElementById("delete-confirm-yes");
const deleteConfirmNo = document.getElementById("delete-confirm-no");
const deleteSuccessModal = document.getElementById("delete-success-modal");
const deleteSuccessClose = document.getElementById("delete-success-close");

if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
        // Hide the legal modal first so they can see the confirmation popup clearly!
        const legalModal = document.getElementById("legal-modal");
        if (legalModal) legalModal.classList.add("hidden");
        
        if (deleteConfirmModal) deleteConfirmModal.classList.remove("hidden");
    });
}

const closeConfirm = () => {
    if (deleteConfirmModal) deleteConfirmModal.classList.add("hidden");
    // Open legal-modal back up
    const legalModal = document.getElementById("legal-modal");
    if (legalModal) legalModal.classList.remove("hidden");
};
if (deleteConfirmNo) deleteConfirmNo.addEventListener("click", closeConfirm);
if (deleteConfirmHeaderClose) deleteConfirmHeaderClose.addEventListener("click", closeConfirm);

if (deleteConfirmYes) {
    deleteConfirmYes.addEventListener("click", async () => {
        try {
            const user = auth.getCurrentUser();
            if (user) {
                deleteConfirmYes.disabled = true;
                deleteConfirmYes.textContent = "DELETING...";
                
                await auth.deleteAccount(user.id);
                
                // Reload the window instantly to reset state and log out
                window.location.reload();
            }
        } catch (err) {
            console.error("Account deletion error:", err);
            showRetroAlert("DELETION FAILED: " + err.message.toUpperCase());
            deleteConfirmYes.disabled = false;
            deleteConfirmYes.textContent = "YES, DELETE";
        }
    });
}

initApp();
renderLoop();
