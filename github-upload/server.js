process.on('uncaughtException', (err) => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    console.warn(`\x1b[33m[NETWORK]\x1b[0m ${reason?.message || reason}`);
});

const { TikTokLiveConnection, WebcastPushConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const LiveConnector = TikTokLiveConnection || WebcastPushConnection;
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const PORT = 3000;
const app = express();

// Middleware: รองรับทั้ง JSON และ form-urlencoded (ที่ Garry's Mod http.Post ใช้งาน)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (fs.existsSync(path.join(__dirname, 'public'))) {
    app.use(express.static(path.join(__dirname, 'public')));
}

// -------------------------------------------------------------
// ระบบจัดการและจดจำชื่อ TIKTOK USERNAME
// -------------------------------------------------------------
function cleanUsername(str) {
    if (!str) return 'valkyrietoyota';
    return String(str).replace(/\s+/g, '').replace(/^@/, '').trim();
}

function loadConfiguredUsername() {
    // 1. จาก Argument เช่น node server.js myusername
    if (process.argv[2] && process.argv[2].trim() !== '') {
        return cleanUsername(process.argv[2]);
    }
    // 2. จาก Environment Variable
    if (process.env.TIKTOK_USERNAME && process.env.TIKTOK_USERNAME.trim() !== '') {
        return cleanUsername(process.env.TIKTOK_USERNAME);
    }
    // 3. จาก bridge_config.json ภายในโฟลเดอร์เซิร์ฟเวอร์
    try {
        const cfgPath = path.join(__dirname, 'bridge_config.json');
        if (fs.existsSync(cfgPath)) {
            const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (data.tiktok_username && data.tiktok_username.trim() !== '') {
                return cleanUsername(data.tiktok_username);
            }
        }
    } catch (e) {}
    // 4. จาก Garry's Mod data folder ถ้ามี
    try {
        const gmodPaths = [
            'C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod\\garrysmod\\data\\tiktok_battle_config.json',
            path.join(__dirname, '..', '..', 'data', 'tiktok_battle_config.json'),
            path.join(__dirname, '..', 'gmod-addon', 'data', 'tiktok_battle_config.json')
        ];
        for (const p of gmodPaths) {
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (data.tiktok_username && data.tiktok_username.trim() !== '') {
                    return cleanUsername(data.tiktok_username);
                }
            }
        }
    } catch (e) {}

    return 'valkyrietoyota';
}

function saveConfiguredUsername(user) {
    try {
        const clean = cleanUsername(user);
        const cfgPath = path.join(__dirname, 'bridge_config.json');
        fs.writeFileSync(cfgPath, JSON.stringify({ tiktok_username: clean }, null, 2), 'utf8');
    } catch (e) {}
}

let TIKTOK_USERNAME = loadConfiguredUsername();

let overlayClients = [];
let currentBattleRules = [
    { name: "Rebel Follower", trigger: "follow", value: "1", faction: "rebel", npc: "npc_citizen", count: 1 },
    { name: "Civil Protection", trigger: "like", value: "20", faction: "combine", npc: "npc_metropolice", count: 1 },
    { name: "Combine Soldier", trigger: "like", value: "50", faction: "combine", npc: "npc_combine_s", count: 1 },
    { name: "Hero Barney Calhoun", trigger: "gift", value: "heart", faction: "rebel", npc: "npc_barney", count: 1 },
    { name: "Hero Alyx Vance", trigger: "gift", value: "ice cream", faction: "rebel", npc: "npc_alyx", count: 1 },
    { name: "Dropship Combat APC", trigger: "gift", value: "doughnut", faction: "combine", npc: "dropship_apc", count: 1 },
    { name: "Dropship Strider Boss", trigger: "gift", value: "falcon", faction: "combine", npc: "dropship_strider", count: 1 },
    { name: "Dropship Strider + Hunters", trigger: "gift", value: "whale", faction: "combine", npc: "dropship_strider_hunter", count: 1 }
];
let currentTeamConfig = {
    ally_name: "กบฏ ANTICITIZEN",
    enemy_name: "คอมบายน์ COMBINE"
};

function broadcastOverlay(eventData) {
    const msg = `data: ${JSON.stringify(eventData)}\n\n`;
    overlayClients.forEach(client => {
        try { client.write(msg); } catch (e) {}
    });
}

let actionQueue = [];
let tiktokLive = null;
let connectionState = {
    connected: false,
    roomId: null,
    connecting: false,
    lastError: null
};

// -------------------------------------------------------------
// DUAL-BRIDGE: ระบบเชื่อมต่อตรงกับ Garry's Mod ผ่าน Data Folder
// ทำงานได้ 100% ทันที โดยไม่ต้องพึ่งพา -allowlocalhttp ใน Steam
// -------------------------------------------------------------
function findGmodDataDir() {
    const candidates = [
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod\\garrysmod\\data',
        path.resolve(__dirname, '..', '..', 'data'),
        path.resolve(__dirname, '..', 'gmod-addon', 'data')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

const gmodDataDir = findGmodDataDir();

function syncStatusToFileBridge() {
    if (!gmodDataDir) return;
    try {
        const statusFile = path.join(gmodDataDir, 'tiktok_battle_bridge_status.json');
        const payload = {
            status: 'online',
            target_username: TIKTOK_USERNAME,
            is_connected: connectionState.connected,
            is_connecting: connectionState.connecting,
            room_id: connectionState.roomId,
            total_session_likes: totalSessionLikes,
            queue_size: actionQueue.length,
            timestamp: Math.floor(Date.now() / 1000)
        };
        fs.writeFileSync(statusFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {}
}

function syncToFileBridge() {
    if (!gmodDataDir || actionQueue.length === 0) return;
    try {
        const actionsFile = path.join(gmodDataDir, 'tiktok_battle_actions.json');
        let existing = [];
        if (fs.existsSync(actionsFile)) {
            try {
                const raw = fs.readFileSync(actionsFile, 'utf8');
                existing = JSON.parse(raw);
                if (!Array.isArray(existing)) existing = [];
            } catch (e) {
                existing = [];
            }
        }
        const combined = existing.concat(actionQueue);
        actionQueue = []; // ส่งผ่านไฟล์ให้ GMod นำไปเสกทันที
        fs.writeFileSync(actionsFile, JSON.stringify(combined, null, 2), 'utf8');
        console.log(`\x1b[36m[FILE BRIDGE]\x1b[0m 📁 ส่งคำสั่งเสก ${combined.length} รายการเข้าสู่เกมผ่าน garrysmod/data เรียบร้อย`);
    } catch (e) {
        console.warn(`[FILE BRIDGE WARNING] ${e.message}`);
    }
}

function queueAction(item) {
    actionQueue.push(item);
    syncToFileBridge();
    syncStatusToFileBridge();
}

// ตรวจสอบคำสั่งเชื่อมต่อจากเกมและอัปเดตสถานะทุกๆ 1 วินาที
setInterval(() => {
    syncStatusToFileBridge();

    if (gmodDataDir) {
        try {
            const cmdFile = path.join(gmodDataDir, 'tiktok_battle_connect_cmd.json');
            if (fs.existsSync(cmdFile)) {
                const raw = fs.readFileSync(cmdFile, 'utf8');
                fs.unlinkSync(cmdFile);
                const data = JSON.parse(raw);
                if (data.username && cleanUsername(data.username) !== TIKTOK_USERNAME) {
                    console.log(`\x1b[35m[FILE BRIDGE]\x1b[0m ได้รับคำสั่งเชื่อมต่อชื่อใหม่จากเกม: @${data.username}`);
                    setupTikTokConnection(data.username);
                }
            }
        } catch (e) {}
    }
}, 1000);

// ตัวแปรสะสมจำนวนไลก์
let totalSessionLikes = 0;
let likesCP = 0;           // ทุก 20 ไลก์ -> Civil Protection
let likesSoldierSMG = 0;   // ทุก 50 ไลก์ -> Standard Soldier (SMG)
let likesSoldierAR2 = 0;   // ทุก 75 ไลก์ -> Standard Soldier (AR2)
let likesShotgun = 0;      // ทุก 100 ไลก์ -> Shotgun Soldier

// ตัวแปรสะสมแต้มรวมของคนดูทั้งไลฟ์ (Community Event) เพื่อเรียก Dropship กำลังเสริม
let communityEngagementScore = 0;
const COMMUNITY_DROPSHIP_THRESHOLD = 250;
const communityDropshipCycle = ['spawn_dropship_cp', 'spawn_dropship_squad', 'spawn_dropship_apc'];
let currentCycleIndex = 0;

function addCommunityPoints(points, lastUser) {
    communityEngagementScore += points;
    while (communityEngagementScore >= COMMUNITY_DROPSHIP_THRESHOLD) {
        const eventAction = communityDropshipCycle[currentCycleIndex];
        currentCycleIndex = (currentCycleIndex + 1) % communityDropshipCycle.length;

        console.log(`\x1b[45m[COMMUNITY EVENT]\x1b[0m พลังผู้ชมรวมครบ ${COMMUNITY_DROPSHIP_THRESHOLD}! เรียกยาน ${eventAction}`);
        queueAction({
            action: eventAction,
            sender: `${lastUser} & Viewers`,
            detail: 'Community Dropship Event'
        });
        communityEngagementScore -= COMMUNITY_DROPSHIP_THRESHOLD;
    }
}

let retryTimeout = null;
const recentFollowCache = new Map(); // ป้องกันการส่ง Follow ซ้ำซ้อนภายใน 5 วินาที

function setupTikTokConnection(username) {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }

    if (tiktokLive) {
        try {
            tiktokLive.removeAllListeners();
            tiktokLive.disconnect();
        } catch (e) {}
        tiktokLive = null;
    }

    TIKTOK_USERNAME = cleanUsername(username);
    saveConfiguredUsername(TIKTOK_USERNAME);

    connectionState.connecting = true;
    connectionState.connected = false;
    connectionState.roomId = null;
    connectionState.lastError = null;

    console.log(`\x1b[36m[TikTok-Bridge]\x1b[0m 🔄 กำลังเชื่อมต่อกับ: @${TIKTOK_USERNAME}...`);

    try {
        tiktokLive = new LiveConnector(TIKTOK_USERNAME, {
            processInitialData: false,
            enableExtendedGiftInfo: false,
            webClientOptions: {
                timeout: { request: 15000 }
            },
            wsClientOptions: {
                handshakeTimeout: 15000
            }
        });
    } catch (err) {
        console.error(`\x1b[31m[ERROR]\x1b[0m ไม่สามารถสร้าง Object TikTok Connector ได้: ${err.message}`);
        connectionState.connecting = false;
        connectionState.lastError = err.message;
        return;
    }

    tiktokLive.connect().then(state => {
        connectionState.connected = true;
        connectionState.connecting = false;
        connectionState.roomId = state.roomId;
        connectionState.lastError = null;
        console.log(`\x1b[32m[TikTok Live] ✅ เชื่อมต่อสำเร็จ! Room ID: ${state.roomId} (@${TIKTOK_USERNAME})\x1b[0m`);
        broadcastOverlay({
            type: 'init',
            username: TIKTOK_USERNAME,
            totalLikes: totalSessionLikes,
            rules: currentBattleRules,
            teamConfig: currentTeamConfig
        });
    }).catch(err => {
        connectionState.connected = false;
        connectionState.connecting = false;
        connectionState.lastError = err.message || 'Offline';
        console.warn(`\x1b[33m[TikTok Live] ⏳ รอสัญญาณถ่ายทอดสดจาก @${TIKTOK_USERNAME} (${err.message}) - กำลังตรวจจับอัตโนมัติ...\x1b[0m`);
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
            if (!connectionState.connected && TIKTOK_USERNAME) {
                setupTikTokConnection(TIKTOK_USERNAME);
            }
        }, 10000);
    });

    tiktokLive.on('disconnected', () => {
        connectionState.connected = false;
        console.log(`\x1b[31m[TikTok Live] หลุดจากการเชื่อมต่อ กำลังลองใหม่ใน 5 วินาที...\x1b[0m`);
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
            if (!connectionState.connected && TIKTOK_USERNAME) {
                setupTikTokConnection(TIKTOK_USERNAME);
            }
        }, 5000);
    });

    tiktokLive.on('error', (err) => {
        connectionState.lastError = err.message;
    });

    // 1. กดติดตาม (Follow)
    const handleFollow = (data) => {
        const sender = data.user?.uniqueId || data.uniqueId || data.user?.nickname || data.nickname || 'Citizen';
        const now = Date.now();
        if (recentFollowCache.has(sender) && (now - recentFollowCache.get(sender) < 5000)) {
            return;
        }
        recentFollowCache.set(sender, now);

        console.log(`\x1b[32m[+FOLLOW]\x1b[0m @${sender} -> เสก Anticitizen (Rebel)`);
        queueAction({
            action: 'spawn_anticitizen',
            sender: sender,
            detail: 'Follower'
        });
        broadcastOverlay({ type: 'follow', sender: sender });
        addCommunityPoints(15, sender);
    };

    tiktokLive.on('follow', handleFollow);
    tiktokLive.on('social', (data) => {
        const actionType = String(data.action || data.displayType || '').toLowerCase();
        if (actionType.includes('follow') || actionType.includes('ติดตาม')) {
            handleFollow(data);
        } else if (actionType.includes('share') || actionType.includes('แชร์')) {
            const sender = data.user?.uniqueId || data.uniqueId || 'Supporter';
            console.log(`\x1b[35m[SHARE]\x1b[0m @${sender} แชร์ไลฟ์สตรีม!`);
            queueAction({
                action: 'share',
                sender: sender,
                detail: 'Shared Live'
            });
            addCommunityPoints(25, sender);
        }
    });

    // 2. แชท / คอมเมนต์ (Chat)
    tiktokLive.on('chat', (data) => {
        const sender = data.user?.uniqueId || data.uniqueId || data.user?.nickname || data.nickname || 'Viewer';
        const comment = (data.comment || '').trim().toLowerCase();

        if (comment === '1' || comment.includes('กบฏ') || comment.includes('rebel') || comment.includes('แดง') || comment.includes('red')) {
            console.log(`\x1b[32m[CHAT REBEL]\x1b[0m @${sender}: "${data.comment}" -> เสก Anticitizen`);
            queueAction({
                action: 'spawn_anticitizen',
                sender: sender,
                detail: `Chat [${data.comment}]`
            });
            broadcastOverlay({ type: 'chat', sender: sender, team: 'rebel', comment: data.comment });
            addCommunityPoints(5, sender);
        } else if (comment === '2' || comment.includes('คอมบายน์') || comment.includes('combine') || comment.includes('น้ำเงิน') || comment.includes('blue')) {
            console.log(`\x1b[34m[CHAT COMBINE]\x1b[0m @${sender}: "${data.comment}" -> เสก Combine Soldier`);
            queueAction({
                action: 'spawn_soldier_smg',
                sender: sender,
                detail: `Chat [${data.comment}]`
            });
            broadcastOverlay({ type: 'chat', sender: sender, team: 'combine', comment: data.comment });
            addCommunityPoints(5, sender);
        }
    });

    // 3. กดใจ (Like)
    tiktokLive.on('like', (data) => {
        const sender = data.user?.uniqueId || data.uniqueId || data.user?.nickname || data.nickname || 'Viewer';
        const count = data.likeCount || 1;

        totalSessionLikes += count;
        broadcastOverlay({ type: 'like', totalLikes: totalSessionLikes, sender: sender, count: count });
        likesCP += count;
        likesSoldierSMG += count;
        likesSoldierAR2 += count;
        likesShotgun += count;

        while (likesCP >= 20) {
            queueAction({ action: 'spawn_cp', sender, detail: '20 Likes' });
            likesCP -= 20;
            console.log(`\x1b[34m[LIKES 20]\x1b[0m @${sender} -> เสก Civil Protection`);
        }
        while (likesSoldierSMG >= 50) {
            queueAction({ action: 'spawn_soldier_smg', sender, detail: '50 Likes [SMG]' });
            likesSoldierSMG -= 50;
            console.log(`\x1b[34m[LIKES 50]\x1b[0m @${sender} -> เสก Combine Soldier (SMG)`);
        }
        while (likesSoldierAR2 >= 75) {
            queueAction({ action: 'spawn_soldier_ar2', sender, detail: '75 Likes [AR2]' });
            likesSoldierAR2 -= 75;
            console.log(`\x1b[34m[LIKES 75]\x1b[0m @${sender} -> เสก Combine Soldier (AR2)`);
        }
        while (likesShotgun >= 100) {
            queueAction({ action: 'spawn_shotgun', sender, detail: '100 Likes [Shotgun]' });
            likesShotgun -= 100;
            console.log(`\x1b[34m[LIKES 100]\x1b[0m @${sender} -> เสก Shotgun Soldier`);
        }

        addCommunityPoints(count, sender);
    });

    // 4. ส่งของขวัญ (Gift)
    tiktokLive.on('gift', (data) => {
        const giftType = data.giftDetails?.giftType ?? data.giftType;
        if (giftType === 1 && !data.repeatEnd) return; // รอกดคอมโบของขวัญจบก่อนส่งคำสั่ง

        const sender = data.user?.uniqueId || data.uniqueId || data.user?.nickname || data.nickname || 'Supporter';
        const rawGiftName = data.giftDetails?.giftName || data.giftName || data.describe || 'Gift';
        const giftName = rawGiftName.toLowerCase();
        const count = data.repeatCount || 1;
        const diamonds = data.giftDetails?.diamondCount || data.diamondCount || 1;

        console.log(`\x1b[33m🎁 [GIFT]\x1b[0m @${sender} ส่ง [${rawGiftName}] x${count} (${diamonds} coins)`);
        broadcastOverlay({ type: 'gift', giftName: rawGiftName, count: count, diamonds: diamonds, sender: sender });

        for (let i = 0; i < count; i++) {
            if (giftName.includes('heart') || giftName.includes('หัวใจ') || giftName.includes('finger') || giftName.includes('barney')) {
                queueAction({ action: 'spawn_barney', sender, detail: `HERO: Barney [Energy Ball]`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (giftName.includes('ice cream') || giftName.includes('ไอศกรีม') || giftName.includes('duck') || giftName.includes('alyx')) {
                queueAction({ action: 'spawn_alyx', sender, detail: `HERO: Alyx Vance`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 2000 || giftName.includes('whale') || giftName.includes('ปลาวาฬ') || giftName.includes('lion') || giftName.includes('singa')) {
                queueAction({ action: 'spawn_dropship_strider_hunter', sender, detail: `STRIDER + HUNTERS (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 1000 || giftName.includes('falcon') || giftName.includes('เหยี่ยว') || giftName.includes('plane') || giftName.includes('jet') || giftName.includes('dropship')) {
                queueAction({ action: 'spawn_dropship_strider', sender, detail: `DROPSHIP STRIDER (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 300 || giftName.includes('corgi') || giftName.includes('หมา') || giftName.includes('car') || giftName.includes('รถ') || giftName.includes('apc')) {
                queueAction({ action: 'spawn_dropship_apc', sender, detail: `DROPSHIP COMBAT APC (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 150 || giftName.includes('gunship') || giftName.includes('เรือบิน') || giftName.includes('swan')) {
                queueAction({ action: 'spawn_gunship', sender, detail: `SYNTH GUNSHIP (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 80 || giftName.includes('hunter') || giftName.includes('box') || giftName.includes('confetti') || giftName.includes('fireworks') || giftName.includes('พลุ')) {
                queueAction({ action: 'spawn_hunter', sender, detail: `SYNTH HUNTER (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 30 || giftName.includes('doughnut') || giftName.includes('โดนัท') || giftName.includes('cap') || giftName.includes('หมวก')) {
                queueAction({ action: 'spawn_dropship_squad', sender, detail: `DROPSHIP REINFORCEMENTS (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else if (diamonds >= 10 || giftName.includes('panda') || giftName.includes('แพนด้า') || giftName.includes('mic') || giftName.includes('origami')) {
                queueAction({ action: 'spawn_elite', sender, detail: `ELITE COMBINE [Energy Ball] (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }
            else {
                queueAction({ action: 'spawn_soldier_ar2', sender, detail: `COMBINE SOLDIER (${rawGiftName})`, giftName: rawGiftName, diamonds: diamonds });
            }

            addCommunityPoints(diamonds * 5, sender);
        }
    });
}

// -------------------------------------------------------------
// REST API สำหรับ Garry's Mod และ OBS Overlay
// -------------------------------------------------------------
app.get('/get_actions', (req, res) => {
    const batch = actionQueue.splice(0, 8);
    if (batch.length > 0) {
        console.log(`\x1b[36m[GMOD SYNC]\x1b[0m ส่งคำสั่งเสก ${batch.length} รายการเข้าสู่เกมเรียบร้อย (ค้างในคิว: ${actionQueue.length})`);
    }
    res.json({
        success: true,
        remaining_in_queue: actionQueue.length,
        actions: batch
    });
});

app.post('/connect', (req, res) => {
    const rawUser = req.body?.username || req.query?.username;
    if (!rawUser || String(rawUser).trim() === '') {
        return res.status(400).json({ error: 'Missing username' });
    }
    const clean = cleanUsername(rawUser);
    setupTikTokConnection(clean);
    res.json({
        success: true,
        target_username: TIKTOK_USERNAME,
        status: 'connecting'
    });
});

app.post('/mock_event', (req, res) => {
    const { action, sender, detail, giftName, count, diamonds } = req.body;
    if (!action) return res.status(400).json({ error: 'Missing action' });
    const repeat = parseInt(count) || 1;
    for (let i = 0; i < repeat; i++) {
        queueAction({
            action,
            sender: sender || 'Tester',
            detail: detail || 'Mock Event',
            giftName: giftName || '',
            diamonds: parseInt(diamonds) || 1
        });
    }
    broadcastOverlay({ type: 'gift', giftName: giftName || action, count: repeat, diamonds: parseInt(diamonds) || 1, sender: sender || 'Tester' });
    console.log(`[MOCK] 🧪 สั่งเสกจำลอง: ${action} (${sender || 'Tester'}) x${repeat}`);
    res.json({ success: true, queue_size: actionQueue.length });
});

app.post('/reset_round', (req, res) => {
    actionQueue = [];
    likesCP = 0;
    likesSoldierSMG = 0;
    likesSoldierAR2 = 0;
    likesShotgun = 0;
    console.log(`\x1b[32m[TikTok-Bridge] ⚔️ รีเซ็ตรอบสงคราม (Reset Round) เรียบร้อยแล้ว - ล้างคิวการเสกพร้อมสำหรับรอบใหม่\x1b[0m`);
    broadcastOverlay({ type: 'reset_round' });
    res.json({ success: true, message: 'Round reset successfully' });
});

// -------------------------------------------------------------
// STREAM OVERLAY (สำหรับ TikTok LIVE Studio / OBS Studio)
// -------------------------------------------------------------
app.get('/overlay', (req, res) => {
    const oPath = path.join(__dirname, 'public', 'overlay.html');
    if (fs.existsSync(oPath)) {
        res.sendFile(oPath);
    } else {
        res.send("<h2>TikTok GMod Bridge: In-game HUD is active directly inside Garry's Mod!</h2>");
    }
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    overlayClients.push(res);

    res.write(`data: ${JSON.stringify({
        type: 'init',
        rules: currentBattleRules,
        teamConfig: currentTeamConfig,
        username: TIKTOK_USERNAME,
        connected: connectionState.connected,
        totalLikes: totalSessionLikes
    })}\n\n`);

    req.on('close', () => {
        overlayClients = overlayClients.filter(c => c !== res);
    });
});

app.post('/api/sync_rules', (req, res) => {
    try {
        if (req.body.rules) {
            currentBattleRules = typeof req.body.rules === 'string' ? JSON.parse(req.body.rules) : req.body.rules;
        }
        if (req.body.teamConfig) {
            currentTeamConfig = req.body.teamConfig;
        }
        broadcastOverlay({
            type: 'rules_update',
            rules: currentBattleRules,
            teamConfig: currentTeamConfig,
            username: TIKTOK_USERNAME
        });
        console.log(`\x1b[35m[OVERLAY SYNC]\x1b[0m ซิงค์กฎสงครามเข้าสู่ Stream Overlay (${currentBattleRules.length} กฎ)`);
        res.json({ success: true, count: currentBattleRules.length });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/overlay_data', (req, res) => {
    res.json({
        success: true,
        rules: currentBattleRules,
        teamConfig: currentTeamConfig,
        username: TIKTOK_USERNAME,
        totalLikes: totalSessionLikes,
        connected: connectionState.connected
    });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        target_username: TIKTOK_USERNAME,
        is_connected: connectionState.connected,
        is_connecting: connectionState.connecting,
        room_id: connectionState.roomId,
        last_error: connectionState.lastError,
        total_session_likes: totalSessionLikes,
        queue_size: actionQueue.length
    });
});

// เริ่มต้นเปิดเซิร์ฟเวอร์ HTTP ทันที เพื่อให้ Garry's Mod เชื่อมต่อได้ตลอดเวลา
app.listen(PORT, '0.0.0.0', () => {
    console.log("===================================================================");
    console.log(`  🔴 TIKTOK LIVE TO GARRY'S MOD CONNECTOR BRIDGE (ONLINE)`);
    console.log(`  🌐 Port: ${PORT} | พร้อมรับการเชื่อมต่อจาก Garry's Mod`);
    console.log(`  🎯 กำลังตรวจจับไลฟ์ของ: @${TIKTOK_USERNAME}`);
    console.log(`  👉 ลิงก์ Overlay (OBS Studio / TikTok LIVE Studio):`);
    console.log(`     http://localhost:3000/overlay`);
    console.log(`  💡 เคล็ดลับ: พิมพ์ 'test' ในหน้านี้เพื่อทดสอบเสก NPC ในเกมได้ทันที`);
    console.log(`  💡 หรือพิมพ์ 'user <ชื่อใหม่>' เพื่อเปลี่ยนคนไลฟ์ได้ตลอดเวลา`);
    console.log("===================================================================");
    console.log(`⚠️ กรุณาเปิดหน้าต่างสีดำนี้ค้างไว้ตลอดการเล่นเกมหรือไลฟ์สตรีม`);

    // เริ่มต้นเชื่อมต่อ TikTok Live
    setupTikTokConnection(TIKTOK_USERNAME);
});

// -------------------------------------------------------------
// ระบบรับคำสั่งสดผ่าน Terminal Console (พิมพ์ทดสอบได้ตลอดเวลา)
// -------------------------------------------------------------
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    const input = line.trim();
    if (!input) return;

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'user' || cmd === 'connect') {
        const newUser = parts[1];
        if (newUser) {
            setupTikTokConnection(newUser);
        } else {
            console.log(`👉 การใช้งาน: user <ชื่อ TikTok> (ปัจจุบันคือ: @${TIKTOK_USERNAME})`);
        }
    } else if (cmd === 'test' || cmd === 'mock') {
        console.log(`🧪 กำลังส่งชุดอีเวนต์ทดสอบ (Follow + Likes + Gifts)...`);
        queueAction({ action: 'spawn_anticitizen', sender: 'Test_Follower', detail: 'Follower' });
        queueAction({ action: 'spawn_cp', sender: 'Test_Liker', detail: '20 Likes' });
        queueAction({ action: 'spawn_soldier_smg', sender: 'Test_Liker2', detail: '50 Likes [SMG]' });
        queueAction({ action: 'spawn_barney', sender: 'Test_Hero', detail: 'HERO: Barney', giftName: 'Heart', diamonds: 1 });
        queueAction({ action: 'spawn_dropship_squad', sender: 'Test_Squad', detail: 'DROPSHIP REINFORCEMENTS', giftName: 'Doughnut', diamonds: 30 });
        console.log(`✅ ส่งอีเวนต์ทดสอบ 5 รายการเข้าคิวแล้ว! ในเกม Garry's Mod จะเสกตัวละครออกมาทันที`);
    } else if (cmd === 'like') {
        const count = parseInt(parts[1]) || 20;
        queueAction({ action: count >= 50 ? 'spawn_soldier_smg' : 'spawn_cp', sender: 'Terminal_User', detail: `${count} Likes` });
        console.log(`👍 จำลองการกดใจ ${count} ไลก์ เข้าสู่คิวเกมแล้ว`);
    } else if (cmd === 'follow') {
        const sender = parts[1] || 'Terminal_Follower';
        queueAction({ action: 'spawn_anticitizen', sender, detail: 'Follower' });
        console.log(`👥 จำลองการกดติดตามโดย @${sender} เข้าสู่คิวเกมแล้ว`);
    } else if (cmd === 'gift') {
        const gName = parts[1] || 'Rose';
        const count = parseInt(parts[2]) || 1;
        const dia = parseInt(parts[3]) || (gName.toLowerCase().includes('whale') ? 2000 : 1);
        for (let i = 0; i < count; i++) {
            queueAction({
                action: dia >= 1000 ? 'spawn_dropship_strider' : (dia >= 30 ? 'spawn_dropship_squad' : 'spawn_barney'),
                sender: 'Terminal_Gifter',
                detail: `Terminal Gift [${gName}]`,
                giftName: gName,
                diamonds: dia
            });
        }
        console.log(`🎁 จำลองส่งของขวัญ [${gName}] x${count} เข้าสู่คิวเกมแล้ว`);
    } else if (cmd === 'status') {
        console.log(`--- BRIDGE STATUS ---`);
        console.log(`Target: @${TIKTOK_USERNAME}`);
        console.log(`Live Status: ${connectionState.connected ? 'CONNECTED (Room ' + connectionState.roomId + ')' : (connectionState.connecting ? 'CONNECTING...' : 'WAITING / OFFLINE')}`);
        console.log(`Queue Size: ${actionQueue.length}`);
        console.log(`Total Likes: ${totalSessionLikes}`);
    } else if (cmd === 'cls' || cmd === 'clear') {
        console.clear();
    } else if (cmd === 'help') {
        console.log(`================ คำสั่งจำลองในคอนโซล ================`);
        console.log(`  user <ชื่อ>           - เปลี่ยนชื่อผู้ใช้ TikTok และเชื่อมต่อใหม่`);
        console.log(`  test                 - ส่งชุดทดสอบ Follow + Likes + Gifts เข้าเกม`);
        console.log(`  follow [ชื่อ]        - จำลองการกดติดตาม`);
        console.log(`  like [จำนวน]         - จำลองการกดใจ (เช่น like 20, like 50)`);
        console.log(`  gift <ชื่อของขวัญ>   - จำลองการส่งของขวัญ (เช่น gift rose, gift whale)`);
        console.log(`  status               - ตรวจสอบสถานะการเชื่อมต่อ`);
        console.log(`  help                 - แสดงข้อความช่วยเหลือนี้`);
        console.log(`======================================================`);
    }
});
