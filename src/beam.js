const axios = require('axios');

const BEAM_ENV = process.env.BEAM_ENV || 'sandbox';
const BASE_URL = BEAM_ENV === 'production'
  ? 'https://api.beamcheckout.com'
  : 'https://playground.api.beamcheckout.com';

const MERCHANT_ID = process.env.BEAM_MERCHANT_ID;
const API_KEY = process.env.BEAM_API_KEY;

// สร้าง Basic Auth header (MerchantID : APIKey)
const getAuthHeader = () => {
  if (!MERCHANT_ID || !API_KEY) {
    console.error('❌ Missing Beam Credentials: Check .env file');
  }
  const credentials = Buffer.from(`${MERCHANT_ID}:${API_KEY}`).toString('base64');
  return `Basic ${credentials}`;
};

// สร้าง Axios instance
const beamApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': getAuthHeader()
  }
});

/**
 * สร้าง PromptPay Charge
 * @param {Object} options
 * @param {number} options.amount - จำนวนเงิน (satang)
 * @param {string} options.currency - สกุลเงิน (THB)
 * @param {string} options.description - คำอธิบาย
 * @param {Object} options.metadata - ข้อมูลเพิ่มเติม
 */
async function createPromptPayCharge({ amount, currency = 'THB', description, metadata = {} }) {
  const response = await beamApi.post('/api/v1/charges', {
    amount,
    currency,
    description,
    source: {
      type: 'promptpay' // เปลี่ยนจาก 'promptpay' เป็น 'promptpay_qr' ตาม Doc หรือไม่? ต้องเช็คอีกที แต่แก้ URL ก่อน
    },
    metadata
  });

  return response.data;
}

/**
 * ดึงข้อมูล Charge
 * @param {string} chargeId 
 */
async function getCharge(chargeId) {
  const response = await beamApi.get(`/api/v1/charges/${chargeId}`);
  return response.data;
}

/**
 * ดึงรายการ Charges
 * @param {Object} options
 * @param {number} options.limit
 * @param {string} options.starting_after
 */
async function listCharges({ limit = 10, starting_after } = {}) {
  const params = { limit };
  if (starting_after) params.starting_after = starting_after;

  const response = await beamApi.get('/api/v1/charges', { params });
  return response.data;
}

module.exports = {
  createPromptPayCharge,
  getCharge,
  listCharges
};
