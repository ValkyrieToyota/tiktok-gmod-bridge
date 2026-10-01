const https = require('https');
const fs = require('fs');
const path = require('path');

const targetDirs = [
    path.join(__dirname, '..', 'gmod-addon', 'materials', 'tiktok_battle'),
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod\\garrysmod\\addons\\tiktok_battle\\materials\\tiktok_battle',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod\\garrysmod\\addons\\tiktok_battle\\TikTok-GMod-Battle\\gmod-addon\\materials\\tiktok_battle'
];

targetDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Twemoji CDN transparent 72x72 PNGs
const icons = {
    'rose.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f339.png',
    'heart.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f496.png',
    'finger_heart.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1faf0.png',
    'doughnut.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f369.png',
    'lion.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f981.png',
    'falcon.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f985.png',
    'whale.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f433.png',
    'panda.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f43c.png',
    'duck.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f986.png',
    'corgi.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f436.png',
    'cap.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f9e2.png',
    'confetti.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f389.png',
    'sunglasses.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f576.png',
    'money_gun.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4b8.png',
    'coins.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1fa99.png',
    'like.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f44d.png',
    'follow.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f464.png',
    'share.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f504.png',
    'gift.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f381.png',
    'fire.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f525.png',
    'swords.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/2694.png',
    'shield.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f6e1.png',
    'trophy.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f3c6.png',
    'star.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/2b50.png',
    'skull.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f480.png',
    'tiktok.png': 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f3a5.png'
};

function download(url, filename) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location, filename).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                console.error(`Failed ${filename}: HTTP ${res.statusCode}`);
                return resolve();
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                targetDirs.forEach(dir => {
                    try {
                        fs.writeFileSync(path.join(dir, filename), buf);
                    } catch (e) {
                        console.error('Write err to ' + dir + ': ' + e.message);
                    }
                });
                console.log(`Saved: ${filename} (${buf.length} bytes)`);
                resolve();
            });
        }).on('error', err => {
            console.error(`Error downloading ${filename}: ${err.message}`);
            resolve();
        });
    });
}

async function run() {
    console.log('Downloading TikTok Gift & Action icons into materials/tiktok_battle/ ...');
    for (const [name, url] of Object.entries(icons)) {
        await download(url, name);
    }
    console.log('All icons downloaded successfully!');
}

run();
