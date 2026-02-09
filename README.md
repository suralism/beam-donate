# Beam Donate 🌸

หน้า Donate ง่ายๆ รับชำระผ่าน PromptPay ด้วย Beam Checkout API

## Features

- ✅ รับบริจาคผ่าน PromptPay QR Code
- ✅ เลือกจำนวนเงินหรือกรอกเอง
- ✅ แสดง QR Code สำหรับสแกนจ่าย
- ✅ Webhook รับแจ้งเตือนเมื่อชำระสำเร็จ
- ✅ หน้า Thank You หลังจ่ายเสร็จ

## Tech Stack

- **Frontend:** HTML + CSS + JavaScript
- **Backend:** Node.js + Express
- **Payment:** Beam Checkout API (PromptPay)

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
| POST | `/api/create-charge` | สร้าง PromptPay charge |
| GET | `/api/charge/:id` | เช็คสถานะ charge |
| POST | `/webhook` | รับ webhook จาก Beam |
| GET | `/thank-you` | หน้าขอบคุณ |

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
│   ├── index.html      # หน้า Donate
│   ├── thank-you.html  # หน้าขอบคุณ
│   ├── style.css       # Styles
│   └── app.js          # Frontend JS
├── src/
│   ├── server.js       # Express server
│   └── beam.js         # Beam API wrapper
├── .env.example        # ตัวอย่าง environment variables
├── .gitignore
├── package.json
└── README.md
```

## License

MIT

---

Made with 🌸 by Alice
