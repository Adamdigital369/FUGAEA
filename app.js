// --- 8-BIT RETRO RIVER MAIN APPLICATION ---
import * as auth from "./auth.js";
import * as db from "./db.js";

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
let databasePosts = [];
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

        ctx.fillStyle = "rgba(255, 255, 255, 0.28)"; // Shiny silver/white ripples
        ctx.fillRect(Math.floor(actualX), Math.floor(actualY), Math.ceil(actualLength), 4);
    }
}

// Initial waves (increased for more active current lines)
const waveParticles = Array.from({ length: 70 }, (_, i) => new Wave(i));

// Floating items class mapping data rows
class FloatingItem {
    constructor(post) {
        this.post = post;
        this.createdAtTime = new Date(post.createdAt).getTime();
        
        // Size
        const spriteMeta = SPRITES[post.sprite] || SPRITES.log;
        this.width = spriteMeta.width * SPRITE_PIXEL_SCALE;
        this.height = spriteMeta.height * SPRITE_PIXEL_SCALE;

        // Seeded random for deterministic attributes per log
        const rand = seededRandom(post.id);
        this.yPercent = rand();
        this.bobOffset = rand() * Math.PI * 2;
        this.bobSpeed = 0.001 + rand() * 0.0015; // Slow bob speed for time-based animation
        this.speedFactor = 0.8 + rand() * 0.4;   // Speed variation (0.8x to 1.2x)
        this.hasBranch = true;

        // Position - computed dynamically in update()
        this.virtualX = 2000;
        this.x = canvas.width + 100;
        this.y = 0;
        this.currentBob = 0;
        this.isHovered = false;

        // Splash effect for brand new logs dropped in
        // If created in the last 2.5 seconds, display a splash
        this.splashProgress = (Date.now() - this.createdAtTime < 2500) ? 0.0 : 1.0;
        
        this.hasEnteredScreen = false;
    }

    update(t) {
        const VIRTUAL_WIDTH = 2000;
        const travelSpan = VIRTUAL_WIDTH + 300; // starts at 2000, goes to -100
        const baseSpeed = 0.09; // virtual units per millisecond (about 90px/sec)
        
        let age = t - this.createdAtTime;
        if (age < 0) age = 0;
        
        const progress = ( (age * baseSpeed * this.speedFactor) / travelSpan ) % 1.0;
        const newVirtualX = VIRTUAL_WIDTH - progress * travelSpan;
        
        // Detect wrap-around to play exit sound and reset entry flag
        if (newVirtualX > this.virtualX + 100) {
            this.hasEnteredScreen = false;
            if (isPageLoaded) {
                sound.playLeftExit();
            }
        }
        
        this.virtualX = newVirtualX;
        this.x = (this.virtualX / VIRTUAL_WIDTH) * canvas.width;
        
        // Bobbing animation based on absolute time
        const currentBobPhase = this.bobOffset + (t * this.bobSpeed);
        this.currentBob = Math.sin(currentBobPhase) * 6;
        
        if (this.splashProgress < 1.0) {
            this.splashProgress += 0.04;
        }

        // Calculate actual y position dynamically to keep logs in river bounds on resize
        const riverTop = Math.floor(canvas.height * 0.46);
        const riverBottom = Math.floor(canvas.height * 0.72);
        this.y = riverTop + 4 + this.yPercent * (riverBottom - riverTop - this.height - 8);

        // Trigger positive sound when it slides into the screen from the right
        if (!this.hasEnteredScreen && this.x <= canvas.width) {
            this.hasEnteredScreen = true;
            if (isPageLoaded) {
                sound.playRightEnter();
            }
        }
    }

    draw() {
        const drawX = Math.floor(this.x);
        const drawY = Math.floor(this.y + this.currentBob);
        const spriteMeta = SPRITES[this.post.sprite] || SPRITES.log;

        // Draw selection box outline if hovered
        if (this.isHovered) {
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
            ctx.lineWidth = 3;
            
            // Expand selection boundary to cover username, branch, and log with a buffer
            const topOffset = this.hasBranch ? 49 : 32;
            const bottomOffset = 8;
            const sideOffset = 15;
            
            ctx.strokeRect(drawX - sideOffset, drawY - topOffset, this.width + sideOffset * 2, this.height + topOffset + bottomOffset);
            
            ctx.fillStyle = "rgba(0, 255, 255, 0.1)";
            ctx.fillRect(drawX - sideOffset, drawY - topOffset, this.width + sideOffset * 2, this.height + topOffset + bottomOffset);
        }

        // Splash effect for brand new logs dropped in
        if (this.splashProgress < 1.0) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            const radius = (1 - this.splashProgress) * 40;
            ctx.fillRect(drawX + this.width/2 - radius/2, drawY + this.height/2 - radius/2, radius, radius);
        }

        // Render the 8-bit sprite matrix (straight)
        const grid = spriteMeta.grid;
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const colorCode = grid[r][c];
                if (colorCode !== 0) {
                    ctx.fillStyle = spriteMeta.palette[colorCode];
                    ctx.fillRect(
                        drawX + c * SPRITE_PIXEL_SCALE, 
                        drawY + r * SPRITE_PIXEL_SCALE, 
                        Math.ceil(SPRITE_PIXEL_SCALE), 
                        Math.ceil(SPRITE_PIXEL_SCALE)
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
                    drawX + bx * SPRITE_PIXEL_SCALE,
                    drawY + by * SPRITE_PIXEL_SCALE,
                    Math.ceil(SPRITE_PIXEL_SCALE),
                    Math.ceil(SPRITE_PIXEL_SCALE)
                );
            });

            // Medium green leaf clusters
            ctx.fillStyle = "#2b792b";
            const medLeaves = [[9,-2], [9,-3], [10,-3], [14,-3], [14,-4], [15,-3]];
            medLeaves.forEach(([bx, by]) => {
                ctx.fillRect(
                    drawX + bx * SPRITE_PIXEL_SCALE,
                    drawY + by * SPRITE_PIXEL_SCALE,
                    Math.ceil(SPRITE_PIXEL_SCALE),
                    Math.ceil(SPRITE_PIXEL_SCALE)
                );
            });

            // Light green highlight leaves
            ctx.fillStyle = "#3fb23f";
            const lightLeaves = [[11,-4], [12,-4], [13,-4], [12,-5]];
            lightLeaves.forEach(([bx, by]) => {
                ctx.fillRect(
                    drawX + bx * SPRITE_PIXEL_SCALE,
                    drawY + by * SPRITE_PIXEL_SCALE,
                    Math.ceil(SPRITE_PIXEL_SCALE),
                    Math.ceil(SPRITE_PIXEL_SCALE)
                );
            });
        }

        // Draw username text tag above the item (push higher if log has branches to avoid overlap)
        ctx.fillStyle = this.isHovered ? "#ffcc00" : "#ffffff";
        ctx.font = "18px VT323";
        ctx.textAlign = "center";
        
        // Draw black border around text for readability
        const label = `@${this.post.username}`;
        const textX = Math.floor(drawX + this.width / 2);
        const textY = drawY - (this.hasBranch ? 25 : 8);
        
        ctx.fillStyle = "#000000";
        ctx.fillText(label, textX - 2, textY - 2);
        ctx.fillText(label, textX + 2, textY - 2);
        ctx.fillText(label, textX - 2, textY + 2);
        ctx.fillText(label, textX + 2, textY + 2);
        
        ctx.fillStyle = this.isHovered ? "#ffcc00" : "#ffffff";
        ctx.fillText(label, textX, textY);
    }

    checkCollision(mx, my) {
        const drawY = this.y + this.currentBob;
        const topOffset = this.hasBranch ? 49 : 32;
        const bottomOffset = 8;
        const sideOffset = 15;
        
        return (
            mx >= this.x - sideOffset && 
            mx <= this.x + this.width + sideOffset && 
            my >= drawY - topOffset && 
            my <= drawY + this.height + bottomOffset
        );
    }
}

// --- RIVER ANIMATION LOOP ---
function renderLoop() {
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

    // Update & draw waves
    waveParticles.forEach(w => {
        w.update(now);
        w.draw();
    });

    // Update & draw floating items
    let currentHover = null;
    for (let i = floatingItems.length - 1; i >= 0; i--) {
        if (floatingItems[i].checkCollision(mouseX, mouseY)) {
            currentHover = floatingItems[i];
            break;
        }
    }

    floatingItems.forEach(item => {
        item.isHovered = (item === currentHover);
        item.update(now);
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
const hudItemCount = document.getElementById("hud-item-count");
const hudOnlineUsers = document.getElementById("hud-online-users");
const hudTotalViews = document.getElementById("hud-total-views");
const hudCreditsContainer = document.getElementById("hud-credits-container");
const hudCredits = document.getElementById("hud-credits");
const buyCreditsTrigger = document.getElementById("buy-credits-trigger");

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

const checkoutModal = document.getElementById("checkout-modal");
const checkoutClose = document.getElementById("checkout-close");
const paymentForm = document.getElementById("payment-form");
const checkoutSuccess = document.getElementById("checkout-success");
const checkoutError = document.getElementById("checkout-error");
const paySubmitBtn = document.getElementById("pay-submit-btn");

const postText = document.getElementById("post-text");
const tossForm = document.getElementById("toss-form");

function updateAuthStateUI() {
    const user = auth.getCurrentUser();
    
    // Show credits container at all times
    if (hudCreditsContainer) {
        hudCreditsContainer.classList.remove("hidden");
    }

    if (user) {
        hudUser.textContent = user.username.toUpperCase();
        hudUser.className = "text-green";
        authTriggerBtn.innerHTML = 'LOGOUT';
        submitSection.classList.remove("hidden");
        if (guestPromptSection) guestPromptSection.classList.add("hidden");
        
        hudCredits.textContent = user.credits;

        // Auto-fill username in text box
        postText.value = `@${user.username}`;
    } else {
        hudUser.textContent = "GUEST";
        hudUser.className = "";
        authTriggerBtn.innerHTML = 'LOGIN / REGISTER';
        submitSection.classList.add("hidden");
        if (guestPromptSection) guestPromptSection.classList.remove("hidden");
        
        hudCredits.textContent = "0";
    }
}

function showAuthModal(mode = "login") {
    authModal.classList.remove("hidden");
    authError.classList.add("hidden");
    authSuccess.classList.add("hidden");
    if (typeof grecaptcha !== "undefined") {
        grecaptcha.reset();
    }
    
    if (mode === "login") {
        modalTitle.textContent = "USER";
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
    } else {
        modalTitle.textContent = "CREATE USER";
        tabLogin.classList.remove("active");
        tabRegister.classList.add("active");
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
    }
}

function closeAuthModal() {
    authModal.classList.add("hidden");
    loginForm.reset();
    registerForm.reset();
    if (typeof grecaptcha !== "undefined") {
        grecaptcha.reset();
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

// Submit login
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");
    
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;

    try {
        await auth.signIn(email, pass);
        authSuccess.textContent = "LOGGED IN! LOADING STAGE...";
        authSuccess.classList.remove("hidden");
        sound.playSuccess();
        setTimeout(() => {
            closeAuthModal();
            updateAuthStateUI();
        }, 1000);
    } catch (err) {
        authError.textContent = err.message.toUpperCase();
        authError.classList.remove("hidden");
    }
});

// Submit registration
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");

    // Check reCAPTCHA verification token
    const captchaResponse = (typeof grecaptcha !== "undefined") ? grecaptcha.getResponse() : "";
    if (!captchaResponse) {
        authError.textContent = "PLEASE COMPLETE THE RECAPTCHA CHALLENGE";
        authError.classList.remove("hidden");
        return;
    }

    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const pass = document.getElementById("reg-password").value;

    try {
        await auth.signUp(email, pass, username);
        authSuccess.textContent = "ACCOUNT CREATED! ENTERING STAGE...";
        authSuccess.classList.remove("hidden");
        sound.playSuccess();
        setTimeout(() => {
            closeAuthModal();
            updateAuthStateUI();
        }, 1000);
    } catch (err) {
        authError.textContent = err.message.toUpperCase();
        authError.classList.remove("hidden");
        if (typeof grecaptcha !== "undefined") {
            grecaptcha.reset();
        }
    }
});

// --- POPULATE FLOATING ITEMS ---
async function syncDatabasePosts() {
    try {
        const posts = await db.getPosts();
        databasePosts = posts;
        hudItemCount.textContent = posts.length;
        
        // Remove any floating items that are no longer present in databasePosts
        floatingItems = floatingItems.filter(item => posts.some(post => post.id === item.post.id));

        // Re-align floatingItems array: add any logs that are present in databasePosts but missing on screen
        posts.forEach((post) => {
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
    
    try {
        const user = auth.getCurrentUser();
        if (!user) throw new Error("MUST BE LOGGED IN");

        if (user.credits < 1) {
            throw new Error("OUT OF CREDITS! CLICK '+BUY' IN THE HUD TO GET 100 LINKS.");
        }

        // Deduct 1 credit
        await auth.deductCredit(user.id);

        await db.addPost({
            username: user.username,
            text: textVal,
            url: urlVal,
            sprite: spriteVal
        });

        // Clear only URL field so they can post again with their username
        document.getElementById("post-url").value = "";
        
        // Refresh auth state UI to update credit display immediately
        updateAuthStateUI();

        // Force database reload
        await syncDatabasePosts();
    } catch (err) {
        alert(err.message.toUpperCase());
    }
});



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

canvas.addEventListener("click", () => {
    // If we click a hovered item, navigate directly to its link in a new tab
    if (hoveredItem) {
        sound.playCoin();
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



// --- INITIALIZATION ---
async function initApp() {
    updateAuthStateUI();
    
    // Initial sync
    await syncDatabasePosts();
    
    // Handle Total Views
    let totalViews = parseInt(localStorage.getItem("retro_river_views") || "0", 10);
    totalViews += 1;
    localStorage.setItem("retro_river_views", totalViews.toString());
    if (hudTotalViews) hudTotalViews.textContent = totalViews;

    // Handle Fluctuation of Online Users
    let onlineUsers = Math.floor(Math.random() * 5) + 3; // Start between 3 and 7
    if (hudOnlineUsers) hudOnlineUsers.textContent = onlineUsers;

    setInterval(() => {
        // Change online count slightly by -1, 0, or +1
        const delta = Math.floor(Math.random() * 3) - 1;
        onlineUsers = Math.max(2, Math.min(15, onlineUsers + delta)); // keep between 2 and 15
        if (hudOnlineUsers) hudOnlineUsers.textContent = onlineUsers;
    }, 4000);

    // Poll for updates every 5 seconds to load posts tossed by other users (or simulated users)
    setInterval(syncDatabasePosts, 5000);
}

// --- CHECKOUT / MICROTRANSACTION SYSTEM ---
function showCheckoutModal() {
    checkoutModal.classList.remove("hidden");
    checkoutSuccess.classList.add("hidden");
    checkoutError.classList.add("hidden");
}

function closeCheckoutModal() {
    checkoutModal.classList.add("hidden");
    paymentForm.reset();
}

buyCreditsTrigger.addEventListener("click", () => {
    sound.playBleep();
    const user = auth.getCurrentUser();
    if (user) {
        showCheckoutModal();
    } else {
        alert("PLEASE LOGIN OR REGISTER TO BUY CREDITS!");
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
        paySubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSING...';
        
        // Call auth layer to add 100 credits
        await auth.addCredits(user.id, 100);
        
        sound.playSuccess();
        checkoutSuccess.textContent = "PAYMENT SUCCESSFUL! 100 LINKS ADDED.";
        checkoutSuccess.classList.remove("hidden");
        
        setTimeout(() => {
            closeCheckoutModal();
            updateAuthStateUI();
            paySubmitBtn.disabled = false;
            paySubmitBtn.innerHTML = '<i class="fas fa-lock"></i> SECURE PAY $0.99';
        }, 1500);
    } catch (err) {
        checkoutError.textContent = err.message.toUpperCase();
        checkoutError.classList.remove("hidden");
        paySubmitBtn.disabled = false;
        paySubmitBtn.innerHTML = '<i class="fas fa-lock"></i> SECURE PAY $0.99';
    }
});

initApp();
renderLoop();
