const dotenv = require('dotenv');
dotenv.config();
const neighborService = require('./services/neighborService');

async function run() {
    const address = "CL CAPITAN SANCHEZ ALCANTARA 14 13710 ARGAMASILLA DE ALBA (CIUDAD REAL)";
    console.log(`Testing Address: "${address}"`);

    console.log('\n1. Generating Addresses...');
    const generated = neighborService.generateNeighborAddresses(address);
    console.log('Generated:', generated.map(n => n.address));

    if (generated.length === 0) {
        console.error('❌ Failed to generate neighbors. Regex mismatch?');
    }

    console.log('\n2. Resolving Neighbors (Dry Run - just count)...');
    try {
        const resolved = await neighborService.resolveNeighbors(address);
        console.log('Resolved count:', resolved.length);
        resolved.forEach(r => {
            console.log(`[${r.status}] #${r.number} - ${r.address} - RC: ${r.rc || 'N/A'}`);
        });
    } catch (err) {
        console.error('Error resolving:', err);
    }
}

run();
