// Code commun à toutes les pages : appels API, en-tête, pied de page, utilitaires.
const App = (() => {
  const state = { user: null, site: null };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Une erreur est survenue.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Échappe le HTML pour insérer du texte sans risque (XSS)
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });
  const LEVELS = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };
  const toDate = (s) => new Date(String(s).replace(' ', 'T'));
  const fmtDate = (s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => toDate(s).toLocaleDateString('fr-FR', opts);
  const fmtTime = (s) => String(s).slice(11, 16).replace(':', 'h');
  const fmtDateTime = (s) => `${fmtDate(s)} à ${fmtTime(s)}`;
  const params = new URLSearchParams(location.search);

  function toast(msg, ms = 3500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.append(t);
    setTimeout(() => t.remove(), ms);
  }

  function showAlert(el, msg, type = 'error') {
    el.className = `alert alert-${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Lit un formulaire en objet { name: value } (cases à cocher → booléen)
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    }
    return out;
  }

  // Bouton "occupé" pendant une requête
  async function busy(btn, fn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Patientez…';
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  function renderHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const u = state.user;
    const page = location.pathname.replace(/\.html$/, '').replace(/\/$/, '/index');
    const link = (href, label) => `<a href="${href}"${page === href.replace('.html', '') ? ' aria-current="page"' : ''}>${label}</a>`;
    header.className = 'site-header';
    header.innerHTML = `
      <div class="container">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>${esc(state.site?.name || 'Cabinet')}</a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <nav class="nav" id="main-nav" aria-label="Navigation principale">
          ${link('/programmes.html', 'Programmes')}
          ${link('/cabinet.html', 'Le cabinet')}
          ${u ? link('/compte.html', 'Mon espace') : link('/connexion.html', 'Connexion')}
          ${u?.role === 'admin' ? link('/admin.html', 'Administration') : ''}
          ${u ? '<a href="#" id="logout">Déconnexion</a>' : ''}
          <a class="btn btn-accent btn-sm" href="/rdv.html">Prendre rendez-vous</a>
        </nav>
      </div>`;
    const toggle = header.querySelector('.nav-toggle');
    const nav = header.querySelector('.nav');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    header.querySelector('#logout')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/auth/logout', { method: 'POST', body: {} });
      location.href = '/';
    });
  }

  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer || !state.site) return;
    const s = state.site;
    footer.className = 'site-footer';
    footer.innerHTML = `
      <div class="container">
        <div>
          <h4>${esc(s.name)}</h4>
          <p>${esc(s.therapist)} — masseur-kinésithérapeute D.E.<br>${esc(s.address)}</p>
          <p class="small">Les programmes en ligne ne remplacent pas un avis médical. En cas de douleur inhabituelle, consultez.</p>
        </div>
        <div>
          <h4>Contact</h4>
          <p><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a><br><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>
        </div>
        <div>
          <h4>Liens</h4>
          <p><a href="/programmes.html">Programmes</a><br><a href="/rdv.html">Rendez-vous</a><br><a href="/cgv.html">Conditions générales de vente</a><br><a href="/mentions-legales.html">Mentions légales &amp; confidentialité</a></p>
        </div>
      </div>`;
  }

  // Redirige vers la connexion si nécessaire
  function requireLogin() {
    if (!state.user) {
      location.href = `/connexion.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return false;
    }
    return true;
  }

  const ready = (async () => {
    const [me, site] = await Promise.all([
      api('/auth/me').catch(() => ({ user: null })),
      api('/site').catch(() => null),
    ]);
    state.user = me.user;
    state.site = site;
    // Remplit les éléments <span data-site="…"> ; data-fallback si la valeur n'est pas configurée
    document.querySelectorAll('[data-site]').forEach((el) => {
      const v = site?.[el.dataset.site];
      el.textContent = v === undefined || v === null || v === '' ? (el.dataset.fallback || '') : v;
    });
    renderHeader();
    renderFooter();
    return state;
  })();

  // Couleur stable par zone du corps (classes .area-0 à .area-5 dans le CSS)
  const areaColor = (area) => `area-${[...String(area)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6}`;

  const programCard = (p) => `
    <a class="card program-card" href="/programme.html?slug=${encodeURIComponent(p.slug)}">
      <div class="area-band ${areaColor(p.body_area)}"></div>
      <div class="row"><span class="badge">${esc(p.body_area)}</span><span class="badge badge-muted">${LEVELS[p.level] || ''}</span></div>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.short_description)}</p>
      <div class="meta"><span class="muted small">${p.duration_weeks} semaines · ${p.sessions_per_week}×/sem.</span><span class="price">${euros(p.price_cents)}</span></div>
    </a>`;

  const APPT_STATUS = { confirme: ['Confirmé', 'badge-ok'], annule: ['Annulé', 'badge-danger'], termine: ['Terminé', 'badge-muted'], absent: ['Absent', 'badge-warn'] };

  return { APPT_STATUS, api, esc, euros, LEVELS, programCard, areaColor, fmtDate, fmtTime, fmtDateTime, toDate, params, toast, showAlert, formData, busy, requireLogin, ready, state };
})();
