# Beam Checkout Integration Guide

เอกสารสรุปการเชื่อมต่อระบบรับบริจาค (Donation) กับ Beam Checkout API แบบ Payment Links (Redirect Flow) รองรับหลายช่องทางชำระเงิน

## 🔄 1. การทำงานของระบบ (System Flow)
เนื่องจากข้อจำกัดด้านสิทธิ์ (Permission) ของ API Key ปัจจุบัน ระบบจึงใช้ **Payment Links API** แทน Direct Charge API โดยมีขั้นตอนดังนี้:
1. **User** กรอกจำนวนเงินและกดปุ่ม "บริจาค" บนหน้าเว็บ
2. **Backend** สร้าง Payment Link ผ่าน API (`/api/v1/payment-links`)
3. **Frontend** รับ URL กลับมา และ Redirect ผู้ใช้ไปยังหน้าชำระเงินของ Beam (Secure Checkout)
4. **User** เลือกวิธีชำระเงินบนหน้าของ Beam (PromptPay, บัตรเครดิต, Mobile Banking, E-Wallets)
5. **Beam** ส่งผู้ใช้กลับมายังหน้า `Thank You` ของเราเมื่อชำระเงินเสร็จสิ้น
6. **Beam** ส่ง Webhook มายัง Server เพื่อยืนยันสถานะ `charge.succeeded` หรือ `payment_link.paid`

---

## ⚙️ 2. การตั้งค่าบน Vercel (Environment Variables)
เพื่อให้ระบบทำงานได้บน Vercel คุณต้องเข้าไปที่ **Settings > Environment Variables** และเพิ่มค่าต่อไปนี้:

| Key | Value (ตัวอย่าง) | รายละเอียด |
| :--- | :--- | :--- |
| `BEAM_MERCHANT_ID` | `xxxxxxxxxx` | Merchant ID ของคุณ (ตรวจสอบจาก Beam Dashboard) |
| `BEAM_API_KEY` | `RnpDrEs...` | API Key (สำหรับ Sandbox หรือ Production) |
| `BEAM_ENV` | `sandbox` | หรือ `production` (ต้องตรงกับ Key ที่ใช้) |
| `WEBHOOK_SECRET` | `KOFEL...=` | Secret Key จากหน้า Webhook ของ Beam Dashboard |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` | URL เชื่อมต่อของ Turso Cloud SQLite Database (สำหรับเก็บข้อมูลถาวร) |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` | JWT Auth Token สำหรับตรวจสอบสิทธิ์เข้าถึง Turso |

> **สำคัญ:** ค่าเหล่านี้จะไม่ถูกอัปโหลดไปกับ Code (Git) เพื่อความปลอดภัย คุณต้องไปใส่เองใน Vercel Dashboard

---

## 🔗 3. การตั้งค่า Webhook (Webhook Setup)
เพื่อให้ระบบบันทึกสถานะ "ชำระเงินสำเร็จ" ลงฐานข้อมูล (Database) ต้องตั้งค่า Webhook ดังนี้:

1. เข้าไปที่ **Beam Dashboard > Developers > Webhooks**
2. กด **Create Webhook**
3. ใส่ **URL Endpoint**:
   - ถ้าใช้ Vercel: `https://ชื่อโปรเจกต์ของคุณ.vercel.app/webhook`
   - ถ้าทดสอบในเครื่อง (ต้องใช้ Tunnel): `https://xxxx.ngrok-free.app/webhook`
4. เลือก **Events**:
   - `payment_link.paid`
   - `charge.succeeded`
   - `charge.failed`
5. กด Save และนำ **Signing Secret** มาใส่ใน `.env` (ตัวแปร `WEBHOOK_SECRET`)

---

## 💳 4. ช่องทางชำระเงินที่รองรับ (Payment Channels)
ระบบเปิดใช้งานทุกช่องทางที่ Beam รองรับ โดยจะเปิด/ปิดบางช่องทางอัตโนมัติตามยอดเงิน:

| ช่องทาง | สถานะ | เงื่อนไข |
| :--- | :--- | :--- |
| **QR PromptPay** | ✅ เปิดเสมอ | ไม่มีขั้นต่ำ |
| **Mobile Banking** | ✅ เปิดเสมอ | ไม่มีขั้นต่ำ |
| **E-Wallets** (TrueMoney, ShopeePay, LINE Pay ฯลฯ) | ✅ เปิดเสมอ | ไม่มีขั้นต่ำ |
| **บัตรเครดิต/เดบิต** (Visa, Mastercard, Amex, UnionPay) | ✅ เปิดเมื่อยอด ≥ 200 บาท | Beam กำหนดขั้นต่ำ 200 บาท |

> **หมายเหตุ:** ช่องทางที่แสดงจริงบนหน้า Checkout ขึ้นอยู่กับสิทธิ์ที่เปิดไว้ใน Beam Dashboard ของ Merchant ด้วย

### การตั้งค่าใน Code (`src/beam.js`)
```javascript
linkSettings: {
  qrPromptPay: { isEnabled: true },
  card: { isEnabled: amount >= 20000 }, // 20000 satang = 200 บาท
  mobileBanking: { isEnabled: true },
  eWallets: { isEnabled: true }
}
```

---

## 🧪 5. ข้อมูลสำหรับทดสอบ (Sandbox Testing)
เมื่อ `BEAM_ENV=sandbox` คุณสามารถใช้ข้อมูลจำลองเพื่อทดสอบการจ่ายเงินได้:

**บัตรเครดิตทดสอบ (Test Cards):**
| Card Brand | Card Number | Expiry | CVV | OTP |
| :--- | :--- | :--- | :--- | :--- |
| **Visa (Success)** | `4111 1111 1111 1111` | Future Date | 123 | 123456 |
| **Mastercard** | `5372 0742 4811 3841` | Future Date | 123 | 123456 |
| **Fail Check** | `4943 1299 0008 4541` | Future Date | 123 | - |

> ⚠️ ต้องบริจาค **≥ 200 บาท** เพื่อทดสอบบัตรเครดิต (ขั้นต่ำของ Beam)

**QR PromptPay:**
- ใน Sandbox จะเป็นการจำลอง (Simulate) โดยการกดปุ่ม "Mark as Paid" ในหน้าจำลองของ Beam

**Mobile Banking / E-Wallets:**
- ใน Sandbox อาจจำลองได้จำกัด ขึ้นอยู่กับการตั้งค่าของ Beam

---

## ❌ 6. การแก้ปัญหาที่พบบ่อย (Troubleshooting)

**🔴 Error 401 Unauthorized**
- **สาเหตุ:** `BEAM_MERCHANT_ID` หรือ `BEAM_API_KEY` ผิด หรือไม่ตรงกับ `BEAM_ENV`
- **วิธีแก้:** ตรวจสอบตัวสะกด และเช็คว่า Key นั้นมาจาก Sandbox หรือ Production

**🔴 Error 400 Bad Request (Credit Card Minimum)**
- **สาเหตุ:** เปิด `card: { isEnabled: true }` แต่ยอดเงินต่ำกว่า 200 บาท (Beam กำหนดขั้นต่ำบัตรเครดิต)
- **วิธีแก้:** ระบบปัจจุบันจัดการแล้ว — จะปิดบัตรเครดิตอัตโนมัติเมื่อยอด < 200 บาท (`CARD_MIN_AMOUNT = 20000` satang)

**🔴 Error 400 Bad Request (Payment Method)**
- **สาเหตุ:** ข้อมูลที่ส่งไปสร้าง Link ผิดพลาด (เช่น ยอดเงิน < 0 หรือ Type ไม่ถูกต้อง)
- **วิธีแก้:** ตรวจสอบ `linkSettings` ว่ามี field ที่ Beam API รองรับ และยอดเงินถูกต้อง

**🔴 Error EROFS: read-only file system (บน Vercel)**
- **สาเหตุ:** พยายามเขียนหรือเปิดไฟล์ SQLite `database.db` ลงในดิสก์บน Serverless Function ของ Vercel ซึ่งล็อกไว้เป็น Read-Only เท่านั้น
- **วิธีแก้:** 
  1. **ทางเลือกที่สมบูรณ์แบบ:** กำหนดตัวแปร `TURSO_DATABASE_URL` และ `TURSO_AUTH_TOKEN` บน Vercel Dashboard ระบบจะสลับไปใช้ **Turso DB** ในคลาวด์โดยทันที ข้อมูลธุรกรรมและการตั้งค่าจะบันทึกถาวร 100%
  2. **ระบบสำรอง (Fallback):** หากไม่มีการระบุตัวแปร Turso ระบบของโครงการจะสลับมาใช้ **In-Memory Fallback Engine** อัตโนมัติ เพื่อป้องกันระบบล่ม โดยข้อมูลจะเก็บชั่วคราวขณะเซิร์ฟเวอร์ตื่นทำงาน เท่านั้น
