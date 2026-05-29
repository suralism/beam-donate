require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const beam = require('./beam');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Simple Database (Hybrid: File + Memory)
const DB_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DB_DIR, 'transactions.json');
const SETTINGS_FILE = path.join(DB_DIR, 'overlay-settings.json');

// ใช้ In-Memory เป็นตัวหลัก เพื่อให้รองรับ Serverless (Vercel)
let transactions = [];

// ค่าตั้งค่าเริ่มต้นของ Overlay
const defaultSettings = {
  duration: 8, // seconds
  soundEnabled: true,
  soundChoice: 'chime', // chime, retro, modern, bell, none
  soundVolume: 0.5,
  ttsEnabled: false,
  ttsVolume: 0.8,
  ttsRate: 1.0,
  ttsLanguage: 'th-TH',
  ttsVoice: 'default',
  messageTemplate: '{donor} ได้บริจาค {amount} บาท! 🎉',
  showDonorMessage: true,
  minAmount: 1, // Minimum amount to trigger alert
  theme: 'glassmorphism', // glassmorphism, cyberpunk, minimal, custom
  animation: 'slide-down', // slide-down, slide-up, fade, zoom
  fontFamily: 'Noto Sans Thai',
  primaryColor: '#667eea',
  secondaryColor: '#764ba2',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.25)',
  particleCount: 15
};

let overlaySettings = { ...defaultSettings };

// ========== SSE Alert System ==========
// เก็บ list ของ connected overlay clients
let sseClients = [];

// Broadcast alert ไปยังทุก connected overlay
function broadcastAlert(alertData) {
  const data = JSON.stringify(alertData);
  console.log(`📢 Broadcasting alert to ${sseClients.length} client(s):`, alertData.donor || 'System Update', alertData.amount || '');
  sseClients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
}

// พยายามโหลดข้อมูลเก่าจากไฟล์ (ถ้ามี)
try {
  if (!fs.existsSync(DB_DIR)) {
    // ถ้าสร้าง folder ไม่ได้ (เช่นบน Vercel) จะ throw error ไป catch
    fs.mkdirSync(DB_DIR);
  }
  if (fs.existsSync(DB_FILE)) {
    const fileContent = fs.readFileSync(DB_FILE, 'utf8');
    transactions = JSON.parse(fileContent);
  }
  if (fs.existsSync(SETTINGS_FILE)) {
    const settingsContent = fs.readFileSync(SETTINGS_FILE, 'utf8');
    overlaySettings = { ...defaultSettings, ...JSON.parse(settingsContent) };
  }
} catch (err) {
  console.warn('⚠️ Warning: Cannot access file system for DB. Using in-memory storage only.');
  console.warn('Error details:', err.code || err.message);
  // บน Vercel จะตกมาที่นี่ ซึ่งโอเคทำงานต่อได้
}

// Function: บันทึก Transaction
function logTransaction(data) {
  // 1. Update In-Memory
  const existingIndex = transactions.findIndex(t => t.id === data.id);
  if (existingIndex >= 0) {
    transactions[existingIndex] = { ...transactions[existingIndex], ...data, updatedAt: new Date().toISOString() };
  } else {
    transactions.push({ ...data, createdAt: new Date().toISOString() });
  }

  // 2. Try to persist to file (Optional)
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(transactions, null, 2));
  } catch (err) {
    // ถ้าเขียนไฟล์ไม่ได้ (เช่น Vercel) ก็ข้ามไป ไม่ต้อง crash
    // console.warn('Note: Could not save transaction to file (likely read-only fs)');
  }
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

// API: สร้าง Donation (Payment Link)
app.post('/api/create-charge', async (req, res) => {
  try {
    const { amount, name, message } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
    }

    // สร้าง URL สสำหรับ Redirect กลับมาที่หน้า Thank You
    const protocol = req.headers['x-forwarded-proto'] || req.protocol; // Vercel ใช้ x-forwarded-proto
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUrl = `${protocol}://${host}/thank-you`;

    // ใช้ Payment Link API
    const charge = await beam.createPaymentLink({
      amount: Math.round(amount * 100),
      currency: 'THB',
      description: message || `Donation from ${name || 'Anonymous'}`,
      referenceId: `donate-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      redirectUrl: redirectUrl
    });

    // บันทึกรายการลง DB (status: pending)
    logTransaction({
      id: charge.paymentLinkId || charge.id,
      amount: amount,
      donor: name || 'Anonymous',
      message: message,
      status: 'pending',
      paymentUrl: charge.url,
      raw_response: charge
    });

    res.json({
      success: true,
      paymentUrl: charge.url
    });

  } catch (error) {
    console.error('❌ Create payment link failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error Message:', error.message);
    }

    res.status(500).json({
      error: 'ไม่สามารถสร้างรายการบริจาคได้',
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

      // 3. Broadcast Alert ไปยัง Overlay
      // หาข้อมูล donor จาก transaction ที่บันทึกไว้ตอน create-charge
      const tx = transactions.find(t => t.id === (charge.chargeId || charge.id)) || {};
      broadcastAlert({
        type: 'donation',
        donor: tx.donor || 'Anonymous',
        amount: amount || tx.amount || 0,
        message: tx.message || charge.description || '',
        timestamp: new Date().toISOString()
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

// ========== Overlay & Alert Routes ==========

// SSE: Stream alerts ไปยัง overlay
app.get('/api/alerts/stream', (req, res) => {
  // ตั้งค่า SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // ส่ง initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Overlay connected' })}\n\n`);

  // เพิ่ม client เข้า list
  sseClients.push(res);
  console.log(`🔗 Overlay connected. Total clients: ${sseClients.length}`);

  // Keep-alive ping ทุก 30 วินาที
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 30000);

  // Cleanup เมื่อ client disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients = sseClients.filter(client => client !== res);
    console.log(`🔌 Overlay disconnected. Total clients: ${sseClients.length}`);
  });
});

// API: ดึงรายการธุรกรรมทั้งหมด
app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

// API: อัปเดตสถานะธุรกรรมด้วยตนเอง (สำหรับ Dev/Test)
app.post('/api/transactions/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'successful', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }

  const tx = transactions.find(t => t.id === id);
  if (!tx) {
    return res.status(404).json({ error: 'ไม่พบธุรกรรมนี้' });
  }

  tx.status = status;
  tx.updatedAt = new Date().toISOString();

  // เซฟลงไฟล์
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(transactions, null, 2));
  } catch (err) {
    // ignore filesystem errors on Vercel
  }

  // หากเปลี่ยนเป็น successful ให้จำลองส่ง Alert ด้วย!
  if (status === 'successful') {
    broadcastAlert({
      type: 'donation',
      donor: tx.donor || 'Anonymous',
      amount: tx.amount || 0,
      message: tx.message || '',
      timestamp: new Date().toISOString(),
      isManualTrigger: true
    });
  }

  res.json({ success: true, transaction: tx });
});

// API: ดึงตั้งค่า Overlay ปัจจุบัน
app.get('/api/overlay/settings', (req, res) => {
  res.json(overlaySettings);
});

// API: บันทึกตั้งค่า Overlay ใหม่
app.post('/api/overlay/settings', (req, res) => {
  try {
    overlaySettings = { ...defaultSettings, ...req.body };

    // เซฟลงไฟล์
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(overlaySettings, null, 2));
    } catch (err) {
      // ignore filesystem errors on Vercel
    }

    // Broadcast ไปยัง overlay ให้ปรับตัวแบบเรียลไทม์
    broadcastAlert({
      type: 'settings_update',
      settings: overlaySettings
    });

    res.json({ success: true, settings: overlaySettings });
  } catch (error) {
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าได้', details: error.message });
  }
});

// API: ส่ง Test Alert (สำหรับทดสอบ)
app.post('/api/alerts/test', (req, res) => {
  const { donor, amount, message } = req.body;

  const alertData = {
    type: 'donation',
    donor: donor || 'ผู้ทดสอบ',
    amount: amount || 100,
    message: message || 'นี่คือ test alert 🎉',
    timestamp: new Date().toISOString()
  };

  broadcastAlert(alertData);
  res.json({ success: true, alert: alertData, clients: sseClients.length });
});

// Serve overlay page
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/overlay.html'));
});

// Serve alert test page
app.get('/alert-test', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/alert-test.html'));
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🌸 Beam Donate server running at http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.BEAM_ENV || 'sandbox'}`);
  console.log(`🎬 Overlay URL: http://localhost:${PORT}/overlay`);
  console.log(`🧪 Alert Test: http://localhost:${PORT}/alert-test`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
});
