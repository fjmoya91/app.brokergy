require('dotenv').config({ path: '../.env' });
const driveService = require('./driveService');

async function testDrive() {
    console.log('Testing Drive folder creation (corrected path)...');
    const result = await driveService.setupOpportunityFolder('TEST_OP', 'TEST_CLIENT');
    if (result) {
        console.log('SUCCESS:', result);
    } else {
        console.log('FAILED');
    }
}

testDrive();
