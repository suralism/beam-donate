# Beam Donate 🌸

หน้า Donate รับชำระเงินหลายช่องทางผ่าน Beam Checkout API พร้อมระบบ Live Donation Alert สำหรับ OBS

## Features

- ✅ รับบริจาคผ่านหลายช่องทาง:
  - 💚 QR PromptPay
  - 💳 บัตรเครดิต/เดบิต (Visa, Mastercard, Amex, UnionPay) — ขั้นต่ำ 200 บาท
  - 🏦 Mobile Banking
  - 👛 E-Wallets (TrueMoney, ShopeePay, LINE Pay ฯลฯ)
- ✅ เลือกจำนวนเงินหรือกรอกเอง
- ✅ 🎬 **Live Donation Alert** แสดงบน OBS/Stream (คล้าย TipMe/Streamlabs)
- ✅ Webhook รับแจ้งเตือนเมื่อชำระสำเร็จ
- ✅ หน้า Thank You หลังจ่ายเสร็จ
- ✅ 🧪 Alert Test Dashboard ทดสอบ alert โดยไม่ต้องจ่ายเงินจริง

## Tech Stack

- **Frontend:** HTML + CSS + JavaScript
- **Backend:** Node.js + Express
- **Payment:** Beam Checkout API (PromptPay, Card, Mobile Banking, E-Wallets)
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
│   ├── style.css         # Donate page styles
│   └── app.js            # Donate page JS
├── src/
│   ├── server.js         # Express server + SSE
│   └── beam.js           # Beam API wrapper
├── .env.example          # ตัวอย่าง environment variables
├── .gitignore
├── package.json
└── README.md
```

## 🎬 Live Donation Alert (OBS Overlay)

ระบบแสดงแจ้งเตือนบริจาคแบบ real-time บน live stream คล้าย TipMe / Streamlabs

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
