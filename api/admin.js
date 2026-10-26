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

async function saveSettings(settings) {
  try {
    const response = await fetch(KV_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-username, x-admin-password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Authentication check
  const username = req.headers['x-admin-username'];
  const password = req.headers['x-admin-password'];

  if (username !== 'admin' || password !== '987077308') {
    return res.status(401).json({ error: 'Usuario o contraseña de administrador incorrectos' });
  }

  if (req.method === 'GET') {
    const settings = await getSettings();
    return res.status(200).json(settings);
  }

  if (req.method === 'POST') {
    const { siteStatus, passcode } = req.body || {};
    
    if (!siteStatus || !['active', 'inactive'].includes(siteStatus)) {
      return res.status(400).json({ error: 'Estado del sitio inválido' });
    }
    
    if (!passcode || !/^\d{4}$/.test(passcode)) {
      return res.status(400).json({ error: 'El código PIN debe ser exactamente de 4 dígitos' });
    }

    const newSettings = { siteStatus, passcode };
    const success = await saveSettings(newSettings);
    
    if (success) {
      return res.status(200).json({ message: 'Configuración guardada correctamente', settings: newSettings });
    } else {
      return res.status(500).json({ error: 'Error al guardar la configuración en la base de datos' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
