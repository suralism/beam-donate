require('dotenv').config();
const beam = require('./src/beam');

async function test() {
    try {
        console.log('Testing Create Charge...');
        console.log('Merchant ID:', process.env.BEAM_MERCHANT_ID);

        // Test Create Charge
        const result = await beam.createPromptPayCharge({
            amount: 5000, // 50.00 THB
            currency: 'THB',
            description: 'Test Charge Debug'
        });

        console.log('✅ Success! Charge ID:', result.id);
        console.log('QR Code URL:', result.source?.qr_code_url || result.qr_code_url);

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
