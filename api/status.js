const BIN_ID = 'eefeebf';
const KV_URL = `https://extendsclass.com/api/json-storage/bin/${BIN_ID}`;

async function getSettings() {
  try {
    const response = await fetch(KV_URL);
    if (!response.ok) throw new Error('Failed to fetch from ExtendsClass');
    return await response.json();
  } catch (error) {
    console.error('Error fetching settings:', error);
    return { siteStatus: 'active', passcode: '2026' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const settings = await getSettings();

  if (req.method === 'GET') {
    return res.status(200).json({ siteStatus: settings.siteStatus });
  }

  if (req.method === 'POST') {
    const { pin } = req.body || {};
    if (!pin) {
      return res.status(400).json({ error: 'Pin es requerido' });
    }
    const success = (pin === settings.passcode);
    return res.status(200).json({ success });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
