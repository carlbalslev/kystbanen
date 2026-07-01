// Næste afgange fra A til B via Rejseplanens rejseplan. Ved at give fra-ID og
// til-ID slipper vi for at gætte retning ud fra togets endestation — vi får
// præcis de tog der faktisk kører fra A til B (også dem der fortsætter videre).
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

    // Søg fra ~15 min bagud, så tog med planlagt afgang i den nære fortid også
    // kommer med — de kan være forsinkede og afgår i virkeligheden først nu.
    // Klienten filtrerer bagefter de reelt afgåede væk (på realtid).
    // Tiden bucketes til hele minutter, så cache-nøglen er stabil.
    const BACK_MIN = 15;
    const searchAt = new Date(Date.now() - BACK_MIN * 60000);
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Copenhagen',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(searchAt).map(x => [x.type, x.value])
    );
    const date = `${p.year}-${p.month}-${p.day}`;
    const time = `${p.hour}:${p.minute}`;

    const url = `https://www.rejseplanen.dk/api/trip` +
        `?accessId=${encodeURIComponent(apiKey)}` +
        `&originExtId=${encodeURIComponent(from)}` +
        `&destExtId=${encodeURIComponent(to)}` +
        `&date=${date}&time=${time}&searchForArrival=0` +
        `&numF=6` +            // nok afgange til at dække vinduet frem i tid
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

    const asArray = x => (Array.isArray(x) ? x : x ? [x] : []);

    const departures = asArray(data.Trip).map(t => {
        const legs = asArray(t.LegList && t.LegList.Leg);
        const jnys = legs.filter(l => l.type === 'JNY');
        const first = jnys[0];
        if (!first) return null;                 // ren gå-rute uden tog
        const o = first.Origin || {};
        const dest = (legs[legs.length - 1] || {}).Destination || {};
        return {
            name: first.name || '',
            direction: first.direction || '',
            time: o.time || null,
            rtTime: o.rtTime || null,
            date: o.date || null,
            rtDate: o.rtDate || null,
            track: o.track || null,
            rtTrack: o.rtTrack || null,
            cancelled: Boolean(first.cancelled || o.cancelled),
            changes: jnys.length - 1,
            arrTime: dest.rtTime || dest.time || null,
        };
    }).filter(Boolean);

    // Alle brugere af samme rute deler ét upstream-kald pr. 30s-vindue.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json({ departures });
}
