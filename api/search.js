function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

async function searchExternalFallback(queryStr) {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
      },
      body: 'q=' + encodeURIComponent(`site:elcomercio.pe ${queryStr}`) + '&b='
    });

    if (!res.ok) {
      console.error('DDG fallback returned status:', res.status);
      return [];
    }

    const html = await res.text();
    const resultRegex = /<div class="result results_links[^"]*"[\s\S]*?<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    const items = [];

    while ((m = resultRegex.exec(html)) !== null) {
      let url = m[1];
      if (url.includes('uddg=')) {
        const matchUddg = url.match(/uddg=([^&"]+)/);
        if (matchUddg) {
          url = decodeURIComponent(matchUddg[1]);
        }
      }

      if (!url.includes('elcomercio.pe')) continue;

      const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').trim());
      const description = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, '').trim());

      // Guess section from URL structure: https://elcomercio.pe/seccion/...
      let sectionName = 'Archivo Histórico';
      let sectionSlug = 'archivo';
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          sectionSlug = parts[0];
          sectionName = sectionSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      } catch (e) {}

      items.push({
        title,
        description,
        link: url,
        pubDate: new Date().toISOString(),
        section: sectionName,
        sectionSlug: sectionSlug,
        thumbnail: ''
      });
    }

    return items;
  } catch (err) {
    console.error('Error in external archive search fallback:', err);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { q, page = 1 } = req.query || {};
  if (!q || !q.trim()) {
    return res.status(200).json({ results: [], total: 0, page: 1, hasMore: false });
  }

  const queryStr = q.trim();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const searchUrl = `https://elcomercio.pe/buscar/${encodeURIComponent(queryStr).replace(/%20/g, '%2520')}/todas/descendiente/${pageNum}/`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    let results = [];
    let totalCount = 0;
    let hasMore = false;

    if (response.ok) {
      const html = await response.text();
      const regex = /Fusion\.globalContent\s*=\s*(\{[\s\S]*?\});/i;
      const match = html.match(regex);

      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const elements = data.content_elements || [];
          totalCount = parseInt(data.count, 10) || 0;

          results = elements.map(el => {
            const website = el.websites?.elcomercio || {};
            const section = website.website_section || {};
            const sectionPath = section.path || '';
            const sectionSlug = sectionPath.split('/').filter(Boolean).pop() || 'all';

            return {
              title: el.headlines?.basic || '',
              description: el.subheadlines?.basic || '',
              link: website.website_url ? `https://elcomercio.pe${website.website_url}` : '',
              pubDate: el.display_date || '',
              section: section.name || 'El Comercio',
              sectionSlug: sectionSlug,
              thumbnail: el.promo_items?.basic?.url || ''
            };
          }).filter(item => item.link && item.title);

          hasMore = elements.length > 0 && (totalCount > 0 ? (pageNum * 9 < totalCount) : (elements.length >= 9));
        } catch (e) {
          console.error('Error parsing Fusion content:', e);
        }
      }
    }

    // SI NO HUBO RESULTADOS EN EL COMERCIO DIRECTO (p. ej. "catacumbas", temas de archivo histórico):
    // Usamos automáticamente el fallback del Archivo Histórico sin salir de la web
    if (results.length === 0 && pageNum === 1) {
      try {
        const fallbackResults = await searchExternalFallback(queryStr);
        if (fallbackResults.length > 0) {
          results = fallbackResults;
          totalCount = fallbackResults.length;
          hasMore = false;
        }
      } catch (fbErr) {
        console.error('Fallback error:', fbErr);
      }
    }

    return res.status(200).json({
      results,
      total: totalCount,
      page: pageNum,
      hasMore,
      source: results.length > 0 && results[0]?.section === 'Archivo Histórico' ? 'archive_fallback' : 'elcomercio'
    });
  } catch (error) {
    console.error('Error performing site search:', error);
    // Intentar fallback si falló la conexión con El Comercio
    try {
      const fallbackResults = await searchExternalFallback(queryStr);
      if (fallbackResults.length > 0) {
        return res.status(200).json({
          results: fallbackResults,
          total: fallbackResults.length,
          page: 1,
          hasMore: false
        });
      }
    } catch (fbErr) {}

    return res.status(500).json({ error: 'Error al buscar noticias en El Comercio' });
  }
}
