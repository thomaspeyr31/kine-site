// Administration — cœur : onglets, statistiques, utilitaires partagés par les autres modules.
const Admin = (() => {
  const { esc, euros } = App;
  const panel = document.getElementById('panel');
  const tabs = {};
  let current = 'agenda';

  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const STATUS = App.APPT_STATUS; // { confirme: ['Confirmé', 'badge-ok'], … }
  const TYPE_SHORT = { bilan: 'Bilan', seance: 'Séance', suivi: 'Suivi' };

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = (s) => String(s).slice(11, 16).replace(':', 'h');
  const age = (birth) => (birth ? Math.floor((Date.now() - new Date(birth)) / (365.25 * 86400e3)) : null);
  const fail = (e) => App.toast(e.message, 5000);
  const phoneLink = (p) => (p ? `<a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a>` : '<span class="muted">—</span>');
  const mailLink = (m) => (m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : '<span class="muted">pas d\'e-mail</span>');
  const painClass = (p) => (p >= 7 ? 'pain-high' : p >= 4 ? 'pain-mid' : 'pain-low');
  const statusBadge = (s) => `<span class="badge ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

  function register(name, fn) { tabs[name] = fn; }

  async function show(tab = current) {
    current = tab;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === tab));
    if (!panel.dataset.tab || panel.dataset.tab !== tab) panel.innerHTML = '<div class="empty">Chargement…</div>';
    panel.dataset.tab = tab;
    try { await tabs[tab](panel); } catch (e) { panel.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // Rafraîchit l'onglet courant et les compteurs (après une modification)
  function refresh() {
    loadStats().catch(fail);
    return show(current);
  }

  async function loadStats() {
    const s = await App.api('/admin/stats');
    document.getElementById('stats').innerHTML = `
      <div class="stat"><b>${s.todayAppointments}</b><span>RDV aujourd'hui</span></div>
      <div class="stat"><b>${s.weekAppointments}</b><span>RDV sur 7 jours</span></div>
      <div class="stat"><b>${s.patients}</b><span>Patients</span></div>
      <div class="stat"><b>${euros(s.monthRevenueCents)}</b><span>Ventes du mois</span><small>${euros(s.revenueCents)} au total · ${s.paidOrders} vente(s)</small></div>`;
    document.getElementById('next-appt').innerHTML = s.next
      ? `Prochain RDV : <strong>${esc(s.next.first_name)} ${esc(s.next.last_name)}</strong> — ${App.fmtDate(s.next.start_at, { weekday: 'long', day: 'numeric', month: 'long' })} à ${hhmm(s.next.start_at)} (${esc(s.next.type_label.toLowerCase())})`
      : 'Aucun rendez-vous à venir.';
  }

  // Fermeture des boîtes de dialogue (bouton data-close, clic sur le fond)
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) e.target.closest('dialog')?.close();
    if (e.target.tagName === 'DIALOG') e.target.close();
  });

  return { panel, register, show, refresh, loadStats, DAYS, STATUS, TYPE_SHORT, pad, ymd, hhmm, age, fail, phoneLink, mailLink, painClass, statusBadge };
})();
