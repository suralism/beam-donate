const crypto = require('crypto');

// ข้อมูลจาก Beam Documentation
const WEBHOOK_SECRET = 'KOFELguf5L1ltuDlkDHGUkPPnQhrgYYijTR4Fqh7APc=';
const EXPECTED_SIGNATURE = '1XzWtJHZ9Y1tmjkA/XZUIn1ZHrUQp1d0Ms0oDQfJBto=';
const REQUEST_BODY = `{"chargeId":"ch_30GtUweMWec7r2hHIsV5xxQeJKp","merchantId":"m_2sHxsByPwESKYM4nMwdEBdhubPS","referenceId":"order#10001","status":"SUCCEEDED","currency":"THB","amount":3000000,"source":"PAYMENT_LINK","sourceId":"57Iot6c11o","transactionTime":"2025-07-23T10:16:12Z","paymentMethod":{"paymentMethodType":"CARD","card":{"last4":"1111","brand":"VISA"},"cardInstallments":null,"cardNetworkToken":null,"qrPromptPay":null,"alipay":null,"weChatPay":null,"trueMoney":null,"linePay":null,"shopeePay":null,"bangkokBankApp":null,"kPlus":null,"scbEasy":null,"krungsriApp":null},"failureCode":"","customer":{"primaryPhone":{"countryCode":"+66","number":"0958051075"},"email":"","deliveryAddress":{"contactName":"","phone":{"countryCode":"","number":""},"address":{"streetAddress":"","city":"","country":"","postCode":""}}},"createdAt":"2025-07-23T10:15:56.102401Z","updatedAt":"2025-07-23T10:16:17.418991Z"}`;

function testSignature() {
    console.log('Testing Webhook Signature Verification...');
    console.log('Secret (Base64):', WEBHOOK_SECRET);
    console.log('Expected Sig:', EXPECTED_SIGNATURE);

    // 1. Decode Secret (สำคัญ!)
    const secretBuffer = Buffer.from(WEBHOOK_SECRET, 'base64');

    // 2. Create HMAC
    const hmac = crypto.createHmac('sha256', secretBuffer);

    // 3. Update & Digest as Base64
    const calculatedSignature = hmac.update(REQUEST_BODY).digest('base64');

    console.log('Calculated Sig:', calculatedSignature);

    if (calculatedSignature === EXPECTED_SIGNATURE) {
        console.log('✅ SIGNATURE MATCHED! Algorithm is correct.');
    } else {
        console.error('❌ SIGNATURE MISMATCH!');
    }
}

testSignature();
