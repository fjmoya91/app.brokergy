const googleService = require('./googleService');
const catastroService = require('./catastroService');

/**
 * Extracts the street number from an address string.
 * Returns { prefix, number, suffix } or null.
 */
function parseAddressNumber(address) {
    // Regex to match "Calle Name, NUMBER, City" or similar
    // We look for a number isolated by spaces or commas
    // This is a heuristic and might need refinement for complex cases
    // Example: "Calle Don Sergio, 12, Tomelloso" -> matches "12"
    const match = address.match(/^(.*?)[\s,]+(\d+)([\s,].*)?$/);
    if (!match) return null;

    return {
        prefix: match[1],
        number: parseInt(match[2]),
        suffix: match[3] || ''
    };
}

/**
 * Generates neighbor addresses +/- 3
 */
function generateNeighborAddresses(address) {
    const parsed = parseAddressNumber(address);
    if (!parsed) return [];

    const num = parsed.number;
    const isEven = num % 2 === 0;
    const step = 2; // Usually street numbers go by 2 on each side (2, 4, 6...)

    const neighbors = [];
    const offsets = [-3, -2, -1, 1, 2, 3];

    offsets.forEach(offset => {
        // Calculate new number
        // If parity is mixed or we just want sequential, we might change logic.
        // Standard Spanish addressing: Odd on one side, Even on other.
        // So we want num - 6, num - 4, num - 2, num + 2, num + 4, num + 6
        // Wait, user asked for "12, 10, 8" and "16, 18, 20" for "14"
        // That implies step of 2.

        const delta = offset * step;
        const neighborNum = num + delta;

        if (neighborNum > 0) {
            neighbors.push({
                address: `${parsed.prefix}, ${neighborNum}${parsed.suffix}`,
                number: neighborNum,
                isMain: false,
                offset: offset
            });
        }
    });

    return neighbors;
}

/**
 * Resolves a list of neighbor addresses to RCs and Images
 */
async function resolveNeighbors(address) {
    const neighbors = generateNeighborAddresses(address);

    // Also include the main address to ensure it's in the list/context if needed, 
    // but usually the caller handles the main one. 
    // Let's just resolve the generated neighbors.

    const tasks = neighbors.map(async (n) => {
        try {
            // 1. Google Search to get Lat/Lng
            const candidates = await googleService.searchAddress(n.address);
            if (!candidates || candidates.length === 0) return { ...n, status: 'NOT_FOUND' };

            const loc = candidates[0].location;

            // 2. Catastro Search for RC
            const rcData = await catastroService.getRCByCoords(loc.lat, loc.lng);

            if (rcData) {
                return {
                    ...n,
                    status: 'FOUND',
                    rc: rcData.rc,
                    location: loc, // Use resolved location
                    imageUrl: `/api/catastro/image/${rcData.rc}`
                };
            } else {
                return { ...n, status: 'NO_RC', location: loc };
            }

        } catch (error) {
            console.error(`Error resolving neighbor ${n.address}:`, error.message);
            return { ...n, status: 'ERROR' };
        }
    });

    // Run in parallel
    const results = await Promise.all(tasks);
    return results;
}

module.exports = {
    generateNeighborAddresses,
    resolveNeighbors
};
