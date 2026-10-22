// Administration — patients : recherche, liste, fiche complète (identité, notes, historique, programmes, journal).
(() => {
  const { esc, api, euros } = App;
  const { hhmm, age, fail, phoneLink, mailLink, painClass, statusBadge } = Admin;
  const DIFF = { facile: 'Facile', adaptee: 'Adaptée', difficile: 'Difficile' };
  const short = (d) => App.fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------- Onglet ----------
  let query = '';
  let timer;

  async function render(panel) {
    if (!panel.querySelector('#patient-search')) {
      panel.innerHTML = `
        <div class="toolbar">
          <input id="patient-search" type="search" placeholder="Rechercher un patient (nom, téléphone, e-mail)…" value="${esc(query)}" aria-label="Rechercher un patient">
          <span class="grow"></span>
          <button class="btn" data-new-patient>+ Nouveau patient</button>
        </div>
        <div id="patient-list"></div>`;
    }
    await loadList();
  }

  async function loadList() {
    const box = document.getElementById('patient-list');
    if (!box) return;
    const { patients } = await api(`/admin/patients?q=${encodeURIComponent(query)}`);
    box.innerHTML = patients.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Patient</th><th>Contact</th><th>Prochain RDV</th><th>Dernière visite</th><th>Séances</th><th>Programmes</th></tr></thead>
      <tbody>${patients.map((p) => {
        const a = age(p.birth_date);
        return `<tr class="clickable-row" data-patient="${p.id}">
          <td><strong>${esc(p.last_name.toUpperCase())} ${esc(p.first_name)}</strong>
            <div class="sub">${a !== null ? `${a} ans` : ''}${p.user_id ? `${a !== null ? ' · ' : ''}compte en ligne` : ''}</div></td>
          <td>${esc(p.phone || '—')}<div class="sub">${esc(p.email || '')}</div></td>
          <td>${p.next_visit ? `${short(p.next_visit)} · ${hhmm(p.next_visit)}` : '<span class="muted">—</span>'}</td>
          <td>${p.last_visit ? short(p.last_visit) : '<span class="muted">—</span>'}</td>
          <td>${p.visits}</td>
          <td>${p.programs ? `<span class="badge">${p.programs}</span>` : '<span class="muted">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty">${query ? 'Aucun patient ne correspond à la recherche.' : 'Aucun patient pour le moment.'}</div>`;
  }

  Admin.panel.addEventListener('input', (e) => {
    if (e.target.id !== 'patient-search') return;
    clearTimeout(timer);
    timer = setTimeout(() => { query = e.target.value.trim(); loadList().catch(fail); }, 250);
  });
  Admin.panel.addEventListener('click', (e) => {
    if (Admin.panel.dataset.tab !== 'patients') return;
    const row = e.target.closest('[data-patient]');
    if (row) openPatient(Number(row.dataset.patient));
    if (e.target.closest('[data-new-patient]')) openPatient(null);
  });

  // ---------- Fiche patient ----------
  const dlg = document.getElementById('patient-dialog');
  const body = document.getElementById('patient-body');
  let currentId = null;

  // Mini-graphique de la douleur (0–10) au fil des séances
  function painChart(sessions) {
    const pts = [...sessions].reverse();
    if (pts.length < 2) return '';
    const W = 320; const H = 70; const P = 6;
    const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
    const y = (v) => H - P - (v / 10) * (H - 2 * P);
    const path = pts.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.pain).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Évolution de la douleur">
      <line x1="0" x2="${W}" y1="${y(7)}" y2="${y(7)}" stroke="#f0c4c0" stroke-dasharray="4 4"/>
      <line x1="0" x2="${W}" y1="${y(4)}" y2="${y(4)}" stroke="#f3e2b3" stroke-dasharray="4 4"/>
      <path d="${path}" fill="none" stroke="#0f5c55" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${pts.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.pain).toFixed(1)}" r="3" fill="#0f5c55"/>`).join('')}
    </svg>`;
  }

  async function openPatient(id) {
    currentId = id;
    let d = { patient: { first_name: '', last_name: '' }, appointments: [], programs: [], sessions: [], account: null };
    if (id) {
      try { d = await api(`/admin/patients/${id}`); } catch (e) { fail(e); return; }
    }
    const p = d.patient;
    const a = age(p.birth_date);
    const now = new Date();
    const upcoming = d.appointments.filter((x) => App.toDate(x.start_at) >= now && x.status === 'confirme').reverse();
    const past = d.appointments.filter((x) => !(App.toDate(x.start_at) >= now && x.status === 'confirme'));
    const done = d.appointments.filter((x) => x.status === 'termine').length;
    const absent = d.appointments.filter((x) => x.status === 'absent').length;

    const tl = (x, future) => `<li class="${future ? 'future' : ''}" data-appt="${x.id}">
      <div class="tl-title">${App.fmtDate(x.start_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${hhmm(x.start_at)} — ${esc(x.type_label)} ${statusBadge(x.status)}</div>
      ${x.message ? `<div class="tl-sub">Motif : ${esc(x.message)}</div>` : ''}
      ${x.staff_notes ? `<div class="tl-sub">📝 ${esc(x.staff_notes)}</div>` : ''}
    </li>`;

    body.innerHTML = `
      <div class="dlg-head">
        <div>
          <h2 id="patient-title">${id ? `${esc(p.first_name)} ${esc(p.last_name)}` : 'Nouveau patient'}</h2>
          ${id ? `<div class="muted">${a !== null ? `${a} ans · ` : ''}${done} séance(s) réalisée(s)${absent ? ` · ${absent} absence(s)` : ''} · ${d.account ? 'compte en ligne' : 'sans compte en ligne'}</div>` : ''}
        </div>
        <div class="row">
          ${id ? '<button class="btn btn-accent btn-sm" data-book>+ Rendez-vous</button>' : ''}
          <button class="dlg-close" data-close aria-label="Fermer">×</button>
        </div>
      </div>
      <div class="dlg-body">
        <div class="patient-grid">
          <form id="patient-form" class="form">
            <div class="form-grid">
              <div class="field"><label for="pt-first">Prénom *</label><input id="pt-first" type="text" name="firstName" value="${esc(p.first_name)}" required maxlength="80"></div>
              <div class="field"><label for="pt-last">Nom *</label><input id="pt-last" type="text" name="lastName" value="${esc(p.last_name)}" required maxlength="80"></div>
            </div>
            <div class="field"><label for="pt-phone">Téléphone</label><input id="pt-phone" name="phone" type="tel" value="${esc(p.phone || '')}" maxlength="30"></div>
            <div class="field"><label for="pt-email">E-mail</label><input id="pt-email" name="email" type="email" value="${esc(p.email || '')}" maxlength="190"></div>
            <div class="field"><label for="pt-birth">Date de naissance</label><input id="pt-birth" name="birthDate" type="date" value="${esc(p.birth_date || '')}"></div>
            <div class="field">
              <label for="pt-notes">Notes privées</label>
              <textarea id="pt-notes" name="notes" rows="8" placeholder="Antécédents, contre-indications, objectifs, chirurgien / médecin prescripteur…">${esc(p.notes || '')}</textarea>
              <span class="hint">Jamais visibles par le patient.</span>
            </div>
            ${id ? `<div class="row small">${phoneLink(p.phone)} ${p.email ? `· ${mailLink(p.email)}` : ''}</div>` : ''}
            <div id="patient-alert" class="hidden" role="alert"></div>
            <button class="btn" type="submit">${id ? 'Enregistrer la fiche' : 'Créer la fiche'}</button>
          </form>

          ${id ? `<div>
            <div class="section-title">Rendez-vous à venir</div>
            ${upcoming.length ? `<ul class="timeline">${upcoming.map((x) => tl(x, true)).join('')}</ul>` : '<p class="muted small">Aucun.</p>'}
            <div class="section-title">Historique</div>
            ${past.length ? `<ul class="timeline">${past.map((x) => tl(x, false)).join('')}</ul>` : '<p class="muted small">Aucun rendez-vous passé.</p>'}

            <div class="section-title">Programmes en ligne</div>
            ${d.programs.length ? d.programs.map((pr) => {
              const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
              return `<div class="card stack small">
                <div class="spread"><strong>${esc(pr.title)}</strong>${pr.status === 'refunded' ? '<span class="badge badge-danger">Remboursé</span>' : `<span>${pct} %</span>`}</div>
                <div class="progress"><div class="js-bar" data-pct="${pct}"></div></div>
                <div class="muted">Acheté le ${short(pr.paid_at)}${pr.last_session ? ` · dernière séance le ${short(pr.last_session)}` : ' · aucune séance notée'}${pr.invoice_number ? ` · <a href="/api/admin/orders/${pr.order_id}/invoice.pdf" target="_blank" rel="noopener">${esc(pr.invoice_number)}</a>` : ''}</div>
              </div>`;
            }).join('') : `<p class="muted small">${d.account ? 'Aucun programme acheté.' : 'Pas de compte en ligne.'}</p>`}

            ${d.sessions.length ? `
              <div class="section-title">Journal de séances (douleur 0–10)</div>
              ${painChart(d.sessions)}
              <div class="table-wrap"><table>
                <thead><tr><th>Date</th><th>Programme</th><th>Douleur</th><th>Ressenti</th><th>Commentaire</th></tr></thead>
                <tbody>${d.sessions.slice(0, 15).map((s) => `<tr>
                  <td>${short(s.created_at)}</td><td>${esc(s.title)} · S${s.week_number}</td>
                  <td><span class="pain ${painClass(s.pain)}">${s.pain}</span></td>
                  <td>${DIFF[s.difficulty]}</td><td class="small">${esc(s.comment || '—')}</td>
                </tr>`).join('')}</tbody></table></div>` : ''}
          </div>` : '<p class="muted">Créez la fiche, puis ajoutez des rendez-vous depuis celle-ci.</p>'}
        </div>
      </div>`;

    body.querySelectorAll('.js-bar').forEach((b) => { b.style.width = `${b.dataset.pct}%`; });
    body.querySelector('#patient-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await App.busy(e.target.querySelector('[type="submit"]'), async () => {
        try {
          if (id) {
            await api(`/admin/patients/${id}`, { method: 'PUT', body: App.formData(e.target) });
            App.toast('Fiche enregistrée.');
            openPatient(id);
          } else {
            const r = await api('/admin/patients', { method: 'POST', body: App.formData(e.target) });
            App.toast('Fiche créée.');
            openPatient(r.id);
          }
          if (Admin.panel.dataset.tab === 'patients') loadList().catch(fail);
          Admin.loadStats().catch(fail);
        } catch (err) { App.showAlert(document.getElementById('patient-alert'), err.message); }
      });
    });
    body.querySelector('[data-book]')?.addEventListener('click', () => Admin.openNewAppt({ patient: p }));
    body.querySelectorAll('.timeline [data-appt]').forEach((li) => li.addEventListener('click', () => Admin.openDetail(Number(li.dataset.appt))));
    if (!dlg.open) dlg.showModal();
  }

  Admin.register('patients', render);
  Object.assign(Admin, { openPatient, reloadPatient: () => currentId && openPatient(currentId) });
})();
