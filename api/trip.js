// Næste afgange fra A til B via Rejseplanens rejseplan. Ved at give fra-ID og
// til-ID slipper vi for at gætte retning ud fra togets endestation — vi får
// præcis de tog der faktisk kører fra A til B.
const ID_RE = /^\d{5,12}$/;

export default async function handler(req, res) {
    const { from, to } = req.query;
    if (!ID_RE.test(from) || !ID_RE.test(to)) {
        return res.status(400).json({ error: 'Ugyldigt stations-ID' });
    }

    const apiKey = process.env.REJSEPLANEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const url = `https://www.rejseplanen.dk/api/trip` +
        `?accessId=${encodeURIComponent(apiKey)}` +
        `&originExtId=${encodeURIComponent(from)}` +
        `&destExtId=${encodeURIComponent(to)}` +
        `&numF=4` +            // de næste 4 afgange frem i tid
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

    // Normalisering tilføjes når jeg har bekræftet trip-strukturen live.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json(data);
}
