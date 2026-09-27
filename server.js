const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const cors = require('cors');
const path = require('path');

let TIKTOK_USERNAME = 'valkyrietoyota';
const PORT = 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// ตัวแปรสะสมจำนวนไลก์รายยูนิต
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
        actionQueue.push({
            action: eventAction,
            sender: `${lastUser} & Viewers`,
            detail: 'Community Dropship Event'
        });
        communityEngagementScore -= COMMUNITY_DROPSHIP_THRESHOLD;
    }
}

function setupTikTokConnection(username) {
    if (tiktokLive) {
        try {
            tiktokLive.disconnect();
        } catch (e) {}
    }

    TIKTOK_USERNAME = username.replace(/^@/, '').trim();
    connectionState.connecting = true;
    connectionState.connected = false;
    connectionState.roomId = null;
    connectionState.lastError = null;

    console.log(`\x1b[36m[TikTok-Bridge]\x1b[0m กำลังเชื่อมต่อกับ: @${TIKTOK_USERNAME}...`);

    tiktokLive = new WebcastPushConnection(TIKTOK_USERNAME, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        requestPollingIntervalMs: 1000
    });

    tiktokLive.connect().then(state => {
        connectionState.connected = true;
        connectionState.connecting = false;
        connectionState.roomId = state.roomId;
        console.log(`\x1b[32m[TikTok Live] เชื่อมต่อสำเร็จ! Room ID: ${state.roomId}\x1b[0m`);
    }).catch(err => {
        connectionState.connected = false;
        connectionState.connecting = false;
        connectionState.lastError = err.message;
        console.warn(`\x1b[33m[TikTok Live] รอการเปิดไลฟ์จาก @${TIKTOK_USERNAME} (${err.message})\x1b[0m`);
    });

    tiktokLive.on('disconnected', () => {
        connectionState.connected = false;
        console.log(`\x1b[31m[TikTok Live] หลุดจากการเชื่อมต่อ กำลังลองใหม่ใน 5 วินาที...\x1b[0m`);
        setTimeout(() => {
            if (!connectionState.connected && TIKTOK_USERNAME) {
                tiktokLive.connect().catch(() => {});
            }
        }, 5000);
    });

    tiktokLive.on('error', (err) => {
        connectionState.lastError = err.message;
    });

    // 1. กดติดตาม (Follow)
    tiktokLive.on('follow', (data) => {
        const sender = data.uniqueId || data.nickname || 'Citizen';
        console.log(`\x1b[32m[+FOLLOW]\x1b[0m @${sender} -> เสก Anticitizen`);
        actionQueue.push({
            action: 'spawn_anticitizen',
            sender: sender,
            detail: 'Follower'
        });
        broadcastOverlay({ type: 'follow', sender: sender });
        addCommunityPoints(15, sender);
    });

    // 2. แชร์ไลฟ์ (Share)
    tiktokLive.on('share', (data) => {
        const sender = data.uniqueId || 'Supporter';
        addCommunityPoints(25, sender);
    });

    // 3. กดใจ (Like)
    tiktokLive.on('like', (data) => {
        const sender = data.uniqueId || data.nickname || 'Viewer';
        const count = data.likeCount || 1;

        totalSessionLikes += count;
        broadcastOverlay({ type: 'like', totalLikes: totalSessionLikes, sender: sender, count: count });
        likesCP += count;
        likesSoldierSMG += count;
        likesSoldierAR2 += count;
        likesShotgun += count;

        while (likesCP >= 20) {
            actionQueue.push({ action: 'spawn_cp', sender, detail: '20 Likes' });
            likesCP -= 20;
        }
        while (likesSoldierSMG >= 50) {
            actionQueue.push({ action: 'spawn_soldier_smg', sender, detail: '50 Likes [SMG]' });
            likesSoldierSMG -= 50;
        }
        while (likesSoldierAR2 >= 75) {
            actionQueue.push({ action: 'spawn_soldier_ar2', sender, detail: '75 Likes [AR2]' });
            likesSoldierAR2 -= 75;
        }
        while (likesShotgun >= 100) {
            actionQueue.push({ action: 'spawn_shotgun', sender, detail: '100 Likes [Shotgun]' });
            likesShotgun -= 100;
        }

        addCommunityPoints(count, sender);
    });

    // 4. ส่งของขวัญ (Gift)
    tiktokLive.on('gift', (data) => {
        if (data.giftType === 1 && !data.repeatEnd) return;

        const sender = data.uniqueId || data.nickname || 'Supporter';
        const giftName = (data.giftName || 'Gift').toLowerCase();
        const count = data.repeatCount || 1;
        const diamonds = data.diamondCount || 1;

        console.log(`\x1b[33m[GIFT]\x1b[0m @${sender} ส่ง [${data.giftName}] x${count} (${diamonds} coins)`);
        broadcastOverlay({ type: 'gift', giftName: data.giftName, count: count, diamonds: diamonds, sender: sender });

        for (let i = 0; i < count; i++) {
            if (giftName.includes('heart') || giftName.includes('หัวใจ') || giftName.includes('finger') || giftName.includes('barney')) {
                actionQueue.push({ action: 'spawn_barney', sender, detail: `HERO: Barney [Energy Ball]`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (giftName.includes('ice cream') || giftName.includes('ไอศกรีม') || giftName.includes('duck') || giftName.includes('alyx')) {
                actionQueue.push({ action: 'spawn_alyx', sender, detail: `HERO: Alyx Vance`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 2000 || giftName.includes('whale') || giftName.includes('ปลาวาฬ') || giftName.includes('lion') || giftName.includes('singa')) {
                actionQueue.push({ action: 'spawn_dropship_strider_hunter', sender, detail: `STRIDER + HUNTERS (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 1000 || giftName.includes('falcon') || giftName.includes('เหยี่ยว') || giftName.includes('plane') || giftName.includes('jet') || giftName.includes('dropship')) {
                actionQueue.push({ action: 'spawn_dropship_strider', sender, detail: `DROPSHIP STRIDER (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 300 || giftName.includes('corgi') || giftName.includes('หมา') || giftName.includes('car') || giftName.includes('รถ') || giftName.includes('apc')) {
                actionQueue.push({ action: 'spawn_dropship_apc', sender, detail: `DROPSHIP COMBAT APC (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 150 || giftName.includes('gunship') || giftName.includes('เรือบิน') || giftName.includes('swan')) {
                actionQueue.push({ action: 'spawn_gunship', sender, detail: `SYNTH GUNSHIP (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 80 || giftName.includes('hunter') || giftName.includes('box') || giftName.includes('confetti') || giftName.includes('fireworks') || giftName.includes('พลุ')) {
                actionQueue.push({ action: 'spawn_hunter', sender, detail: `SYNTH HUNTER (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 30 || giftName.includes('doughnut') || giftName.includes('โดนัท') || giftName.includes('cap') || giftName.includes('หมวก')) {
                actionQueue.push({ action: 'spawn_dropship_squad', sender, detail: `DROPSHIP REINFORCEMENTS (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else if (diamonds >= 10 || giftName.includes('panda') || giftName.includes('แพนด้า') || giftName.includes('mic') || giftName.includes('origami')) {
                actionQueue.push({ action: 'spawn_elite', sender, detail: `ELITE COMBINE [Energy Ball] (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }
            else {
                actionQueue.push({ action: 'spawn_soldier_ar2', sender, detail: `COMBINE SOLDIER (${data.giftName})`, giftName: data.giftName, diamonds: diamonds });
            }

            addCommunityPoints(diamonds * 5, sender);
        }
    });
}

// เริ่มต้นเชื่อมต่อครั้งแรก
setupTikTokConnection(TIKTOK_USERNAME);

// -------------------------------------------------------------
// REST API สำหรับ Garry's Mod
// -------------------------------------------------------------
app.get('/get_actions', (req, res) => {
    const batch = actionQueue.splice(0, 5);
    res.json({
        success: true,
        remaining_in_queue: actionQueue.length,
        actions: batch
    });
});

app.post('/connect', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    setupTikTokConnection(username);
    res.json({
        success: true,
        target_username: TIKTOK_USERNAME,
        status: 'connecting'
    });
});

app.post('/mock_event', (req, res) => {
    const { action, sender, detail, giftName } = req.body;
    if (!action) return res.status(400).json({ error: 'Missing action' });
    actionQueue.push({ action, sender: sender || 'Tester', detail: detail || 'Mock Event', giftName: giftName || '' });
    broadcastOverlay({ type: 'gift', giftName: giftName || action, count: 1, diamonds: 1, sender: sender || 'Tester' });
    console.log(`[MOCK] สั่งเสก: ${action} (${sender})`);
    res.json({ success: true, queue_size: actionQueue.length });
});

// -------------------------------------------------------------
// STREAM OVERLAY (สำหรับ TikTok LIVE Studio / OBS Studio)
// -------------------------------------------------------------
app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
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

app.listen(PORT, '0.0.0.0', () => {
    console.log("=================================================");
    console.log(`[TikTok-Bridge] ระบบทำงานเรียบร้อยที่ Port ${PORT} (ONLINE)`);
    console.log(`[TikTok-Bridge] พร้อมรับการเชื่อมต่อจาก Garry's Mod UI`);
    console.log(`[TikTok-Bridge] 👉 ลิงก์ Overlay สำหรับ OBS / TikTok LIVE Studio:`);
    console.log(`               http://localhost:3000/overlay`);
    console.log("=================================================");
    console.log(`⚠️ กรุณาเปิดหน้าต่างสีดำนี้ค้างไว้ตลอดการเล่นเกมหรือไลฟ์สตรีม`);
});
