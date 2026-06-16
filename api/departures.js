export default async function handler(req, res) {
    const { id, maxJourneys = 40, duration = 120 } = req.query;

    const apiKey = process.env.REJSEPLANEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const url = `https://www.rejseplanen.dk/api/departureBoard` +
        `?accessId=${encodeURIComponent(apiKey)}` +
        `&id=${encodeURIComponent(id)}` +
        `&maxJourneys=${maxJourneys}` +
        `&useTrain=1&useBus=0&useMetro=0` +
        `&format=json` +
        `&duration=${duration}`;

    const upstream = await fetch(url);
    const data = await upstream.json();

    res.setHeader('Cache-Control', 's-maxage=20');
    return res.status(upstream.status).json(data);
}
