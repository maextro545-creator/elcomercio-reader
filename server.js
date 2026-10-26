const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Cache for RSS feed
let cachedNews = null;
let lastFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchRSS() {
  const now = Date.now();
  if (cachedNews && (now - lastFetch) < CACHE_DURATION) {
    return cachedNews;
  }

  try {
    const response = await fetch('https://elcomercio.pe/arcio/rss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xmlText = await response.text();
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });

    const result = await parser.parseStringPromise(xmlText);
    const items = result.rss.channel.item;

    const news = (Array.isArray(items) ? items : [items]).map((item, index) => {
      // Extract image URL
      let imageUrl = '';
      let imageCaption = '';
      if (item.content && item.content.$) {
        imageUrl = item.content.$.url || '';
        if (item.content.description && item.content.description._) {
          imageCaption = item.content.description._;
        }
      }

      // Extract section from link
      const link = item.link || '';
      const urlParts = link.replace('https://elcomercio.pe/', '').split('/');
      let section = urlParts[0] || '';
      section = section.charAt(0).toUpperCase() + section.slice(1);
      section = section.replace(/-/g, ' ');

      // Parse date
      const pubDate = item.pubDate || '';

      // Get article content HTML
      const contentHtml = item.encoded || '';

      return {
        id: index,
        title: item.title || '',
        link: item.link || '',
        author: item.creator || 'Redacción EC',
        description: item.description || '',
        pubDate,
        section,
        imageUrl: imageUrl.replace(/&amp;/g, '&'),
        imageCaption,
        contentHtml
      };
    });

    cachedNews = news;
    lastFetch = now;
    return news;
  } catch (error) {
    console.error('Error fetching RSS:', error.message);
    if (cachedNews) return cachedNews;
    throw error;
  }
}

// API endpoint - get all news
app.get('/api/noticias', async (req, res) => {
  try {
    const news = await fetchRSS();
    res.json({ success: true, data: news, count: news.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint - get single article
app.get('/api/noticia/:id', async (req, res) => {
  try {
    const news = await fetchRSS();
    const article = news[parseInt(req.params.id)];
    if (!article) {
      return res.status(404).json({ success: false, error: 'Artículo no encontrado' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint - force refresh
app.get('/api/refresh', async (req, res) => {
  cachedNews = null;
  lastFetch = 0;
  try {
    const news = await fetchRSS();
    res.json({ success: true, data: news, count: news.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🗞️  El Comercio Reader corriendo en http://localhost:${PORT}\n`);
});
