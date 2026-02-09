require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const beam = require('./beam');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
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

    res.json({
      success: true,
      chargeId: charge.id,
      qrCodeUrl: charge.source?.qr_code_url || charge.qr_code_url,
      amount: amount,
      expiresAt: charge.expires_at
    });

  } catch (error) {
    console.error('Create charge error:', error.response?.data || error.message);
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

// Webhook: รับแจ้งเตือนจาก Beam
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());
    
    console.log('Webhook received:', event.type);

    if (event.type === 'charge.completed') {
      const charge = event.data;
      console.log(`✅ Payment successful: ${charge.id}, Amount: ${charge.amount / 100} THB`);
      // TODO: บันทึกลง database, ส่ง email, etc.
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
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
