// --- 8-BIT RETRO RIVER MAIN APPLICATION ---
import * as auth from "./auth.js";
import * as db from "./db.js";
import { supabase } from "./supabase-config.js";


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

// Wave Crest Particle Definition
class Wave {
    constructor(index) {
        this.index = index;
        const rand = seededRandom("wave_" + index);
        this.phase = rand();
        this.yPercent = rand(); // Store relative vertical position in river
        this.length = rand() * 60 + 30;
        this.speedFactor = rand() * 0.4 + 0.8;
        this.virtualX = 2000 * this.phase;

        // Randomly assign a gold or silver color to the ripples (approx. 20% gold waves)
        const colorRand = rand();
        if (colorRand > 0.8) {
            this.color = "rgba(255, 200, 50, 0.42)"; // Premium retro gold colored line
        } else {
            this.color = "rgba(255, 255, 255, 0.28)"; // Shiny silver/white ripples
        }
    }

    update(t) {
        const VIRTUAL_WIDTH = 2000;
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
        const actualX = (this.virtualX / 2000) * canvas.width;
        const actualLength = (this.length / 2000) * canvas.width;

        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(actualX), Math.floor(actualY), Math.ceil(actualLength), 4);
    }
}

// Initial waves (increased for more active current lines)
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
        this.createdAtTime = new Date(post.createdAt).getTime();
        
        // Virtual Size (constant in virtual coordinate space)
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
        this.hasBranch = true;                   // All logs have branches

        // Position - computed dynamically based on age at spawn time to distribute logs across river
        const ageOnSpawn = Math.max(0, Date.now() - this.createdAtTime);
        const VIRTUAL_WIDTH = 2000;
        const travelSpan = VIRTUAL_WIDTH + 300;
        const baseSpeed = 0.12; // Virtual base speed units per millisecond (matches physics vx)
        const progress = (ageOnSpawn * baseSpeed * this.speedFactor) / travelSpan;
        
        if (progress >= 1.0) {
            this.isExpired = true;
        }

        this.virtualX = VIRTUAL_WIDTH - progress * travelSpan;
        
        const riverTop = 460;
        const riverBottom = 720;
        this.virtualY = riverTop + 4 + this.yPercent * (riverBottom - riverTop - this.virtualHeight - 8);
        
        // Physical state vectors in virtual coordinate space
        this.virtualTargetVx = -2.0 * this.speedFactor;
        this.virtualVx = this.virtualTargetVx;
        this.virtualVy = 0;
        
        this.currentBob = 0;
        this.isHovered = false;

        // Splash effect for brand new logs dropped in
        this.splashProgress = (Date.now() - this.createdAtTime < 2500) ? 0.0 : 1.0;
        this.hasEnteredScreen = false;
    }

    realign() {
        const age = Math.max(0, Date.now() - this.createdAtTime);
        const VIRTUAL_WIDTH = 2000;
        const travelSpan = VIRTUAL_WIDTH + 300;
        const baseSpeed = 0.12;
        const progress = (age * baseSpeed * this.speedFactor) / travelSpan;
        
        this.virtualX = VIRTUAL_WIDTH - progress * travelSpan;
        
        const riverTop = 460;
        const riverBottom = 720;
        this.virtualY = riverTop + 4 + this.yPercent * (riverBottom - riverTop - this.virtualHeight - 8);
        
        this.virtualVx = this.virtualTargetVx;
        this.virtualVy = 0;
        this.isHovered = false;
        this.splashProgress = (Date.now() - this.createdAtTime < 2500) ? 0.0 : 1.0;
    }

    updatePhysics() {
        // Move incrementally in virtual coordinates
        this.virtualX += this.virtualVx;
        this.virtualY += this.virtualVy;
        
        const riverTop = 460;
        const riverBottom = 720;
        const targetY = riverTop + 4 + this.yPercent * (riverBottom - riverTop - this.virtualHeight - 8);
        
        // Slowly float back to original vertical lane and restore horizontal drift speed
        this.virtualVx += (this.virtualTargetVx - this.virtualVx) * 0.06;
        this.virtualY += (targetY - this.virtualY) * 0.02;
        this.virtualVy += (0 - this.virtualVy) * 0.03;

        // Keep inside vertical river boundary (bounce off top/bottom)
        const minVal = riverTop + 4;
        const maxVal = riverBottom - this.virtualHeight - 8;
        if (this.virtualY < minVal) {
            this.virtualY = minVal;
            this.virtualVy = Math.abs(this.virtualVy) * 0.5 + 0.25; // push down in virtual units
        } else if (this.virtualY > maxVal) {
            this.virtualY = maxVal;
            this.virtualVy = -Math.abs(this.virtualVy) * 0.5 - 0.25; // push up in virtual units
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
        const scaleX = canvas.width / 2000;
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
        const scaleX = canvas.width / 2000;
        const scaleY = canvas.height / 1000;

        const drawX = Math.floor(this.virtualX * scaleX);
        const drawY = Math.floor(this.virtualY * scaleY) + this.currentBob;
        const drawWidth = this.virtualWidth * scaleX;
        const drawHeight = this.virtualHeight * scaleY;
        const renderPixelScale = 6.0 * scaleX; // Proportional sprite scale

        const spriteMeta = SPRITES[this.post.sprite] || SPRITES.log;

        // Draw selection box outline if hovered
        if (this.isHovered) {
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
            ctx.lineWidth = 3;
            
            // Expand selection boundary to cover username, branch, and log with a buffer
            const topOffset = (this.hasBranch ? 61 : 44) * scaleY;
            const bottomOffset = 8 * scaleY;
            const sideOffset = 15 * scaleX;
            
            ctx.strokeRect(drawX - sideOffset, drawY - topOffset, drawWidth + sideOffset * 2, drawHeight + topOffset + bottomOffset);
            
            ctx.fillStyle = "rgba(0, 255, 255, 0.1)";
            ctx.fillRect(drawX - sideOffset, drawY - topOffset, drawWidth + sideOffset * 2, drawHeight + topOffset + bottomOffset);
        }

        // Splash effect for brand new logs dropped in
        if (this.splashProgress < 1.0) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            const radius = (1 - this.splashProgress) * 40 * scaleX;
            ctx.fillRect(drawX + drawWidth/2 - radius/2, drawY + drawHeight/2 - radius/2, radius, radius);
        }

        // Render the 8-bit sprite matrix
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
        ctx.fillStyle = this.isHovered ? "#ffcc00" : "#ffffff";
        ctx.font = `${Math.max(18, Math.floor(27 * scaleX))}px VT323`;
        ctx.textAlign = "center";
        
        // Draw black border around text for readability
        const label = this.post.username;
        const textX = Math.floor(drawX + drawWidth / 2);
        const textY = drawY - (this.hasBranch ? 35 : 18) * scaleY;
        
        ctx.fillStyle = "#000000";
        ctx.fillText(label, textX - 2, textY - 2);
        ctx.fillText(label, textX + 2, textY - 2);
        ctx.fillText(label, textX - 2, textY + 2);
        ctx.fillText(label, textX + 2, textY + 2);
        
        ctx.fillStyle = this.isHovered ? "#ffcc00" : "#ffffff";
        ctx.fillText(label, textX, textY);
    }

    checkCollision(mx, my) {
        const scaleX = canvas.width / 2000;
        const scaleY = canvas.height / 1000;

        const drawX = this.virtualX * scaleX;
        const drawY = this.virtualY * scaleY + this.currentBob;
        const drawWidth = this.virtualWidth * scaleX;
        const drawHeight = this.virtualHeight * scaleY;

        const topOffset = (this.hasBranch ? 61 : 44) * scaleY;
        const bottomOffset = 8 * scaleY;
        const sideOffset = 15 * scaleX;
        
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
            
            // Check box overlap in virtual coordinates
            const overlapX = Math.min(a.virtualX + a.virtualWidth, b.virtualX + b.virtualWidth) - Math.max(a.virtualX, b.virtualX);
            const overlapY = Math.min(a.virtualY + a.virtualHeight, b.virtualY + b.virtualHeight) - Math.max(a.virtualY, b.virtualY);
            
            if (overlapX > 0 && overlapY > 0) {
                // Spawn pixelated water splash particles at screen contact point
                const scaleX = canvas.width / 2000;
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
                        
                        // Bounce velocities (elastic response with mild damping to allow realistic grouping/jamming)
                        const temp = a.virtualVx;
                        a.virtualVx = b.virtualVx * 0.8;
                        b.virtualVx = temp * 0.8;
                    } else {
                        a.virtualX += push;
                        b.virtualX -= push;
                        
                        a.virtualVy -= 0.3;
                        b.virtualVy += 0.3;
                        
                        const temp = a.virtualVx;
                        a.virtualVx = b.virtualVx * 0.8;
                        b.virtualVx = temp * 0.8;
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

    const now = Date.now();

    // Run fixed timestep physics catch up
    let elapsed = now - lastPhysicsTime;
    lastPhysicsTime = now;
    if (elapsed > 1000) {
        elapsed = 1000;
    }
    physicsAccumulator += elapsed;
    while (physicsAccumulator >= PHYSICS_TIMESTEP) {
        updatePhysics();
        physicsAccumulator -= PHYSICS_TIMESTEP;
    }

    // Update & draw waves
    waveParticles.forEach(w => {
        w.update(now);
        w.draw();
    });

    // Update & draw collision splash particles
    collisionParticles.forEach(p => {
        p.update();
        p.draw();
    });
    collisionParticles = collisionParticles.filter(p => p.life > 0);

    // Update rendering state of floating items
    floatingItems.forEach(item => {
        item.update(now);
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
const submitSection = document.getElementById("submit-section");
const guestPromptSection = document.getElementById("guest-prompt-section");

const authModal = document.getElementById("auth-modal");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
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
        if (status === 'SUBSCRIBED') {
            await presenceChannel.track({
                online_at: new Date().toISOString()
            });
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
        hudUser.textContent = user.username.toUpperCase();
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
        
        hudCredits.textContent = "0";

        // Keep the HUD share button visible for guests to prompt registration
        if (shareXBtn) {
            shareXBtn.classList.remove("hidden");
        }

        // Hide close account button inside Privacy Policy
        if (closeAccountContainer) {
            closeAccountContainer.style.display = 'none';
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
    if (typeof turnstile !== "undefined") {
        try {
            const loginCaptcha = document.getElementById("login-captcha");
            const regCaptcha = document.getElementById("register-captcha");
            if (loginCaptcha && loginCaptcha.children.length > 0) turnstile.reset(loginCaptcha);
            if (regCaptcha && regCaptcha.children.length > 0) turnstile.reset(regCaptcha);
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
                loginEmail.setSelectionRange(0, 0);
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
                regUsername.setSelectionRange(0, 0);
            }, 50);
        }
    }
}

function closeAuthModal() {
    authModal.classList.add("hidden");
    loginForm.reset();
    registerForm.reset();
    
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
        if (loginCaptcha) turnstile.reset(loginCaptcha);
        if (regCaptcha) turnstile.reset(regCaptcha);
    }
}

// Modal tab listeners
tabLogin.addEventListener("click", () => showAuthModal("login"));
tabRegister.addEventListener("click", () => showAuthModal("register"));

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
        
        authSuccess.textContent = "LOGGED IN! LOADING STAGE...";
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
            authSuccess.textContent = "ACCOUNT CREATED! ENTERING STAGE...";
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
    const age = Date.now() - new Date(post.createdAt).getTime();
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
        
        // Remove any floating items that are no longer present in activePosts (keep local mock logs)
        floatingItems = floatingItems.filter(item => item.post.id.startsWith("local_") || activePosts.some(post => post.id === item.post.id));

        // Re-align floatingItems array: add any logs that are present in activePosts but missing on screen
        activePosts.forEach((post) => {
            const exists = floatingItems.some(item => item.post.id === post.id);
            if (!exists) {
                const newItem = new FloatingItem(post);
                floatingItems.push(newItem);
                
                // Play splash sound if page is loaded and it's not a historical post
                if (isPageLoaded && Date.now() - new Date(post.createdAt).getTime() < 5000) {
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
        alert(err.message.toUpperCase());
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

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener("click", async () => {
    // If we click a hovered item, navigate directly to its link in a new tab
    if (hoveredItem) {
        const clickedPostId = hoveredItem.post.id;
        if (clickedPostId.startsWith("local_")) {
            // Local advertisement log: dynamically increment clicks of an actual database row to trigger global statistics update
            const targetPost = databasePosts.find(p => p.url.includes("fugaea.com") || p.username === "fugaea") || databasePosts[0];
            if (targetPost) {
                await db.incrementClicks(targetPost.id);
            }
        } else {
            await db.incrementClicks(clickedPostId);
        }
        
        window.open(hoveredItem.post.url, "_blank");
    }
});

inspectClose.addEventListener("click", () => {
    sound.playBleep();
    inspectHud.classList.add("hidden");
    selectedItem = null;
});

inspectLink.addEventListener("click", () => {
    sound.playBleep();
    // Automatically close the inspector HUD when the link is clicked
    inspectHud.classList.add("hidden");
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
    supabase
        .channel('public:posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async (payload) => {
            await syncDatabasePosts();
        })
        .subscribe();

    // Listen for statistics changes (for real-time total clicks counter updates)
    supabase
        .channel('public:statistics')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'statistics', filter: 'key=eq.total_clicks' }, (payload) => {
            console.log("[Realtime Statistics Update] Payload:", payload);
            const val = payload.new ? Number(payload.new.value) : 0;
            if (hudTotalViews) {
                hudTotalViews.textContent = val.toLocaleString();
            }
        })
        .subscribe();

    // Fallback sync every 60 seconds just in case of connection fluctuations
    setInterval(syncDatabasePosts, 60000);
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
            "1.98": "https://buy.stripe.com/00w9AL8hZ3lS1CYap2d7q01",
            "9.90": "https://buy.stripe.com/8x2aEP9m39Kgbdybt6d7q02"
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

// --- NEW BUTTON EVENT LISTENERS ---

if (regResendEmailBtn) {
    regResendEmailBtn.addEventListener("click", async () => {
        sound.playBleep();
        const email = document.getElementById("reg-email").value;
        if (!email) {
            alert("EMAIL IS REQUIRED TO RESEND VERIFICATION!");
            return;
        }
        try {
            regResendEmailBtn.disabled = true;
            regResendEmailBtn.textContent = "SENDING...";
            await auth.resendVerification(email);
            alert("VERIFICATION EMAIL RESENT! CHECK YOUR INBOX.");
            sound.playSuccess();
        } catch (err) {
            alert(err.message.toUpperCase());
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
                alert("EMAIL NOT YET VERIFIED. PLEASE CHECK YOUR INBOX AND CLICK THE CONFIRMATION LINK.");
            }
        } catch (err) {
            alert(err.message.toUpperCase());
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
        const shareText = encodeURIComponent("Welcome to Fugaea. Register for 10 free links!");
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
        const shareTitle = encodeURIComponent("Welcome to Fugaea. Register for 10 free links!");
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
        newItem.virtualX = Math.random() * (2000 - 250) + 50;
        newItem.virtualVx = -2.0 * newItem.speedFactor; // start drift velocity
        
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

if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", async () => {
        sound.playBleep();
        const user = auth.getCurrentUser();
        if (!user) return;

        const confirmationText = `CONFIRM ACCOUNT CLOSURE:\n\nARE YOU SURE YOU WANT TO CLOSE YOUR ACCOUNT?\n\nTHIS WILL DEACTIVATE YOUR SESSION AND PERMANENTLY QUEUE DELETION FOR:\n- USERNAME: ${user.username.toUpperCase()}\n- EMAIL: ${user.email.toUpperCase()}\n\nIF DBL-CONFIRMED, WE WILL ATTEMPT TO AUTO-DELETE YOUR DATABASE PROFILE DATA AND LOG YOU OUT IMMEDIATELY.`;
        if (confirm(confirmationText)) {
            try {
                // Try to delete profile row (triggers cascade deletion of user posts in DB)
                const { error: deleteError } = await supabase.from('profiles').delete().eq('id', user.id);
                if (deleteError) {
                    console.warn("Client-side direct profile deletion blocked by RLS:", deleteError);
                    
                    // Generate mailto link for support email fallback if RLS or Auth API blocks it
                    const subject = encodeURIComponent(`Close Account Request - ${user.username}`);
                    const body = encodeURIComponent(`Hello Support,\n\nPlease close my account and permanently delete all associated data for my username '${user.username}' and email '${user.email}'.\n\nThank you.`);
                    const mailtoUrl = `mailto:support@fugaea.com?subject=${subject}&body=${body}`;
                    
                    alert(`NOTICE:\n\nBECAUSE OF DATABASE SECURITY POLICIES, YOUR ACCOUNT CLOSURE MUST BE CONFIRMED BY SUPPORT.\n\nAN EMAIL CLIENT WILL NOW OPEN TO SEND A DELETION REQUEST FROM '${user.email.toUpperCase()}' TO support@fugaea.com.\n\nIF NOTHING HAPPENS, PLEASE EMAIL support@fugaea.com MANUALLY WITH THE SUBJECT 'CLOSE ACCOUNT' FROM YOUR REGISTERED EMAIL ADDRESS.`);
                    window.location.href = mailtoUrl;
                } else {
                    // Success!
                    await auth.signOut();
                    alert("SUCCESS:\n\nYOUR PROFILE DATA HAS BEEN REMOVED. LOGGING OUT...");
                    window.location.reload();
                }
            } catch (err) {
                console.error("Account deletion failed:", err);
                alert("ERROR: COULD NOT INITIATE ACCOUNT DELETION. PLEASE TRY AGAIN OR EMAIL support@fugaea.com.");
            }
        }
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
    const currentEpochBlock = Math.floor(Date.now() / intervalMs);
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
            text: "welcome to fugaea. see and share website links.",
            url: "https://www.youtube.com/watch?v=ekexQdTwkak&list=RDekexQdTwkak&start_radio=1"
        };
        const newItem = new FloatingItem(post);
        floatingItems.push(newItem);
    }
}

initApp();
renderLoop();
