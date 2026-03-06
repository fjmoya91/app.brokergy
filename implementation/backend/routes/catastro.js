const express = require('express');
const router = express.Router();
const catastroService = require('../services/catastroService');
const googleService = require('../services/googleService');

// GET /search?q=...
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        // Heuristic: RC is 14 or 20 chars alphanumeric
        const cleanQ = q.replace(/ /g, '').toUpperCase();
        const isRC = /^[A-Z0-9]{14,20}$/.test(cleanQ);

        if (isRC) {
            // Direct Catastro Lookup
            const data = await catastroService.getByRC(cleanQ);
            // If found, return as final result
            return res.json({ type: 'RC_RESULT', data });
        } else {
            // Address Search (Google)
            const candidates = await googleService.searchAddress(q);
            return res.json({ type: 'ADDRESS_CANDIDATES', data: candidates });
        }
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: 'Search failed', details: error.message });
    }
});

// POST /reverse-geocode
// This is called when user CONFIRMS an address candidate. We need to find the RC for that Lat/Lon.
router.post('/reverse-geocode', async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (!lat || !lng) {
            return res.status(400).json({ error: 'Lat and Lng required' });
        }

        // Call Catastro with Coordinates
        const rcData = await catastroService.getRCByCoords(lat, lng);

        if (!rcData) {
            return res.status(404).json({ error: 'No RC found for these coordinates' });
        }

        // Now get full details for that RC
        const fullDetails = await catastroService.getDetails(rcData.rc);

        // Merge geo info if needed (like distance)
        fullDetails._meta = { distance: rcData.distance };

        res.json(fullDetails);

    } catch (error) {
        console.error('Reverse Geocode error:', error.message);
        res.status(500).json({ error: 'Reverse geocode failed' });
    }
});

// GET /autocomplete?input=...
router.get('/autocomplete', async (req, res) => {
    try {
        const { input } = req.query;
        if (!input) {
            return res.status(400).json({ error: 'Input parameter is required' });
        }
        const predictions = await googleService.getPlaceAutocomplete(input);
        res.json(predictions);
    } catch (error) {
        console.error('Autocomplete error:', error.message);
        res.status(500).json({ error: 'Autocomplete failed' });
    }
});

// GET /place-details?place_id=...
router.get('/place-details', async (req, res) => {
    try {
        const { place_id } = req.query;
        if (!place_id) {
            return res.status(400).json({ error: 'place_id parameter is required' });
        }
        const location = await googleService.getPlaceDetails(place_id);
        if (!location) {
            return res.status(404).json({ error: 'Details not found' });
        }
        res.json(location);
    } catch (error) {
        console.error('Place Details error:', error.message);
        res.status(500).json({ error: 'Failed to get place details' });
    }
});

// GET /neighbors?address=...
router.get('/neighbors', async (req, res) => {
    try {
        const { address } = req.query;
        if (!address) {
            return res.status(400).json({ error: 'Address parameter is required' });
        }

        const neighbors = await require('../services/neighborService').resolveNeighbors(address);
        res.json(neighbors);

    } catch (error) {
        console.error('Neighbors error:', error.message);
        res.status(500).json({ error: 'Failed to resolve neighbors' });
    }
});

// GET /image/:rc - Proxy para imagen de fachada de Catastro
router.get('/image/:rc', async (req, res) => {
    try {
        const { rc } = req.params;
        if (!rc) {
            return res.status(400).json({ error: 'RC parameter is required' });
        }

        const imageData = await catastroService.getFacadeImage(rc);

        if (!imageData) {
            // Devolver una imagen placeholder o 404
            return res.status(404).json({ error: 'Image not found' });
        }

        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Content-Type', imageData.contentType);
        // Remove attachment to treat as inline image for browser rendering/canvas
        // res.set('Content-Disposition', `attachment; filename="fachada_${rc}.jpg"`);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache 24h
        res.send(Buffer.from(imageData.data));
    } catch (error) {
        console.error('Image error:', error.message);
        res.status(500).json({ error: 'Failed to fetch image' });
    }
});

// GET /parcel-image/:rc - Proxy para imagen WMS de la parcela
router.get('/parcel-image/:rc', async (req, res) => {
    try {
        const { rc } = req.params;
        if (!rc) {
            return res.status(400).json({ error: 'RC parameter is required' });
        }

        const imageData = await catastroService.getParcelImage(rc);

        if (!imageData) {
            return res.status(404).json({ error: 'Parcel image not found' });
        }

        res.set('Access-Control-Allow-Origin', '*'); // Vital para PDF
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Content-Type', imageData.contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(Buffer.from(imageData.data));

    } catch (error) {
        console.error('Parcel Image error:', error.message);
        res.status(500).json({ error: 'Failed to fetch parcel image' });
    }
});

// GET /property-data?rc=...
router.get('/property-data', async (req, res) => {
    try {
        const { rc } = req.query;
        if (!rc) {
            return res.status(400).json({ error: 'RC parameter is required' });
        }
        const data = await catastroService.getByRC(rc);
        res.json(data);
    } catch (error) {
        console.error('Property Data error:', error.message);
        res.status(500).json({ error: 'Failed to fetch property data', details: error.message });
    }
});

module.exports = router;
