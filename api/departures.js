function mockResponse() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const t1 = new Date(now.getTime() + 8 * 60000);
    const t2 = new Date(now.getTime() + 23 * 60000);
    const t1rt = new Date(t1.getTime() + 4 * 60000);

    return {
        DepartureBoard: {
            Departure: [
                {
                    name: 'Re 1',
                    direction: 'Helsingør',
                    time: fmt(t1),
                    rtTime: fmt(t1rt),
                    track: '4',
                    rtTrack: '4',
                    cancelled: 'false'
                },
                {
                    name: 'Re 1',
                    direction: 'Helsingør',
                    time: fmt(t2),
                    track: '3',
                    cancelled: 'false'
                }
            ]
        }
    };
}

export default async function handler(req, res) {
    const { id, maxJourneys = 40, duration = 120 } = req.query;

    const apiKey = process.env.REJSEPLANEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    if (apiKey === 'TBD') {
        return res.status(200).json(mockResponse());
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
