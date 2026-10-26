// ============================================
// EL COMERCIO READER - APP.JS
// ============================================

let allNews = [];
let currentFilter = 'all';

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const newsFeed = document.getElementById('newsFeed');
const heroSection = document.getElementById('heroSection');
const newsGrid = document.getElementById('newsGrid');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const modalSourceLink = document.getElementById('modalSourceLink');
const refreshBtn = document.getElementById('refreshBtn');
const refreshBtnSticky = document.getElementById('refreshBtnSticky');
const stickyHeader = document.getElementById('stickyHeader');
const navList = document.getElementById('navList');
const lastUpdate = document.getElementById('lastUpdate');
const newsCount = document.getElementById('newsCount');
const currentDateEl = document.getElementById('currentDate');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  loadNews();
  setupEventListeners();
  setupStickyHeader();
});

function setCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('es-PE', options);
  currentDateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

function setupEventListeners() {
  // Refresh buttons
  refreshBtn.addEventListener('click', () => refreshNews(refreshBtn));
  refreshBtnSticky.addEventListener('click', () => refreshNews(refreshBtnSticky));

  // Modal close
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Navigation filter
  navList.addEventListener('click', (e) => {
    const link = e.target.closest('.nav__link');
    if (!link) return;
    e.preventDefault();

    document.querySelectorAll('.nav__link').forEach(l => l.classList.remove('nav__link--active'));
    link.classList.add('nav__link--active');

    currentFilter = link.dataset.section;
    renderNews(filterNews(allNews));
    window.scrollTo({ top: document.querySelector('.main').offsetTop - 60, behavior: 'smooth' });
  });

  // Footer section links
  document.querySelectorAll('.footer__links a[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      currentFilter = section;

      document.querySelectorAll('.nav__link').forEach(l => l.classList.remove('nav__link--active'));
      const navLink = document.querySelector(`.nav__link[data-section="${section}"]`);
      if (navLink) navLink.classList.add('nav__link--active');

      renderNews(filterNews(allNews));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function setupStickyHeader() {
  const mainHeader = document.getElementById('mainHeader');
  let headerBottom = 0;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        stickyHeader.classList.add('visible');
      } else {
        stickyHeader.classList.remove('visible');
      }
    });
  }, { threshold: 0 });

  if (mainHeader) observer.observe(mainHeader);
}

// ============================================
// DATA FETCHING
// ============================================

async function loadNews() {
  showLoading();
  try {
    const response = await fetch('/api/noticias');
    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    allNews = data.data;
    renderNews(filterNews(allNews));
    showNewsFeed();
    updateFooterInfo();
  } catch (error) {
    showError(error.message);
  }
}

async function refreshNews(btn) {
  if (btn) btn.classList.add('loading');
  try {
    const response = await fetch('/api/refresh');
    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    allNews = data.data;
    renderNews(filterNews(allNews));
    showNewsFeed();
    updateFooterInfo();
  } catch (error) {
    console.error('Error refreshing:', error);
  } finally {
    if (btn) {
      setTimeout(() => btn.classList.remove('loading'), 600);
    }
  }
}

function filterNews(news) {
  if (currentFilter === 'all') return news;
  return news.filter(item => {
    const sectionSlug = item.section.toLowerCase().replace(/\s+/g, '-');
    return sectionSlug.includes(currentFilter) || item.link.includes(`/${currentFilter}/`);
  });
}

// ============================================
// UI STATE MANAGEMENT
// ============================================

function showLoading() {
  loadingState.style.display = 'flex';
  errorState.style.display = 'none';
  newsFeed.style.display = 'none';
}

function showError(msg) {
  loadingState.style.display = 'none';
  errorState.style.display = 'flex';
  newsFeed.style.display = 'none';
  errorMessage.textContent = msg;
}

function showNewsFeed() {
  loadingState.style.display = 'none';
  errorState.style.display = 'none';
  newsFeed.style.display = 'block';
}

function updateFooterInfo() {
  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  newsCount.textContent = allNews.length;
}

// ============================================
// RENDERING
// ============================================

function renderNews(news) {
  if (!news || news.length === 0) {
    heroSection.innerHTML = '';
    newsGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <p style="font-size:1.125rem;color:#8a8a8a;">No se encontraron noticias para esta sección.</p>
      </div>
    `;
    return;
  }

  // Hero - First article
  const hero = news[0];
  heroSection.innerHTML = `
    <div class="hero__article fade-in" onclick="openArticle(${hero.id})">
      <div class="hero__image-wrapper">
        ${hero.imageUrl ? `
          <img src="${hero.imageUrl}" alt="${escapeHtml(hero.title)}" class="hero__image" loading="eager"
               onerror="this.parentElement.style.display='none'">
          ${hero.imageCaption ? `<div class="hero__image-caption">${escapeHtml(hero.imageCaption)}</div>` : ''}
        ` : ''}
      </div>
      <div class="hero__content">
        <span class="hero__section">${escapeHtml(hero.section)}</span>
        <h2 class="hero__title">${escapeHtml(hero.title)}</h2>
        ${hero.description ? `<p class="hero__description">${escapeHtml(hero.description)}</p>` : ''}
        <div class="hero__meta">
          <span class="hero__author">${escapeHtml(hero.author)}</span>
          <span class="news-card__dot"></span>
          <time>${formatDate(hero.pubDate)}</time>
        </div>
      </div>
    </div>
    <div class="hero__divider"></div>
  `;

  // Remaining articles
  const remaining = news.slice(1);
  let gridHtml = '';

  // Group by section for "all" view, or just list for filtered
  if (currentFilter === 'all' && remaining.length > 3) {
    // First 3 as featured cards
    gridHtml += '<h3 class="news-grid__section-title">Últimas Noticias</h3>';
    remaining.slice(0, 6).forEach(article => {
      gridHtml += renderNewsCard(article, false);
    });

    // Group remaining by section
    const sections = {};
    remaining.slice(6).forEach(article => {
      const key = article.section || 'Otras';
      if (!sections[key]) sections[key] = [];
      sections[key].push(article);
    });

    Object.keys(sections).forEach(section => {
      gridHtml += `<h3 class="news-grid__section-title">${escapeHtml(section)}</h3>`;
      sections[section].forEach(article => {
        gridHtml += renderNewsCard(article, false);
      });
    });
  } else {
    remaining.forEach(article => {
      gridHtml += renderNewsCard(article, false);
    });
  }

  newsGrid.innerHTML = gridHtml;
}

function renderNewsCard(article, featured = false) {
  return `
    <div class="news-card ${featured ? 'news-card--featured' : ''} fade-in" onclick="openArticle(${article.id})">
      ${article.imageUrl ? `
        <div class="news-card__image-wrapper">
          <img src="${article.imageUrl}" alt="${escapeHtml(article.title)}" 
               class="news-card__image" loading="lazy"
               onerror="this.parentElement.style.display='none'">
        </div>
      ` : ''}
      <div class="news-card__content">
        <span class="news-card__section">${escapeHtml(article.section)}</span>
        <h3 class="news-card__title">${escapeHtml(article.title)}</h3>
        ${featured && article.description ? `<p class="news-card__description">${escapeHtml(article.description)}</p>` : ''}
        <div class="news-card__meta">
          <span class="news-card__author">${escapeHtml(article.author)}</span>
          <span class="news-card__dot"></span>
          <time>${formatDate(article.pubDate)}</time>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// ARTICLE MODAL
// ============================================

function openArticle(id) {
  const article = allNews.find(n => n.id === id);
  if (!article) return;

  modalSourceLink.href = article.link;

  let articleHtml = `
    <div class="article__section">${escapeHtml(article.section)}</div>
    <h1 class="article__title">${escapeHtml(article.title)}</h1>
    ${article.description ? `<p class="article__description">${escapeHtml(article.description)}</p>` : ''}
    <div class="article__meta">
      <span class="article__author">${escapeHtml(article.author)}</span>
      <span class="news-card__dot"></span>
      <span class="article__date">${formatDateFull(article.pubDate)}</span>
    </div>
  `;

  if (article.imageUrl) {
    articleHtml += `
      <div class="article__image-container">
        <img src="${article.imageUrl}" alt="${escapeHtml(article.title)}" class="article__image">
        ${article.imageCaption ? `<div class="article__image-caption">${escapeHtml(article.imageCaption)}</div>` : ''}
      </div>
    `;
  }

  if (article.contentHtml) {
    // Process the content HTML to fix image URLs and links
    let processedContent = article.contentHtml
      .replace(/&amp;/g, '&')
      .replace(/href="https:\/\/elcomercio\.pe/g, 'href="https://elcomercio.pe')
      .replace(/<a\s/g, '<a target="_blank" rel="noopener" ');

    articleHtml += `<div class="article__body">${processedContent}</div>`;
  } else {
    articleHtml += `
      <div class="article__body">
        <p style="text-align:center;color:#8a8a8a;padding:40px 0;">
          El contenido completo no está disponible. 
          <a href="${article.link}" target="_blank" rel="noopener">Leer en elcomercio.pe →</a>
        </p>
      </div>
    `;
  }

  modalContent.innerHTML = articleHtml;

  // Show modal with animation
  modalOverlay.classList.add('active');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    modalOverlay.classList.add('visible');
  });

  // Scroll modal to top
  modalOverlay.querySelector('.modal').scrollTop = 0;
}

function closeModal() {
  modalOverlay.classList.remove('visible');
  setTimeout(() => {
    modalOverlay.classList.remove('active');
    document.body.classList.remove('modal-open');
    modalContent.innerHTML = '';
  }, 300);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours < 24) return `Hace ${hours}h`;
    
    return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}
