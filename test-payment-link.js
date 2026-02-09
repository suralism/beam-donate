require('dotenv').config();
const beam = require('./src/beam');

async function test() {
    try {
        console.log('Testing Create Payment Link...');
        console.log('Merchant ID:', process.env.BEAM_MERCHANT_ID);

        // Test Create Payment Link (API ใหม่)
        const result = await beam.createPaymentLink({
            amount: 5000,
            currency: 'THB',
            description: 'Test Payment Link',
            referenceId: `test-${Date.now()}`
        });

        console.log('✅ Success! Payment Link ID:', result.paymentLinkId || result.id);
        console.log('Payment URL:', result.url);

    } catch (error) {
        console.error('❌ Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

test();
