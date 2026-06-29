function mockResponse(stationId) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => {
        const s = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' });
        const [h, m] = s.split(':');
        return `${pad(h)}:${pad(m)}`;
    };

    const t1   = new Date(now.getTime() + 8 * 60000);
    const t2   = new Date(now.getTime() + 23 * 60000);
    const t1rt = new Date(t1.getTime() + 4 * 60000);

    // Fra København H kører tog mod Helsingør, fra Humlebæk mod København H
    const direction = stationId === '8600626' ? 'Helsingør' : 'København H';

    return {
        DepartureBoard: {
            Departure: [
                { name: 'Re 1', direction, time: fmt(t1), rtTime: fmt(t1rt), track: '4', rtTrack: '4', cancelled: 'false' },
                { name: 'Re 1', direction, time: fmt(t2), track: '3', cancelled: 'false' }
            ]
        }
    };
}

// Kun stationer på Kystbanen-linjen må forespørges. Lås både hvilke ID'er der
// er tilladt og selve forespørgslens størrelse, så ingen klient kan lave dyre
// kald eller sprede edge-cachen ud over fremmede ID'er.
const ALLOWED_STATIONS = new Set([
    '8600683', // Helsingør
    '8600680', // Snekkersten
    '8600677', // Espergærde
    '8600858', // Humlebæk
    '8600671', // Nivå
    '8600668', // Kokkedal
    '8600665', // Rungsted Kyst
    '8600662', // Vedbæk
    '8600659', // Skodsborg
    '8600748', // Klampenborg
    '8600672', // Hellerup
    '8600612', // Østerport
    '8600626', // København H
]);

const MAX_JOURNEYS = 40;
const DURATION = 120;

export default async function handler(req, res) {
    const { id } = req.query;

    if (!ALLOWED_STATIONS.has(id)) {
        return res.status(400).json({ error: 'Ukendt eller ikke-tilladt station' });
    }

    const apiKey = process.env.REJSEPLANEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    if (apiKey === 'TBD') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(mockResponse(id));
    }

    const url = `https://www.rejseplanen.dk/api/departureBoard` +
        `?accessId=${encodeURIComponent(apiKey)}` +
        `&id=${encodeURIComponent(id)}` +
        `&maxJourneys=${MAX_JOURNEYS}` +
        `&useTrain=1&useBus=0&useMetro=0` +
        `&format=json` +
        `&duration=${DURATION}`;

    const upstream = await fetch(url);
    const text = await upstream.text();

    let data;
    try { data = JSON.parse(text); } catch {
        return res.status(502).json({ error: 'Rejseplanen svarede ikke med JSON', raw: text.slice(0, 500) });
    }

    if (!upstream.ok || data.errorCode || data.error) {
        return res.status(502).json({ error: 'Rejseplanen fejl', details: data });
    }

    // Alle brugere af samme station deler ét upstream-kald pr. 30s-vindue.
    // stale-while-revalidate serverer øjeblikkeligt cached data mens et nyt
    // kald hentes i baggrunden — forbruget afhænger af stationer, ikke brugere.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json(data);
}
