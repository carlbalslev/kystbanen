// Stationssøgning: slår rigtige Rejseplanen-ID'er op når brugeren vælger en
// station, så vi ikke vedligeholder hardcodede (og ofte forkerte) ID'er.
export default async function handler(req, res) {
    const q = (req.query.q || '').trim();
    if (q.length < 1 || q.length > 40) {
        return res.status(400).json({ error: 'Ugyldig søgning' });
    }

    const apiKey = process.env.REJSEPLANEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const url = `https://www.rejseplanen.dk/api/location.name` +
        `?accessId=${encodeURIComponent(apiKey)}` +
        `&input=${encodeURIComponent(q)}` +
        `&type=S` +            // kun stop/stationer
        `&format=json`;

    let upstream, text;
    try {
        upstream = await fetch(url);
        text = await upstream.text();
    } catch (e) {
        return res.status(502).json({ error: 'Kunne ikke nå Rejseplanen', detail: String(e) });
    }

    let data;
    try { data = JSON.parse(text); } catch {
        return res.status(502).json({ error: 'Ikke-JSON svar fra Rejseplanen', raw: text.slice(0, 500) });
    }

    if (req.query.debug) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(data);
    }

    const stations = (data.stopLocationOrCoordLocation || [])
        .map(e => e.StopLocation)
        .filter(Boolean)
        .map(s => ({ name: s.name, id: s.extId, lat: s.lat, lon: s.lon }));

    // Stationer ændrer sig stort set aldrig → cache hårdt.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ stations });
}
