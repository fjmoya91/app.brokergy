const axios = require('axios');

const API_KEY = process.env.GOOGLE_MAPS_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api';

async function searchAddress(query) {
    if (!API_KEY || API_KEY.startsWith('YOUR_')) {
        console.warn('Google API Key missing. Returning mocks.');
        return mockSearch(query);
    }

    try {
        // Use Geocoding API for "Address -> Lat/Lon"
        // We could use Places Autocomplete, but that is usually client-side.
        // For server-side search, Geocoding is the standard for resolving an address string to location.
        const url = `${BASE_URL}/geocode/json?address=${encodeURIComponent(query)}&components=country:ES&key=${API_KEY}`;

        const response = await axios.get(url);
        const data = response.data;

        if (data.status !== 'OK') {
            console.warn(`Google Geocode status: ${data.status}`);
            return [];
        }

        // Map results to our Candidate format
        return data.results.map(item => ({
            description: item.formatted_address,
            place_id: item.place_id,
            location: item.geometry.location, // { lat, lng }
            // We will perform the Catastro lookup LATER, when user CONFIRMS this location.
            // This saves Catastro API calls and complexity.
        }));

    } catch (error) {
        console.error('Google Service Error:', error.message);
        return [];
    }
}

async function getPlaceAutocomplete(input) {
    if (!API_KEY || API_KEY.startsWith('YOUR_')) {
        return mockAutocomplete(input);
    }

    try {
        const url = `${BASE_URL}/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:es&language=es&key=${API_KEY}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.warn(`Google Autocomplete status: ${data.status}`);
            return [];
        }

        return data.predictions.map(p => ({
            description: p.description,
            place_id: p.place_id,
        }));
    } catch (error) {
        console.error('Google Autocomplete Error:', error.message);
        return [];
    }
}

async function getPlaceDetails(placeId) {
    if (!API_KEY || API_KEY.startsWith('YOUR_')) {
        return mockDetails(placeId);
    }

    try {
        // We only need geometry (location)
        const url = `${BASE_URL}/place/details/json?place_id=${placeId}&fields=geometry&key=${API_KEY}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.status !== 'OK') {
            console.warn(`Google Details status: ${data.status}`);
            return null;
        }

        return data.result.geometry.location; // { lat, lng }
    } catch (error) {
        console.error('Google Details Error:', error.message);
        return null;
    }
}

function mockSearch(query) {
    return [
        {
            description: `[MOCK] ${query} (Simulada)`,
            place_id: 'mock_1',
            location: { lat: 40.416775, lng: -3.703790 } // Puerta del Sol
        }
    ];
}

function mockAutocomplete(input) {
    return [
        { description: `[MOCK] Calle de ${input}, Madrid`, place_id: 'mock_auto_1' },
        { description: `[MOCK] Avenida de ${input}, Barcelona`, place_id: 'mock_auto_2' }
    ];
}

function mockDetails(placeId) {
    return { lat: 40.416775, lng: -3.703790 };
}

module.exports = {
    searchAddress,
    getPlaceAutocomplete,
    getPlaceDetails
};
