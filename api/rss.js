export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'max-age=300, s-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const response = await fetch('https://elcomercio.pe/arcio/rss/');
    if (!response.ok) {
      throw new Error(`El Comercio RSS returned ${response.status}`);
    }
    const xml = await response.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  } catch (error) {
    console.error('Error fetching RSS:', error);
    return res.status(502).json({ error: 'No se pudo descargar el feed RSS' });
  }
}
