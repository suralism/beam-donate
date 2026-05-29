require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const beam = require('./beam');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup SQLite Database (Turso Cloud)
const db = require('./database');
db.initDB().catch(err => console.error('❌ Database connection failed:', err));

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
  profanityFilterEnabled: true,
  profanityWords: 'ควย, เย็ด, สัส, เหี้ย, หี, แตด, ล่อ, ดอกทอง, ส้นตีน, อีดอก, อีเหี้ย, พ่อง, แม่มึง, กู, มึง',
  profanityReplaceStyle: 'asterisks', // asterisks, polite, block
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

// Function: บันทึก Transaction
async function logTransaction(data) {
  try {
    return await db.saveTransaction(data);
  } catch (err) {
    console.error('❌ Error logging transaction to SQLite/Turso:', err.message);
    return null;
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
    await logTransaction({
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
app.post('/webhook', async (req, res) => {
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
      const chargeId = charge.chargeId || charge.id;
      const paymentLinkId = charge.sourceId; // sourceId is the Payment Link ID in Beam webhook

      console.log(`✅ Payment successful: ${chargeId}, Amount: ${amount} THB (Link ID: ${paymentLinkId})`);

      // 1. Find existing transaction by Payment Link ID (first) or Charge ID (second)
      let tx = null;
      if (paymentLinkId) {
        tx = await db.getTransactionById(paymentLinkId);
      }
      if (!tx && chargeId) {
        tx = await db.getTransactionById(chargeId);
      }

      const targetId = tx ? tx.id : (paymentLinkId || chargeId);

      // 2. Update DB
      await logTransaction({
        id: targetId,
        amount: amount || (tx ? tx.amount : 0),
        status: 'successful',
        paidAt: new Date().toISOString(),
        raw_webhook: event
      });

      // 3. Broadcast Alert ไปยัง Overlay
      // ดึงข้อมูลล่าสุดหลังอัปเดตเพื่อส่งแจ้งเตือน
      const txDetails = (await db.getTransactionById(targetId)) || {};
      broadcastAlert({
        type: 'donation',
        donor: txDetails.donor || 'Anonymous',
        amount: amount || txDetails.amount || 0,
        message: txDetails.message || charge.description || '',
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
app.get('/api/transactions', async (req, res) => {
  try {
    res.json(await db.getTransactions());
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลรายการธุรกรรมได้', details: err.message });
  }
});

// API: อัปเดตสถานะธุรกรรมด้วยตนเอง (สำหรับ Dev/Test)
app.post('/api/transactions/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'successful', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }

  try {
    const tx = await db.getTransactionById(id);
    if (!tx) {
      return res.status(404).json({ error: 'ไม่พบธุรกรรมนี้' });
    }

    const updatedTx = await db.saveTransaction({
      id,
      status
    });

    // หากเปลี่ยนเป็น successful ให้จำลองส่ง Alert ด้วย!
    if (status === 'successful') {
      broadcastAlert({
        type: 'donation',
        donor: updatedTx.donor || 'Anonymous',
        amount: updatedTx.amount || 0,
        message: updatedTx.message || '',
        timestamp: new Date().toISOString(),
        isManualTrigger: true
      });
    }

    res.json({ success: true, transaction: updatedTx });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถอัปเดตสถานะธุรกรรมได้', details: err.message });
  }
});

// API: ดึงตั้งค่า Overlay ปัจจุบัน
app.get('/api/overlay/settings', async (req, res) => {
  try {
    res.json(await db.getSettings(defaultSettings));
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงการตั้งค่าได้', details: err.message });
  }
});

// API: บันทึกตั้งค่า Overlay ใหม่
app.post('/api/overlay/settings', async (req, res) => {
  try {
    const newSettings = { ...defaultSettings, ...req.body };
    const savedSettings = await db.saveSettings(newSettings);

    // Broadcast ไปยัง overlay ให้ปรับตัวแบบเรียลไทม์
    broadcastAlert({
      type: 'settings_update',
      settings: savedSettings
    });

    res.json({ success: true, settings: savedSettings });
  } catch (error) {
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าได้', details: error.message });
  }
});

// API: proxy สำหรับสังเคราะห์เสียงพูดผ่าน Google Translate Cloud TTS (ป้องกัน CORS และ 403 Forbidden ของเบราว์เซอร์)
app.get('/api/tts', (req, res) => {
  try {
    const text = req.query.text;
    const lang = req.query.lang || 'th';

    if (!text) {
      return res.status(400).send('Text is required');
    }

    const encodedText = encodeURIComponent(text);
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;

    // ส่ง request ไปยัง Google Translate ด้วย User-Agent เสมือนเบราว์เซอร์เพื่อป้องกัน 403
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    };

    https.get(googleTtsUrl, options, (googleRes) => {
      if (googleRes.statusCode !== 200) {
        console.error(`Google TTS responded with status ${googleRes.statusCode}`);
        return res.status(googleRes.statusCode).send('Error generating TTS from cloud');
      }

      // ส่งคืนหัวไฟล์เสียง mpeg
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000'
      });

      // Stream ไฟล์เสียงตรงไปยังเบราว์เซอร์ผู้ใช้
      googleRes.pipe(res);
    }).on('error', (e) => {
      console.error('TTS Proxy connection error:', e);
      res.status(500).send('Proxy connection failed');
    });
  } catch (error) {
    console.error('TTS API error:', error);
    res.status(500).send('Internal server error');
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
  console.log(`🌸 Stream Donation server running at http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.BEAM_ENV || 'sandbox'}`);
  console.log(`🎬 Overlay URL: http://localhost:${PORT}/overlay`);
  console.log(`🧪 Alert Test: http://localhost:${PORT}/alert-test`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
});
