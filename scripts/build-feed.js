const fs = require('fs');
const path = require('path');

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[build-feed] Descargando RSS (intento ${i + 1}/${retries})...`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 500) throw new Error('Contenido RSS demasiado corto');
      return text;
    } catch (err) {
      console.warn(`[build-feed] Intento ${i + 1} falló:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function cleanTag(str, tag) {
  const m = str.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseFeed(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let index = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = cleanTag(itemXml, 'title');
    const link = cleanTag(itemXml, 'link');
    const description = cleanTag(itemXml, 'description');
    const pubDate = cleanTag(itemXml, 'pubDate');
    const author = cleanTag(itemXml, 'dc:creator') || 'Redacción EC';
    const contentHtml = cleanTag(itemXml, 'content:encoded');

    let imageUrl = '';
    let imageCaption = '';
    const mediaContentMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    if (mediaContentMatch) {
      imageUrl = mediaContentMatch[1].replace(/&amp;/g, '&');
    }
    const mediaDescMatch = itemXml.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i);
    if (mediaDescMatch) {
      imageCaption = mediaDescMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    }

    const urlParts = link.replace('https://elcomercio.pe/', '').split('/');
    let section = urlParts[0] || '';
    section = section.charAt(0).toUpperCase() + section.slice(1);
    section = section.replace(/-/g, ' ');

    items.push({
      id: index++,
      title,
      link,
      author,
      description,
      pubDate,
      section,
      sectionSlug: urlParts[0] || '',
      imageUrl,
      imageCaption,
      contentHtml
    });
  }

  return items;
}

async function main() {
  const rssUrl = 'https://elcomercio.pe/arcio/rss/';
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log('[build-feed] Iniciando descarga de noticias de El Comercio...');
  const xml = await fetchWithRetry(rssUrl);
  
  // Guardar archivo RSS XML original
  const rssPath = path.join(publicDir, 'rss.xml');
  fs.writeFileSync(rssPath, xml, 'utf8');
  console.log(`[build-feed] Guardado rss.xml (${(xml.length / 1024).toFixed(1)} KB)`);

  // Guardar también como api/rss para compatibilidad estática
  const apiDir = path.join(publicDir, 'api');
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
  fs.writeFileSync(path.join(apiDir, 'rss'), xml, 'utf8');

  // Parsear y guardar news.json optimizado
  const items = parseFeed(xml);
  const newsPath = path.join(publicDir, 'news.json');
  fs.writeFileSync(newsPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`[build-feed] Guardado news.json con ${items.length} artículos (${(fs.statSync(newsPath).size / 1024).toFixed(1)} KB)`);

  // Guardar metadata de actualización
  const metaPath = path.join(publicDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    count: items.length
  }, null, 2), 'utf8');

  console.log('[build-feed] Proceso completado exitosamente.');
}

main().catch(err => {
  console.error('[build-feed] Error fatal:', err);
  process.exit(1);
});
