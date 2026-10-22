// Administration — agenda : vue semaine cliquable, vue liste, détail d'un RDV, création / déplacement.
(() => {
  const { esc, api } = App;
  const { pad, ymd, hhmm, age, fail, STATUS, TYPE_SHORT, phoneLink, mailLink, statusBadge } = Admin;

  const PX = 1.15; // pixels par minute
  const SHORT_DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minOf = (dt) => toMin(String(dt).slice(11, 16));
  const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  let weekStart = mondayOf(new Date());
  let view = window.matchMedia('(max-width: 700px)').matches ? 'list' : 'week';
  let showCancelled = false;
  let listScope = 'upcoming';

  // ---------- Onglet ----------
  async function render(panel) {
    const from = ymd(weekStart);
    const to = ymd(addDays(weekStart, 6));
    const title = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} – ${addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    const toolbar = `
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Affichage">
          <button data-view="week" aria-pressed="${view === 'week'}">Semaine</button>
          <button data-view="list" aria-pressed="${view === 'list'}">Liste</button>
        </div>
        ${view === 'week' ? `
          <button class="icon-btn" data-nav="-1" aria-label="Semaine précédente">‹</button>
          <button class="btn btn-ghost btn-sm" data-nav="0">Aujourd'hui</button>
          <button class="icon-btn" data-nav="1" aria-label="Semaine suivante">›</button>
          <h2>${title}</h2>` : `
          <div class="filters inline">
            <button class="chip" data-scope="upcoming" aria-pressed="${listScope === 'upcoming'}">À venir</button>
            <button class="chip" data-scope="past" aria-pressed="${listScope === 'past'}">Passés</button>
          </div>`}
        <span class="grow"></span>
        <label class="check small"><input type="checkbox" id="show-cancelled" ${showCancelled ? 'checked' : ''}> <span>Afficher les annulés</span></label>
        <button class="btn" data-new-appt>+ Nouveau RDV</button>
      </div>`;

    if (view === 'list') {
      const { appointments } = await api(`/admin/appointments?scope=${listScope}`);
      panel.innerHTML = toolbar + listHtml(appointments.filter((a) => showCancelled || a.status !== 'annule'));
      return;
    }

    const data = await api(`/admin/agenda?from=${from}&to=${to}`);
    panel.innerHTML = `${toolbar}${weekHtml(data)}
      <div class="ag-legend">
        <span><i class="lg-bilan"></i>Bilan</span>
        <span><i class="lg-seance"></i>Séance</span>
        <span><i class="lg-suivi"></i>Suivi programme</span>
        <span><i class="lg-absent"></i>Absent</span>
        <span>📄 ordonnance · ☎ saisi au cabinet · ✦ nouveau patient</span>
        <span>Cliquez sur un créneau vide pour ajouter un rendez-vous.</span>
      </div>`;
    // Styles calculés en JS (la politique de sécurité interdit les attributs style dans le HTML généré)
    panel.querySelectorAll('[data-top]').forEach((el) => {
      el.style.top = `${el.dataset.top}px`;
      if (el.dataset.h) el.style.height = `${el.dataset.h}px`;
    });
    panel.querySelectorAll('[data-col-h]').forEach((el) => { el.style.height = `${el.dataset.colH}px`; });
    const grid = panel.querySelector('.agenda');
    grid.style.setProperty('--cols', grid.dataset.cols);
    // Fait défiler jusqu'à l'heure actuelle / au premier RDV
    panel.querySelector('.ag-now, .ag-appt')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    window.scrollTo({ top: 0 });
  }

  function weekHtml({ appointments, hours, closures }) {
    const list = appointments.filter((a) => showCancelled || a.status !== 'annule');
    const days = [...Array(7)].map((_, i) => ymd(addDays(weekStart, i)));
    // Dimanche (et samedi) affichés seulement s'ils sont ouverts ou ont des RDV
    const shown = days.filter((d, i) => i < 5 || hours.some((h) => h.weekday === i + 1) || list.some((a) => a.start_at.startsWith(d)));

    // Plage horaire affichée : horaires d'ouverture + RDV hors horaires
    let startMin = Math.min(8 * 60, ...hours.map((h) => toMin(h.start)), ...list.map((a) => minOf(a.start_at)));
    let endMin = Math.max(19 * 60, ...hours.map((h) => toMin(h.end)), ...list.map((a) => minOf(a.end_at)));
    startMin = Math.floor(startMin / 60) * 60;
    endMin = Math.ceil(endMin / 60) * 60;
    const height = (endMin - startMin) * PX;
    const y = (m) => Math.round((m - startMin) * PX);
    const today = ymd(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    const lines = [];
    for (let m = startMin; m <= endMin; m += 30) lines.push(`<div class="ag-line ${m % 60 ? 'half' : ''}" data-top="${y(m)}"></div>`);
    const times = [];
    for (let m = startMin + 60; m < endMin; m += 60) times.push(`<span data-top="${y(m)}">${pad(m / 60)}h</span>`);

    const head = shown.map((d) => {
      const date = new Date(`${d}T00:00`);
      const n = list.filter((a) => a.start_at.startsWith(d) && a.status !== 'annule').length;
      return `<div class="ag-head ${d === today ? 'today' : ''}">${SHORT_DAYS[(date.getDay() + 6) % 7]}<strong>${date.getDate()}</strong><span class="count">${n ? `${n} RDV` : '&nbsp;'}</span></div>`;
    }).join('');

    const cols = shown.map((d) => {
      const wd = ((new Date(`${d}T00:00`).getDay() + 6) % 7) + 1;
      const open = hours.filter((h) => h.weekday === wd)
        .map((h) => `<div class="ag-open" data-top="${y(toMin(h.start))}" data-h="${(toMin(h.end) - toMin(h.start)) * PX}"></div>`).join('');
      const closed = closures.filter((c) => d >= c.start_date && d <= c.end_date).map((c) => {
        const s = c.start_time ? toMin(c.start_time) : startMin;
        const e = c.end_time ? toMin(c.end_time) : endMin;
        return `<div class="ag-closure" data-top="${y(s)}" data-h="${(e - s) * PX}">${esc(c.reason || 'Fermé')}</div>`;
      }).join('');
      const appts = list.filter((a) => a.start_at.startsWith(d)).map((a) => {
        const s = minOf(a.start_at);
        const h = Math.max((minOf(a.end_at) - s) * PX - 2, 22);
        const icons = `${a.has_prescription ? ' 📄' : ''}${a.source === 'cabinet' ? ' ☎' : ''}${!a.previous_visits && a.status !== 'annule' ? ' ✦' : ''}`;
        return `<button class="ag-appt type-${a.type} st-${a.status}" data-top="${y(s)}" data-h="${h}" data-appt="${a.id}"
          title="${esc(`${hhmm(a.start_at)} ${a.first_name} ${a.last_name} — ${a.type_label} (${STATUS[a.status][0]})`)}">
          <span class="t">${hhmm(a.start_at)} · ${TYPE_SHORT[a.type]}${icons}</span>
          <b>${esc(a.first_name)} ${esc(a.last_name)}</b>
          ${h > 48 && a.message ? `<span class="t">${esc(a.message.slice(0, 60))}</span>` : ''}
        </button>`;
      }).join('');
      const now = d === today && nowMin > startMin && nowMin < endMin ? `<div class="ag-now" data-top="${y(nowMin)}"></div>` : '';
      return `<div class="ag-day" data-day="${d}" data-col-h="${height}">${open}${lines.join('')}${closed}${appts}${now}</div>`;
    }).join('');

    return `<div class="agenda-scroll"><div class="agenda" data-cols="${shown.length}" data-start="${startMin}">
      <div class="ag-head"></div>${head}
      <div class="ag-times" data-col-h="${height}">${times.join('')}</div>${cols}
    </div></div>`;
  }

  function listHtml(appointments) {
    if (!appointments.length) return '<div class="empty">Aucun rendez-vous.</div>';
    let lastDay = '';
    const rows = appointments.map((a) => {
      const day = a.start_at.slice(0, 10);
      const sep = day !== lastDay ? `<tr class="day-sep"><td colspan="5">${App.fmtDate(a.start_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>` : '';
      lastDay = day;
      const a2 = age(a.birth_date);
      return `${sep}<tr class="clickable-row" data-appt="${a.id}">
        <td><strong>${hhmm(a.start_at)}</strong><div class="sub">${esc(a.type_label)}</div></td>
        <td><strong>${esc(a.first_name)} ${esc(a.last_name)}</strong>
          <div class="sub">${a2 !== null ? `${a2} ans` : ''}${a.has_prescription ? ' · ordonnance' : ''}${a.source === 'cabinet' ? ' · saisi au cabinet' : ''}</div></td>
        <td>${esc(a.phone)}<div class="sub">${esc(a.email || 'pas d\'e-mail')}</div></td>
        <td class="small">${esc(a.message || '—')}${a.staff_notes ? `<div class="sub">📝 ${esc(a.staff_notes.slice(0, 80))}</div>` : ''}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table>
      <thead><tr><th>Heure</th><th>Patient</th><th>Contact</th><th>Motif / notes</th><th>Statut</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ---------- Actions de l'onglet ----------
  Admin.panel.addEventListener('click', (e) => {
    if (Admin.panel.dataset.tab !== 'agenda') return;
    const t = e.target.closest('button, tr, .ag-day');
    if (!t) return;
    if (t.dataset.view) { view = t.dataset.view; Admin.show('agenda'); return; }
    if (t.dataset.nav !== undefined) {
      const n = Number(t.dataset.nav);
      weekStart = n === 0 ? mondayOf(new Date()) : addDays(weekStart, 7 * n);
      Admin.show('agenda');
      return;
    }
    if (t.dataset.scope) { listScope = t.dataset.scope; Admin.show('agenda'); return; }
    if (t.matches('[data-new-appt]')) { openNewAppt(); return; }
    if (t.dataset.appt) { openDetail(Number(t.dataset.appt)); return; }
    // Clic sur un créneau vide de la grille → nouveau RDV à cette heure (arrondi au quart d'heure)
    if (t.matches('.ag-day')) {
      const start = Number(t.closest('.agenda').dataset.start);
      const min = Math.floor((start + (e.clientY - t.getBoundingClientRect().top) / PX) / 15) * 15;
      openNewAppt({ date: t.dataset.day, time: `${pad(Math.floor(min / 60))}:${pad(min % 60)}` });
    }
  });
  Admin.panel.addEventListener('change', (e) => {
    if (e.target.id === 'show-cancelled') { showCancelled = e.target.checked; Admin.show('agenda'); }
  });

  // ---------- Détail d'un rendez-vous ----------
  const ddlg = document.getElementById('detail-dialog');
  const dbody = document.getElementById('detail-body');

  async function openDetail(id) {
    let a;
    try { ({ appointment: a } = await api(`/admin/appointments/${id}`)); } catch (e) { fail(e); return; }
    const a2 = age(a.birth_date);
    const future = App.toDate(a.start_at) > new Date();
    dbody.innerHTML = `
      <div class="dlg-head">
        <div>
          <h2 id="detail-title">${esc(a.first_name)} ${esc(a.last_name)}</h2>
          <div class="muted">${App.fmtDate(a.start_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${hhmm(a.start_at)} – ${hhmm(a.end_at)} · ${esc(a.type_label)}</div>
        </div>
        <button class="dlg-close" data-close aria-label="Fermer">×</button>
      </div>
      <div class="dlg-body stack">
        <div class="status-seg" role="group" aria-label="Statut">
          ${Object.entries(STATUS).map(([k, [label]]) => `<button class="s-${k}" data-status="${k}" aria-pressed="${a.status === k}">${label}</button>`).join('')}
        </div>
        <dl class="kv">
          <dt>Téléphone</dt><dd>${phoneLink(a.phone)}</dd>
          <dt>E-mail</dt><dd>${mailLink(a.email)}</dd>
          <dt>Âge</dt><dd>${a2 !== null ? `${a2} ans (né(e) le ${App.fmtDate(a.birth_date, { day: 'numeric', month: 'long', year: 'numeric' })})` : '<span class="muted">non renseigné</span>'}</dd>
          <dt>Ordonnance</dt><dd>${a.has_prescription ? 'Oui' : 'Non'}</dd>
          <dt>Pris</dt><dd>${a.source === 'cabinet' ? 'Au cabinet' : 'En ligne'} le ${App.fmtDate(a.created_at, { day: 'numeric', month: 'short' })} à ${hhmm(a.created_at)}${a.reminder_sent_at ? ' · rappel envoyé' : ''}</dd>
        </dl>
        ${a.message ? `<div><div class="section-title">Motif indiqué par le patient</div><p class="quote">${esc(a.message)}</p></div>` : ''}
        <form id="notes-form" class="form">
          <div class="field">
            <label for="staff-notes">Notes de séance <span class="muted">(privées)</span></label>
            <textarea id="staff-notes" name="staffNotes" placeholder="Bilan, exercices réalisés, douleur, consignes…">${esc(a.staff_notes || '')}</textarea>
          </div>
          <button class="btn btn-ghost btn-sm" type="submit">Enregistrer les notes</button>
        </form>
      </div>
      <div class="dlg-foot">
        ${a.patient_id ? `<button class="btn btn-ghost" data-open-patient="${a.patient_id}">Fiche patient</button>` : ''}
        ${a.status === 'confirme' ? '<button class="btn btn-ghost" data-move>Déplacer</button>' : ''}
        <button class="btn" data-close>Fermer</button>
      </div>`;

    dbody.querySelector('.status-seg').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-status]');
      if (!b || b.dataset.status === a.status) return;
      const status = b.dataset.status;
      if (status === 'annule' && future && !confirm(`Annuler ce rendez-vous ?${a.email ? ' Le patient sera prévenu par e-mail.' : ''}`)) return;
      try {
        await api(`/admin/appointments/${a.id}`, { method: 'PATCH', body: { status } });
        App.toast(`Statut : ${STATUS[status][0]}.`);
        Admin.refresh();
        if (document.getElementById('patient-dialog').open) Admin.reloadPatient();
        openDetail(a.id);
      } catch (err) { fail(err); }
    });
    dbody.querySelector('#notes-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/admin/appointments/${a.id}`, { method: 'PATCH', body: App.formData(e.target) });
        App.toast('Notes enregistrées.');
        a.staff_notes = e.target.elements.staffNotes.value;
        if (Admin.panel.dataset.tab === 'agenda') Admin.show('agenda');
        if (document.getElementById('patient-dialog').open) Admin.reloadPatient();
      } catch (err) { fail(err); }
    });
    dbody.querySelector('[data-move]')?.addEventListener('click', () => { ddlg.close(); openMove(a); });
    dbody.querySelector('[data-open-patient]')?.addEventListener('click', (e) => { ddlg.close(); Admin.openPatient(Number(e.currentTarget.dataset.openPatient)); });
    if (!ddlg.open) ddlg.showModal();
  }

  // ---------- Nouveau RDV / déplacement ----------
  const adlg = document.getElementById('appt-dialog');
  const aform = document.getElementById('appt-form');
  const search = document.getElementById('a-search');
  const results = document.getElementById('a-results');
  const chosen = document.getElementById('appt-chosen');
  let mode = 'new';
  let movingId = null;
  let patientId = null;

  function setPatient(p) {
    patientId = p ? p.id : null;
    chosen.classList.toggle('hidden', !p);
    document.getElementById('appt-search-box').classList.toggle('hidden', !!p);
    aform.querySelectorAll('.js-person input').forEach((el) => { el.disabled = !!p; });
    aform.querySelector('.js-person').classList.toggle('hidden', !!p);
    if (p) {
      chosen.innerHTML = `<span>Pour <strong>${esc(p.first_name)} ${esc(p.last_name)}</strong> · ${esc(p.phone || 'pas de téléphone')}${p.email ? ` · ${esc(p.email)}` : ''}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-unpick>Changer</button>`;
    }
    results.classList.add('hidden');
  }

  function openNewAppt({ date, time, patient } = {}) {
    mode = 'new';
    movingId = null;
    aform.reset();
    search.value = '';
    document.getElementById('appt-alert').classList.add('hidden');
    document.getElementById('appt-title').textContent = 'Nouveau rendez-vous';
    aform.querySelectorAll('.js-create-only').forEach((el) => el.classList.remove('hidden'));
    aform.elements.duration.value = App.state.site.slotMinutes;
    const d = new Date();
    aform.elements.date.value = date || ymd(d);
    aform.elements.time.value = time || '09:00';
    setPatient(patient || null);
    adlg.showModal();
    (patient ? aform.elements.time : search).focus();
  }

  function openMove(a) {
    mode = 'move';
    movingId = a.id;
    aform.reset();
    document.getElementById('appt-alert').classList.add('hidden');
    document.getElementById('appt-title').textContent = `Déplacer le RDV de ${a.first_name} ${a.last_name}`;
    aform.querySelectorAll('.js-create-only').forEach((el) => el.classList.add('hidden'));
    aform.querySelectorAll('.js-person input').forEach((el) => { el.disabled = true; });
    aform.elements.date.value = a.start_at.slice(0, 10);
    aform.elements.time.value = a.start_at.slice(11, 16);
    adlg.showModal();
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    if (q.length < 2) { results.classList.add('hidden'); return; }
    searchTimer = setTimeout(async () => {
      try {
        const { patients } = await api(`/admin/patients?q=${encodeURIComponent(q)}`);
        results.innerHTML = patients.slice(0, 8).map((p) => `<button type="button" data-pick='${esc(JSON.stringify(p))}'>
          <strong>${esc(p.first_name)} ${esc(p.last_name)}</strong> <span class="muted small">${esc(p.phone || '')} ${esc(p.email || '')}</span></button>`).join('')
          || '<p class="small muted no-result">Aucun patient trouvé : remplissez les champs ci-dessous.</p>';
        results.classList.remove('hidden');
      } catch (err) { fail(err); }
    }, 250);
  });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) setPatient(JSON.parse(b.dataset.pick));
  });
  chosen.addEventListener('click', (e) => {
    if (e.target.matches('[data-unpick]')) { setPatient(null); search.focus(); }
  });

  aform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = App.formData(aform);
    await App.busy(aform.querySelector('[type="submit"]'), async () => {
      try {
        if (mode === 'move') {
          await api(`/admin/appointments/${movingId}/move`, { method: 'PUT', body: { date: data.date, time: data.time, notify: data.notify } });
          App.toast('Rendez-vous déplacé.');
        } else {
          await api('/admin/appointments', { method: 'POST', body: { ...data, patientId } });
          App.toast('Rendez-vous ajouté.');
        }
        adlg.close();
        // Affiche la semaine du RDV
        weekStart = mondayOf(new Date(`${data.date}T00:00`));
        Admin.refresh();
        if (document.getElementById('patient-dialog').open && Admin.reloadPatient) Admin.reloadPatient();
      } catch (err) {
        App.showAlert(document.getElementById('appt-alert'), err.message);
      }
    });
  });

  Admin.register('agenda', render);
  Object.assign(Admin, { openDetail, openNewAppt });
})();
