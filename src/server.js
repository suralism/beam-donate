require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const beam = require('./beam');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Simple JSON Database
const DB_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DB_DIR, 'transactions.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR);
}

// Function: บันทึก Transaction
function logTransaction(data) {
  let transactions = [];
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, 'utf8');
      transactions = JSON.parse(fileContent);
    }
  } catch (err) {
    console.error('Error reading DB:', err);
  }

  // หาตัวซ้ำถ้ามีให้ update
  const existingIndex = transactions.findIndex(t => t.id === data.id);
  if (existingIndex >= 0) {
    transactions[existingIndex] = { ...transactions[existingIndex], ...data, updatedAt: new Date().toISOString() };
  } else {
    transactions.push({ ...data, createdAt: new Date().toISOString() });
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(transactions, null, 2));
}

// Middleware
app.use(cors());
// สำคัญ: ต้องเก็บ rawBody ไว้ verify webhook signature
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.static(path.join(__dirname, '../public')));

// API: สร้าง PromptPay Charge
app.post('/api/create-charge', async (req, res) => {
  try {
    const { amount, name, message } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
    }

    const charge = await beam.createPromptPayCharge({
      amount: Math.round(amount * 100), // Beam ใช้หน่วย satang
      currency: 'THB',
      description: message || `Donation from ${name || 'Anonymous'}`,
      metadata: {
        donor_name: name || 'Anonymous',
        message: message || ''
      }
    });

    // บันทึกรายการลง DB (status: pending)
    logTransaction({
      id: charge.id,
      amount: amount,
      donor: name || 'Anonymous',
      message: message,
      status: 'pending',
      raw_response: charge
    });

    res.json({
      success: true,
      chargeId: charge.id,
      qrCodeUrl: charge.source?.qr_code_url || charge.qr_code_url,
      amount: amount,
      expiresAt: charge.expires_at
    });

  } catch (error) {
    console.error('❌ Create charge failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error Message:', error.message);
    }

    res.status(500).json({
      error: 'ไม่สามารถสร้าง QR Code ได้',
      details: error.response?.data?.message || error.message
    });
  }
});

// API: เช็คสถานะ Charge
app.get('/api/charge/:id', async (req, res) => {
  try {
    const charge = await beam.getCharge(req.params.id);
    res.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount / 100,
      paid: charge.status === 'successful'
    });
  } catch (error) {
    console.error('Get charge error:', error.response?.data || error.message);
    res.status(500).json({ error: 'ไม่สามารถเช็คสถานะได้' });
  }
});

// Webhook: รับแจ้งเตือนจาก Beam (Secure Version)
app.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-beam-signature'];
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // 1. Verify Signature
    if (webhookSecret && signature) {
      // Webhook Secret มาในรูปแบบ Base64 ต้อง Decode ก่อน
      const secretBuffer = Buffer.from(webhookSecret, 'base64');

      const hmac = crypto.createHmac('sha256', secretBuffer);
      // ใช้ req.rawBody ที่เราเก็บไว้จาก middleware และ digest เป็น 'base64'
      const digest = hmac.update(req.rawBody).digest('base64');

      if (signature !== digest) {
        console.error('Webhook signature mismatch!');
        console.error('Expected:', digest);
        console.error('Received:', signature);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (webhookSecret && !signature) {
      console.warn('Webhook received without signature, but secret is configured.');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const event = req.body;
    console.log('Webhook received:', event.type);

    // Log additional headers for debugging
    const eventType = req.headers['x-beam-event'] || event.type;

    if (eventType === 'charge.completed' || eventType === 'charge.succeeded' || event.status === 'SUCCEEDED') {
      const charge = event; // Payload คือตัว Charge Object เลยตามเอกสาร
      const amount = charge.amount ? (charge.amount / 100) : 0;

      console.log(`✅ Payment successful: ${charge.chargeId || charge.id}, Amount: ${amount} THB`);

      // 2. Update DB
      logTransaction({
        id: charge.chargeId || charge.id,
        status: 'successful',
        paidAt: new Date().toISOString(),
        raw_webhook: event
      });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Serve thank you page
app.get('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/thank-you.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🌸 Beam Donate server running at http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.BEAM_ENV || 'sandbox'}`);
});
