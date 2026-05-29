# Stream Donation 🌸

หน้า Donate รับชำระเงินหลายช่องทางผ่าน Beam Checkout API พร้อมระบบ Live Donation Alert สำหรับ OBS

## Features

- ✅ รับบริจาคผ่านหลายช่องทาง:
  - 💚 QR PromptPay
  - 💳 บัตรเครดิต/เดบิต (Visa, Mastercard, Amex, UnionPay) — ขั้นต่ำ 200 บาท
  - 🏦 Mobile Banking
  - 👛 E-Wallets (TrueMoney, ShopeePay, LINE Pay ฯลฯ)
- ✅ เลือกจำนวนเงินหรือกรอกเอง
- ✅ 🎬 **Live Donation Alert** แสดงบน OBS/Stream (คล้าย TipMe/Streamlabs)
- ✅ 📊 **Premium Admin Dashboard** จัดการยอด ดูสถิติ และจำลองหรือบังคับสถานะธุรกรรม
- ✅ 🎨 **Real-time Live Customization** ปรับแต่งสกินสี ขอบ ฟอนต์ แอนิเมชัน และละอองวิบวับของ Alert แบบสดๆ ได้ทันที
- ✅ 🔊 **Sound & Speech Synthesis (TTS)** เลือกโทนเสียงเตือน ปรับความดัง และมี AI อ่านข้อความออกเสียงภาษาไทย/อังกฤษฟรี!
- ✅ Webhook รับแจ้งเตือนเมื่อชำระสำเร็จ
- ✅ หน้า Thank You หลังจ่ายเสร็จ
- ✅ 🧪 Alert Test Dashboard ทดสอบ alert โดยไม่ต้องจ่ายเงินจริง

## Tech Stack

- **Frontend:** HTML + CSS + JavaScript
- **Backend:** Node.js + Express
- **Payment:** Beam Checkout API (PromptPay, Card, Mobile Banking, E-Wallets)
- **Database:** SQLite (Local Development) & **Turso DB** (Cloud SQLite for Serverless/Vercel)
- **Realtime:** Server-Sent Events (SSE)

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/beam-donate.git
cd beam-donate
npm install
```

### 2. สร้างไฟล์ `.env`

```bash
cp .env.example .env
```

แก้ไขค่าใน `.env`:

```env
# Beam API Credentials (จาก Beam Dashboard)
BEAM_API_KEY=your_beam_api_key_here
BEAM_SECRET_KEY=your_beam_secret_key_here

# Environment: sandbox หรือ production
BEAM_ENV=sandbox

# Server
PORT=3000

# Webhook Secret (optional - สำหรับ verify webhook)
WEBHOOK_SECRET=your_webhook_secret

# Turso Cloud SQLite Database (สำหรับบันทึกข้อมูลถาวรบน Vercel)
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your_turso_jwt_auth_token_here
```

### 3. รัน Server

```bash
# Development
npm run dev

# Production
npm start
```

### 4. เปิดเว็บ

```
http://localhost:3000
```

## 📊 Database Configuration

ระบบจัดการข้อมูลธุรกรรมและการตั้งค่ามีรูปแบบยืดหยุ่นสูง (Hybrid Storage):
1. **Local Development (SQLite ในตัว):** ไม่ต้องตั้งค่าใดๆ ระบบจะเขียนไฟล์ลงดิสก์ที่ `data/database.db` ของคุณอัตโนมัติ
2. **Production/Vercel (Turso Cloud DB):** เนื่องจากระบบไฟล์บน Vercel เป็น Read-Only ทำให้ข้อมูลหายเมื่อรีเซ็ตอินสแตนซ์ จึงแนะนำให้เชื่อมต่อกับ **Turso DB** ซึ่งเป็น SQLite ในระบบคลาวด์ (ผ่าน `@libsql/client` แบบ HTTP ที่เสถียรและเร็วมาก)

> [!TIP]
> **ระบบย้ายข้อมูลเดิมอัตโนมัติ (Zero-Downtime Auto-Migration):**
> ทันทีที่คุณเปิดรันเซิร์ฟเวอร์ด้วยระบบฐานข้อมูลใหม่นี้ ระบบจะค้นหาและคัดลอกประวัติการบริจาคและค่าตั้งค่า Overlay จากไฟล์ JSON เก่า (`transactions.json` และ `overlay-settings.json`) ย้ายเข้าไปเก็บใน Turso/SQLite ให้อัตโนมัติในครั้งแรก ข้อมูลเดิมไม่มีสูญหายแน่นอน!

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | หน้า Donate |
| POST | `/api/create-charge` | สร้าง Payment Link (รองรับทุกช่องทาง) |
| GET | `/api/charge/:id` | เช็คสถานะ charge |
| POST | `/webhook` | รับ webhook จาก Beam |
| GET | `/thank-you` | หน้าขอบคุณ |
| GET | `/overlay` | 🎬 Donation Alert Overlay (สำหรับ OBS Browser Source) |
| GET | `/alert-test` | 🧪 Alert Test Dashboard |
| GET | `/admin` | 📊 Premium Admin Dashboard |
| GET | `/api/transactions` | ดึงรายการประวัติการบริจาคทั้งหมด |
| POST | `/api/transactions/:id/status` | บังคับสถานะรายการบริจาค (เช่น Force Pay) |
| GET | `/api/overlay/settings` | ดึงค่าปรับแต่ง Overlay ปัจจุบัน |
| POST | `/api/overlay/settings` | บันทึกค่าปรับแต่ง Overlay และยิง SSE Sync |
| GET | `/api/alerts/stream` | SSE stream สำหรับ overlay |
| POST | `/api/alerts/test` | ส่ง test alert |

## Beam API Keys

ไปที่ [Beam Dashboard](https://dashboard.beamcheckout.com) เพื่อ:

1. สมัคร Merchant Account
2. ได้รับ API Key และ Secret Key
3. สำหรับทดสอบ ใช้ Playground environment

### Sandbox vs Production

| Environment | API URL |
|-------------|---------|
| Sandbox | `https://playground.api.beamcheckout.com` |
| Production | `https://api.beamcheckout.com` |

## Webhook Setup

1. ไปที่ Beam Dashboard → Webhooks
2. เพิ่ม Webhook URL: `https://your-domain.com/webhook`
3. เลือก Events: `charge.completed`
4. Copy Webhook Secret ใส่ใน `.env`

## Project Structure

```
beam-donate/
├── public/
│   ├── index.html        # หน้า Donate
│   ├── thank-you.html    # หน้าขอบคุณ
│   ├── overlay.html      # 🎬 Donation Alert Overlay (OBS)
│   ├── overlay.css       # Overlay styles + animations
│   ├── overlay.js        # SSE client + alert queue
│   ├── alert-test.html   # 🧪 Alert Test Dashboard
│   ├── admin.html        # 📊 Premium Admin Dashboard
│   ├── admin.css         # Admin Dashboard styles
│   ├── admin.js          # Admin Dashboard logic
│   ├── style.css         # Donate page styles
│   └── app.js            # Donate page JS
├── src/
│   ├── server.js         # Express server + SSE
│   ├── database.js       # 📊 SQLite/Turso Database Manager
│   └── beam.js           # Beam API wrapper
├── data/                 # โฟลเดอร์เก็บ SQLite Database และไฟล์สำรอง (.bak)
├── .env.example          # ตัวอย่าง environment variables
├── .gitignore
├── package.json
└── README.md
```

## 🎬 Live Donation Alert (OBS Overlay)

ระบบแสดงแจ้งเตือนบริจาคแบบ real-time บน live stream คล้าย TipMe / Streamlabs

## 📊 Premium Admin Dashboard (ระบบแดชบอร์ดสตรีมเมอร์)

หน้าควบคุมสุดพรีเมียมสไตล์ Modern Dark Mode ช่วยให้สตรีมเมอร์สามารถบริหารจัดการธุรกรรมการบริจาคและปรับแต่งสไตล์ของ Live Overlay ได้อย่างสมบูรณ์แบบ:

### วิธีใช้งาน
1. เปิดเบราว์เซอร์แล้วไปที่: `http://localhost:3000/admin`
2. **Dashboard Tab:** ดูสถิติรวมยอดบริจาค, อัตราความสำเร็จสำเร็จ (Success Ratio) และสถิติธุรกรรม
3. **Donation History Tab:** 
   - ค้นหารายการและฟิลเตอร์สถานะธุรกรรม
   - **Force Pay:** บังคับให้ธุรกรรม Pending เปลี่ยนเป็น Success (ช่วยทดสอบ Flow เสมือนจ่ายเงินจริง)
   - **Test Alert:** ยิง Alert ของธุรกรรมรายนั้นๆ ขึ้นจอเพื่อทดสอบ
   - **Raw Inspect:** เปิดกล่องตรวจสอบ JSON Payload เชิงลึก
4. **Overlay Configurator Tab:**
   - **Visual Themes:** เลือกสกินแสดงผล (Glassmorphism, Cyberpunk Neon, Minimalist, Custom) ปรับแต่งโทนสีสัน ขอบ และละออง particles วิบวับ
   - **Typography:** เปลี่ยนแบบอักษรภาษาไทยยอดนิยม (Noto Sans Thai, Kanit, Mitr, Chakra Petch, Sarabun)
   - **Entrance Animations:** คุมวิถีการเด้งแจ้งเตือน (เลื่อนลงจากบน, เลื่อนขึ้นจากล่าง, เลื่อนจากข้าง, ซูมเข้า, ค่อยๆ เฟด) และเวลาค้างของ Alert (2-20 วินาที)
   - **Audio Alert:** เลือกประเภทเสียงเตือน (Classic Chime, Retro Arcade, Modern Synth, Soft Bell) และระดับสไลเดอร์เสียง
   - **TTS Engine (อ่านออกเสียง AI):** สวิตช์เปิดใช้ระบบสังเคราะห์เสียงพูดอ่านข้อความภาษาไทย/อังกฤษ ด้วย Web Speech API อัตโนมัติ (เลือกสปีดเร็ว/ช้า และระดับเสียงพูดได้)
   - **Real-time Live Sync:** เมื่อกดบันทึกหรือยิงทดสอบ การตั้งค่าต่างๆ จะซิงค์ผ่าน SSE และ**อัปเดตสกินสี แอนิเมชัน และเสียงเตือนบนหน้าจอ OBS จริงทันทีโดยไม่ต้องกด Refresh OBS ใหม่!**
   - **Live Preview:** มี Iframe ตัวอย่างจำลองแบบ Interactive ช่วยให้เห็นผลตกแต่งสดๆ ก่อนนำไปขึ้นไลฟ์จริง


### วิธีใช้งาน

1. เปิด OBS Studio
2. เพิ่ม **Browser Source** ใหม่
3. ใส่ URL: `http://localhost:3000/overlay`
4. ตั้งค่า Width: `800`, Height: `200`
5. เมื่อมีคนบริจาคสำเร็จ → Alert จะแสดงอัตโนมัติ

### URL Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `duration` | `8000` | ระยะเวลาแสดง alert (ms) |
| `sound` | `true` | เปิด/ปิดเสียงแจ้งเตือน |

ตัวอย่าง: `/overlay?duration=10000&sound=false`

### ทดสอบ Alert

เปิด `http://localhost:3000/alert-test` เพื่อส่ง test alert โดยไม่ต้องจ่ายเงินจริง

## License

MIT

---

Made by TBDEV
