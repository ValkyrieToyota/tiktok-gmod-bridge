# 🔴 TikTok Live to Garry's Mod Connector Bridge & Stream Overlay
**Developed for Steam Workshop & TikTok Streamers**  
*Creator: @valkyrietoyota*

---

## 🇹🇭 คู่มือวิธีใช้งานภาษาไทย (3 ขั้นตอนง่ายๆ)

โปรแกรมตัวเชื่อมต่อนี้ทำหน้าที่รับข้อมูลของขวัญ (Gifts), ยอดไลก์ (Likes), และการกดติดตาม (Follows) จาก **TikTok LIVE** แล้วส่งต่อไปยังเกม **Garry's Mod** เพื่อสั่งเสกตัวละครรบกันในสนามประลอง พร้อมสร้างการ์ดโอเวอร์เรย์ขึ้นบนจอไลฟ์สดของคุณ!

### 📥 1. สิ่งที่ต้องมีในเครื่อง (ติดตั้งครั้งแรกครั้งเดียว):
- **Node.js (เวอร์ชัน LTS ฟรี):** ดาวน์โหลดได้ที่ 👉 [https://nodejs.org/](https://nodejs.org/) (กดดาวน์โหลดแล้วกด Next จนเสร็จ)

### 🚀 2. วิธีเปิดใช้งาน:
1. ดาวน์โหลดโฟลเดอร์นี้ หรือดาวน์โหลดไฟล์ `.zip` แล้วแตกไฟล์
2. **ดับเบิ้ลคลิกไฟล์ `start.bat`**
   - *ในครั้งแรก โปรแกรมจะติดตั้งส่วนเสริมให้อัตโนมัติ (รอประมาณ 20-30 วินาที)*
   - เมื่อขึ้นหน้าต่างสีดำพร้อมข้อความสีเขียวว่า `[TikTok-Bridge] ระบบทำงานเรียบร้อยที่ Port 3000` ถือว่าพร้อมใช้งาน!
   - ⚠️ **เปิดหน้าต่างสีดำนี้ทิ้งไว้ตลอดการไลฟ์สดหรือเล่นเกม (ย่อลง Taskbar ได้)**

### 🎮 3. เข้าเกม Garry's Mod:
1. เข้าเล่นในแมพใดก็ได้ (แนะนำ `gm_construct`)
2. เปิดเมนูด้วยปุ่มคีย์ลัด **F6** หรือพิมพ์ใน Console (`~`): `tiktok_menu`
3. พิมพ์ **ชื่อบัญชี TikTok** ของคุณ (ไม่ต้องใส่ `@`) แล้วกด **"เชื่อมต่อกับ TikTok Live"**
4. มาร์กจุดเกิดฝ่ายเรา (Rebel) และฝ่ายศัตรู (Combine) แล้วเริ่มไลฟ์สดได้ทันที!

### 📺 4. วิธีนำการ์ดของขวัญขึ้นจอ OBS / TikTok LIVE Studio:
1. ในโปรแกรม **TikTok LIVE Studio** หรือ **OBS Studio** ให้กด **เพิ่มแหล่งข้อมูล (+) ➜ เบราว์เซอร์ (Browser Source)**
2. ใส่ URL:  
   👉 `http://localhost:3000/overlay` (หรือ `http://127.0.0.1:3000/overlay`)
3. ตั้งค่าความกว้าง **1920** ความสูง **1080**
4. การ์ดของขวัญโปร่งใสจะแสดงขึ้นบนจอ และเด้งเอฟเฟกต์อัตโนมัติเมื่อมีคนส่งของขวัญ!

---

## 🇬🇧 English Guide (3 Simple Steps)

### 📥 1. Prerequisites (One-time setup):
- **Node.js (LTS version):** Download free from 👉 [https://nodejs.org/](https://nodejs.org/)

### 🚀 2. How to Run:
1. Download or clone this repository and extract the files.
2. **Double-click `start.bat`**
   - *On first launch, dependencies will be installed automatically (~20-30 seconds).*
   - Once the console displays `[TikTok-Bridge] ระบบทำงานเรียบร้อยที่ Port 3000 (ONLINE)`, it's ready!
   - ⚠️ **Keep this console window open in the background while streaming.**

### 🎮 3. In Garry's Mod:
1. Load any map (e.g., `gm_construct`).
2. Press shortcut key **F6** or type in console (`~`): `tiktok_menu`.
3. Enter your **TikTok username** (without `@`) and click **"Connect to TikTok Live"**.
4. Set Ally and Enemy spawn points, and you're good to go!

### 📺 4. Stream Overlay for OBS / TikTok LIVE Studio:
- Add a **Browser Source** with URL: `http://localhost:3000/overlay` (Width: 1920, Height: 1080).
