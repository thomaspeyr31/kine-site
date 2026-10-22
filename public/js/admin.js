// Espace administrateur du kiné
(async () => {
  const { esc, euros, api } = App;
  await App.ready;
  if (!App.requireLogin()) return;
  if (App.state.user.role !== 'admin') { location.replace('/compte.html'); return; }

  const panel = document.getElementById('panel');
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const APPT_STATUS = Object.fromEntries(Object.entries(App.APPT_STATUS).map(([k, [label]]) => [k, label]));
  const ORDER_STATUS = { paid: ['Payé', 'badge-ok'], pending: ['En attente', 'badge-warn'], cancelled: ['Abandonné', 'badge-muted'], refunded: ['Remboursé', 'badge-danger'] };
  const fail = (e) => App.toast(e.message, 5000);

  // ---------- Statistiques ----------
  async function loadStats() {
    const s = await api('/admin/stats');
    document.getElementById('stats').innerHTML = `
      <div class="stat"><b>${s.todayAppointments}</b><span>RDV aujourd'hui</span></div>
      <div class="stat"><b>${s.upcomingAppointments}</b><span>RDV à venir</span></div>
      <div class="stat"><b>${euros(s.revenueCents)}</b><span>Ventes de programmes (${s.paidOrders})</span></div>
      <div class="stat"><b>${s.clients}</b><span>Comptes patients</span></div>`;
  }

  // ---------- Onglet Rendez-vous ----------
  let apptScope = 'upcoming';
  async function tabRdv() {
    const { appointments } = await api(`/admin/appointments?scope=${apptScope}`);
    let lastDay = '';
    const rows = appointments.map((a) => {
      const day = a.start_at.slice(0, 10);
      const sep = day !== lastDay ? `<tr class="day-sep"><td colspan="5">${App.fmtDate(a.start_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>` : '';
      lastDay = day;
      return `${sep}<tr>
        <td><strong>${a.start_at.slice(11, 16).replace(':', 'h')}</strong><div class="sub">${esc(a.type_label)}</div>${a.source === 'cabinet' ? '<span class="badge badge-muted">Saisi au cabinet</span>' : ''}</td>
        <td><strong>${esc(a.first_name)} ${esc(a.last_name)}</strong>
          <div class="sub">${a.birth_date ? `Né(e) le ${App.fmtDate(a.birth_date, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}${a.has_prescription ? ' · <span class="badge badge-accent">Ordonnance</span>' : ''}</div></td>
        <td><a href="tel:${esc(a.phone.replace(/\s/g, ''))}">${esc(a.phone)}</a><div class="sub">${a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : 'pas d\'e-mail'}</div></td>
        <td class="small">${esc(a.message || '—')}</td>
        <td class="stack"><select data-appt="${a.id}" data-prev="${a.status}" aria-label="Statut">${Object.entries(APPT_STATUS).map(([k, v]) => `<option value="${k}" ${k === a.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${a.status === 'confirme' ? `<button class="btn btn-ghost btn-sm" data-move="${a.id}" data-when="${a.start_at}">Déplacer</button>` : ''}</td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <div class="spread"><div class="filters">
        <button class="chip" data-scope="upcoming" aria-pressed="${apptScope === 'upcoming'}">À venir</button>
        <button class="chip" data-scope="past" aria-pressed="${apptScope === 'past'}">Passés</button>
      </div><button class="btn" id="new-appt">+ Ajouter un rendez-vous</button></div>
      ${appointments.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Heure</th><th>Patient</th><th>Contact</th><th>Motif</th><th>Statut</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<div class="empty">Aucun rendez-vous.</div>'}`;
  }

  // ---------- Onglet Programmes ----------
  async function tabPrograms() {
    const { programs } = await api('/admin/programs');
    panel.innerHTML = `
      <div class="spread"><p class="muted">${programs.length} programme(s)</p><button class="btn" id="new-program">+ Nouveau programme</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Programme</th><th>Zone</th><th>Prix</th><th>Ventes</th><th>Statut</th><th></th></tr></thead>
        <tbody>${programs.map((p) => `<tr>
          <td><strong>${esc(p.title)}</strong><div class="sub">${p.duration_weeks} semaines · ${App.LEVELS[p.level]}</div></td>
          <td>${esc(p.body_area)}</td>
          <td>${euros(p.price_cents)}</td>
          <td>${p.sales}</td>
          <td>${p.is_published ? '<span class="badge badge-ok">Publié</span>' : '<span class="badge badge-muted">Masqué</span>'}</td>
          <td class="row"><button class="btn btn-ghost btn-sm" data-edit="${p.id}">Modifier</button><button class="btn btn-danger btn-sm" data-del="${p.id}">Supprimer</button></td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  // Formulaire programme (boîte de dialogue)
  const dlg = document.getElementById('program-dialog');
  const pform = document.getElementById('program-form');
  const exList = document.getElementById('ex-list');
  let editingId = null;

  function exRow(e = {}) {
    const div = document.createElement('div');
    div.className = 'ex-row';
    div.innerHTML = `
      <input type="hidden" value="${e.id || ''}" data-f="id">
      <input type="number" min="1" max="52" value="${e.week_number || 1}" aria-label="Semaine" data-f="week">
      <input type="text" value="${esc(e.name || '')}" placeholder="Nom de l'exercice" aria-label="Nom" data-f="name">
      <input type="number" min="0" value="${e.sets ?? ''}" placeholder="Séries" aria-label="Séries" data-f="sets">
      <input type="text" value="${esc(e.reps || '')}" placeholder="Rép. / durée" aria-label="Répétitions" data-f="reps">
      <input type="number" min="0" value="${e.rest_seconds ?? ''}" placeholder="Repos" aria-label="Repos en secondes" data-f="rest">
      <button type="button" class="rm" aria-label="Supprimer l'exercice">×</button>
      <textarea placeholder="Consignes" aria-label="Consignes" data-f="instructions">${esc(e.instructions || '')}</textarea>
      <input type="url" value="${esc(e.video_url || '')}" placeholder="Lien vidéo (https://…)" aria-label="Lien vidéo" data-f="videoUrl">`;
    div.querySelector('.rm').addEventListener('click', () => div.remove());
    exList.append(div);
  }

  async function openProgram(id) {
    editingId = id;
    pform.reset();
    exList.innerHTML = '';
    document.getElementById('dlg-alert').classList.add('hidden');
    document.getElementById('dlg-title').textContent = id ? 'Modifier le programme' : 'Nouveau programme';
    if (id) {
      const { program: p, exercises } = await api(`/admin/programs/${id}`);
      const f = pform.elements; // (pform.title serait l'attribut "title" du formulaire)
      f.title.value = p.title;
      f.bodyArea.value = p.body_area;
      f.level.value = p.level;
      f.price.value = (p.price_cents / 100).toFixed(2);
      f.durationWeeks.value = p.duration_weeks;
      f.sessionsPerWeek.value = p.sessions_per_week;
      f.shortDescription.value = p.short_description;
      f.description.value = p.description;
      f.isPublished.checked = !!p.is_published;
      exercises.forEach(exRow);
    } else {
      exRow();
    }
    dlg.showModal();
  }

  document.getElementById('add-ex').addEventListener('click', () => {
    const last = exList.lastElementChild?.querySelector('[data-f="week"]').value;
    exRow({ week_number: last || 1 }); // nouvel exercice : pas d'id
  });
  document.getElementById('dlg-cancel').addEventListener('click', () => dlg.close());

  pform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = App.formData(pform);
    const body = {
      title: data.title, bodyArea: data.bodyArea, level: data.level, price: data.price,
      durationWeeks: data.durationWeeks, sessionsPerWeek: data.sessionsPerWeek,
      shortDescription: data.shortDescription, description: data.description, isPublished: data.isPublished,
      exercises: [...exList.children].map((row) => Object.fromEntries(
        [...row.querySelectorAll('[data-f]')].map((el) => [el.dataset.f, el.value.trim()])
      )).filter((x) => x.name),
    };
    await App.busy(pform.querySelector('[type="submit"]'), async () => {
      try {
        await api(editingId ? `/admin/programs/${editingId}` : '/admin/programs', { method: editingId ? 'PUT' : 'POST', body });
        dlg.close();
        App.toast('Programme enregistré.');
        tabPrograms();
      } catch (err) {
        App.showAlert(document.getElementById('dlg-alert'), err.message);
      }
    });
  });

  // ---------- Onglet Ventes ----------
  async function tabOrders() {
    const { orders } = await api('/admin/orders');
    panel.innerHTML = `
      <div class="spread"><p class="muted small">Les remboursements se font depuis le tableau de bord Stripe ; le statut se met à jour automatiquement.</p>
        <a class="btn btn-ghost btn-sm" href="/api/admin/orders.csv" download>Export comptable (CSV)</a></div>
      ${orders.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Client</th><th>Programme</th><th>Montant</th><th>Statut</th><th>Facture</th></tr></thead>
      <tbody>${orders.map((o) => {
        const [label, cls] = ORDER_STATUS[o.status];
        return `<tr>
          <td>${App.fmtDate(o.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
          <td>${esc(o.billing_name)}<div class="sub">${esc(o.billing_email)}${o.account_deleted ? ' · compte supprimé' : ''}</div></td>
          <td>${esc(o.title)}</td>
          <td>${euros(o.amount_cents)}</td>
          <td><span class="badge ${cls}">${label}</span></td>
          <td>${o.invoice_number ? `<a href="/api/admin/orders/${o.id}/invoice.pdf" target="_blank" rel="noopener">${esc(o.invoice_number)}</a>` : '—'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Aucune vente pour le moment.</div>'}`;
  }

  // ---------- Onglet Horaires & congés ----------
  async function tabSchedule() {
    const { hours, closures } = await api('/admin/schedule');
    const rangeHtml = (h = { start: '09:00', end: '12:00' }) => `
      <span class="hours-range"><input type="time" value="${h.start}" data-k="start" aria-label="Début"> – <input type="time" value="${h.end}" data-k="end" aria-label="Fin">
      <button type="button" class="btn btn-danger btn-sm" data-rm-range aria-label="Retirer">×</button></span>`;
    panel.innerHTML = `
      <div class="schedule-grid">
        <div class="card">
          <h3>Horaires d'ouverture</h3>
          <p class="small muted">Les créneaux de rendez-vous sont calculés à partir de ces plages.</p>
          <div id="hours-editor">${DAYS.map((d, i) => `
            <div class="hours-day" data-wd="${i + 1}"><strong>${d}</strong>
              <div class="hours-ranges">${hours.filter((h) => h.weekday === i + 1).map(rangeHtml).join('')}
                <button type="button" class="btn btn-ghost btn-sm" data-add-range>+ plage</button></div>
            </div>`).join('')}</div>
          <p><button class="btn" id="save-hours">Enregistrer les horaires</button></p>
        </div>
        <div class="card stack">
          <h3>Congés / fermetures</h3>
          <form id="closure-form" class="form">
            <div class="form-grid">
              <div class="field"><label for="c-start">Du</label><input id="c-start" name="start" type="date" required></div>
              <div class="field"><label for="c-end">Au</label><input id="c-end" name="end" type="date" required></div>
            </div>
            <div class="form-grid">
              <div class="field"><label for="c-t1">De (facultatif)</label><input id="c-t1" name="startTime" type="time"></div>
              <div class="field"><label for="c-t2">À (facultatif)</label><input id="c-t2" name="endTime" type="time"></div>
            </div>
            <p class="small muted">Sans heures : journée(s) entière(s) fermée(s). Avec heures : seule cette plage est bloquée (réunion, rendez-vous perso…).</p>
            <div class="field"><label for="c-reason">Motif</label><input id="c-reason" name="reason" type="text" placeholder="Congés, formation…"></div>
            <button class="btn btn-ghost" type="submit">Ajouter la fermeture</button>
          </form>
          ${closures.length ? `<ul class="facts">${closures.map((c) => `
            <li><span>${c.start_date === c.end_date ? App.fmtDate(c.start_date, { day: 'numeric', month: 'short', year: 'numeric' }) : `${App.fmtDate(c.start_date, { day: 'numeric', month: 'short' })} → ${App.fmtDate(c.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`}${c.start_time ? ` · ${c.start_time.replace(':', 'h')}–${c.end_time.replace(':', 'h')}` : ' · journée entière'} ${c.reason ? `· ${esc(c.reason)}` : ''}</span>
            <button class="btn btn-danger btn-sm" data-del-closure="${c.id}">Supprimer</button></li>`).join('')}</ul>` : '<p class="muted">Aucune fermeture prévue.</p>'}
        </div>
      </div>`;

    panel.querySelector('#hours-editor').addEventListener('click', (e) => {
      if (e.target.matches('[data-add-range]')) e.target.insertAdjacentHTML('beforebegin', rangeHtml());
      if (e.target.matches('[data-rm-range]')) e.target.closest('.hours-range').remove();
    });
    panel.querySelector('#save-hours').addEventListener('click', async (e) => {
      const list = [...panel.querySelectorAll('.hours-day')].flatMap((day) => [...day.querySelectorAll('.hours-range')].map((r) => ({
        weekday: Number(day.dataset.wd), start: r.querySelector('[data-k="start"]').value, end: r.querySelector('[data-k="end"]').value,
      })));
      await App.busy(e.currentTarget, () => api('/admin/schedule/hours', { method: 'PUT', body: { hours: list } })
        .then(() => App.toast('Horaires enregistrés.')).catch(fail));
    });
    panel.querySelector('#closure-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/admin/schedule/closures', { method: 'POST', body: App.formData(e.target) });
        App.toast('Fermeture ajoutée.');
        tabSchedule();
      } catch (err) { fail(err); }
    });
  }

  // ---------- Boîte de dialogue RDV (ajout / déplacement) ----------
  const adlg = document.getElementById('appt-dialog');
  const aform = document.getElementById('appt-form');
  let movingId = null;

  function openAppt(id = null, when = '') {
    movingId = id;
    aform.reset();
    document.getElementById('appt-alert').classList.add('hidden');
    document.getElementById('appt-title').textContent = id ? 'Déplacer le rendez-vous' : 'Ajouter un rendez-vous';
    aform.querySelectorAll('.js-create-only').forEach((el) => el.classList.toggle('hidden', !!id));
    aform.querySelectorAll('.js-create-only [required]').forEach((el) => { el.disabled = !!id; });
    aform.elements.duration.value = App.state.site.slotMinutes;
    if (when) {
      aform.elements.date.value = when.slice(0, 10);
      aform.elements.time.value = when.slice(11, 16);
    }
    adlg.showModal();
  }

  document.getElementById('appt-cancel').addEventListener('click', () => adlg.close());
  aform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = App.formData(aform);
    await App.busy(aform.querySelector('[type="submit"]'), async () => {
      try {
        if (movingId) {
          await api(`/admin/appointments/${movingId}/move`, { method: 'PUT', body: { date: data.date, time: data.time, notify: data.notify } });
          App.toast('Rendez-vous déplacé.');
        } else {
          await api('/admin/appointments', { method: 'POST', body: data });
          App.toast('Rendez-vous ajouté.');
        }
        adlg.close();
        loadStats();
        show('rdv');
      } catch (err) {
        App.showAlert(document.getElementById('appt-alert'), err.message);
      }
    });
  });

  // ---------- Navigation entre onglets + actions ----------
  const TABS = { rdv: tabRdv, programs: tabPrograms, orders: tabOrders, schedule: tabSchedule };
  let currentTab = 'rdv';
  async function show(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === tab));
    panel.innerHTML = '<div class="empty">Chargement…</div>';
    try { await TABS[tab](); } catch (e) { panel.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) show(t.dataset.tab);
  });

  panel.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.matches('[data-scope]')) { apptScope = t.dataset.scope; show('rdv'); }
    if (t.id === 'new-program') openProgram(null).catch(fail);
    if (t.id === 'new-appt') openAppt();
    if (t.matches('[data-move]')) openAppt(Number(t.dataset.move), t.dataset.when);
    if (t.matches('[data-edit]')) openProgram(Number(t.dataset.edit)).catch(fail);
    if (t.matches('[data-del]') && confirm('Supprimer ce programme ? (s\'il a déjà été vendu, il sera seulement masqué)')) {
      try {
        const r = await api(`/admin/programs/${t.dataset.del}`, { method: 'DELETE', body: {} });
        App.toast(r.unpublished ? 'Programme déjà vendu : masqué du catalogue.' : 'Programme supprimé.');
        tabPrograms();
      } catch (err) { fail(err); }
    }
    if (t.matches('[data-del-closure]')) {
      try { await api(`/admin/schedule/closures/${t.dataset.delClosure}`, { method: 'DELETE', body: {} }); tabSchedule(); } catch (err) { fail(err); }
    }
  });

  panel.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-appt]')) return;
    const sel = e.target;
    if (sel.value === 'annule' && sel.dataset.prev === 'confirme' && !confirm('Annuler ce rendez-vous ? Le patient sera prévenu par e-mail s\'il en a donné un.')) {
      sel.value = sel.dataset.prev;
      return;
    }
    try {
      await api(`/admin/appointments/${sel.dataset.appt}`, { method: 'PATCH', body: { status: sel.value } });
      App.toast('Statut mis à jour.');
      loadStats();
    } catch (err) { fail(err); show(currentTab); }
  });

  loadStats().catch(fail);
  show('rdv');
})();
