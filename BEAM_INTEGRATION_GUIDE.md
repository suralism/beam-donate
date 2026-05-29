# Beam Checkout Integration Guide

เอกสารสรุปการเชื่อมต่อระบบรับบริจาค (Donation) กับ Beam Checkout API แบบ Payment Links (Redirect Flow)

## 🔄 1. การทำงานของระบบ (System Flow)
เนื่องจากข้อจำกัดด้านสิทธิ์ (Permission) ของ API Key ปัจจุบัน ระบบจึงใช้ **Payment Links API** แทน Direct Charge API โดยมีขั้นตอนดังนี้:
1. **User** กรอกจำนวนเงินและกดปุ่ม "บริจาค" บนหน้าเว็บ
2. **Backend** สร้าง Payment Link ผ่าน API (`/api/v1/payment-links`)
3. **Frontend** รับ URL กลับมา และ Redirect ผู้ใช้ไปยังหน้าชำระเงินของ Beam (Secure Checkout)
4. **User** สแกน QR Code หรือเลือกวิธีชำระเงินบนหน้าของ Beam
5. **Beam** ส่งผู้ใช้กลับมายังหน้า `Thank You` ของเราเมื่อชำระเงินเสร็จสิ้น
6. **Beam** ส่ง Webhook มายัง Server เพื่อยืนยันสถานะ `charge.succeeded` หรือ `payment_link.paid`

---

## ⚙️ 2. การตั้งค่าบน Vercel (Environment Variables)
เพื่อให้ระบบทำงานได้บน Vercel คุณต้องเข้าไปที่ **Settings > Environment Variables** และเพิ่มค่าต่อไปนี้:

| Key | Value (ตัวอย่าง) | รายละเอียด |
| :--- | :--- | :--- |
| `BEAM_MERCHANT_ID` | `kkstudio` | Merchant ID ของคุณ (ตรวจสอบจาก Beam Dashboard) |
| `BEAM_API_KEY` | `RnpDrEs...` | API Key (สำหรับ Sandbox หรือ Production) |
| `BEAM_ENV` | `sandbox` | หรือ `production` (ต้องตรงกับ Key ที่ใช้) |
| `WEBHOOK_SECRET` | `KOFEL...=` | Secret Key จากหน้า Webhook ของ Beam Dashboard |

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

## 🧪 4. ข้อมูลสำหรับทดสอบ (Sandbox Testing)
เมื่อ `BEAM_ENV=sandbox` คุณสามารถใช้ข้อมูลจำลองเพื่อทดสอบการจ่ายเงินได้:

**บัตรเครดิตทดสอบ (Test Cards):**
| Card Brand | Card Number | Expiry | CVV | OTP |
| :--- | :--- | :--- | :--- | :--- |
| **Visa (Success)** | `4111 1111 1111 1111` | Future Date | 123 | 123456 |
| **Mastercard** | `5372 0742 4811 3841` | Future Date | 123 | 123456 |
| **Fail Check** | `4943 1299 0008 4541` | Future Date | 123 | - |

**QR PromptPay:**
- ใน Sandbox จะเป็นการจำลอง (Simulate) โดยการกดปุ่ม "Mark as Paid" ในหน้าจำลองของ Beam

---

## ❌ 5. การแก้ปัญหาที่พบบ่อย (Troubleshooting)

**🔴 Error 401 Unauthorized**
- **สาเหตุ:** `BEAM_MERCHANT_ID` หรือ `BEAM_API_KEY` ผิด หรือไม่ตรงกับ `BEAM_ENV`
- **วิธีแก้:** ตรวจสอบตัวสะกด และเช็คว่า Key นั้นมาจาก Sandbox หรือ Production

**🔴 Error 400 Bad Request (Payment Method)**
- **สาเหตุ:** ข้อมูลที่ส่งไปสร้าง Link ผิดพลาด (เช่น ยอดเงิน < 0 หรือ Type ไม่ถูกต้อง)
- **วิธีแก้:** ระบบปัจจุบันแก้ให้ถูกต้องแล้ว (ใช้ `QR_PROMPT_PAY` หรือ `qrPromptPay: { isEnabled: true }` สำหรับ Payment Link)

**🔴 Error EROFS: read-only file system (บน Vercel)**
- **สาเหตุ:** พยายามเขียนไฟล์ JSON Database ลงใน Serverless Function
- **วิธีแก้:** ระบบปัจจุบันแก้ให้ใช้ **In-Memory Storage** ชั่วคราวเมื่อเขียนไฟล์ไม่ได้ (ข้อมูลจะหายเมื่อ Server Restart)
