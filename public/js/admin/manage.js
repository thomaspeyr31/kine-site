// Administration — gestion : programmes et exercices, ventes / factures, horaires et fermetures.
(() => {
  const { esc, euros, api } = App;
  const { DAYS, fail } = Admin;
  const ORDER_STATUS = { paid: ['Payé', 'badge-ok'], pending: ['En attente', 'badge-warn'], cancelled: ['Abandonné', 'badge-muted'], refunded: ['Remboursé', 'badge-danger'] };

  // ---------- Programmes ----------
  async function tabPrograms(panel) {
    const { programs } = await api('/admin/programs');
    panel.innerHTML = `
      <div class="spread"><p class="muted">${programs.length} programme(s)</p><button class="btn" id="new-program">+ Nouveau programme</button></div>
      ${programs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Programme</th><th>Zone</th><th>Prix</th><th>Ventes</th><th>Statut</th><th></th></tr></thead>
        <tbody>${programs.map((p) => `<tr>
          <td><strong>${esc(p.title)}</strong><div class="sub">${p.duration_weeks} semaines · ${App.LEVELS[p.level]}</div></td>
          <td>${esc(p.body_area)}</td>
          <td>${euros(p.price_cents)}</td>
          <td>${p.sales}</td>
          <td>${p.is_published ? '<span class="badge badge-ok">Publié</span>' : '<span class="badge badge-muted">Masqué</span>'}</td>
          <td class="row">
            <a class="btn btn-ghost btn-sm" href="/programme.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Voir</a>
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Modifier</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Supprimer</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun programme. Créez le premier !</div>'}`;
  }

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
      <textarea placeholder="Consignes (position, mouvement, erreurs à éviter…)" aria-label="Consignes" data-f="instructions">${esc(e.instructions || '')}</textarea>
      <input type="url" value="${esc(e.video_url || '')}" placeholder="Vidéo YouTube ou Vimeo (https://…)" aria-label="Lien vidéo" data-f="videoUrl">`;
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
    exList.lastElementChild.querySelector('[data-f="name"]').focus();
  });

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
        Admin.show('programs');
      } catch (err) {
        App.showAlert(document.getElementById('dlg-alert'), err.message);
      }
    });
  });

  // ---------- Ventes ----------
  async function tabOrders(panel) {
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

  // ---------- Horaires & fermetures ----------
  async function tabSchedule(panel) {
    const { hours, closures } = await api('/admin/schedule');
    const rangeHtml = (h = { start: '09:00', end: '12:00' }) => `
      <span class="hours-range"><input type="time" value="${h.start}" data-k="start" aria-label="Début"> – <input type="time" value="${h.end}" data-k="end" aria-label="Fin">
      <button type="button" class="btn btn-danger btn-sm" data-rm-range aria-label="Retirer">×</button></span>`;
    panel.innerHTML = `
      <div class="schedule-grid">
        <div class="card">
          <h3>Horaires d'ouverture</h3>
          <p class="small muted">Les créneaux de rendez-vous en ligne sont calculés à partir de ces plages (durée d'un créneau : ${App.state.site.slotMinutes} min).</p>
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
            <p class="small muted">Sans heures : journée(s) entière(s) fermée(s). Avec heures : seule cette plage est bloquée (réunion, rendez-vous perso…). Les RDV déjà pris ne sont pas annulés.</p>
            <div class="field"><label for="c-reason">Motif</label><input id="c-reason" name="reason" type="text" placeholder="Congés, formation…"></div>
            <button class="btn btn-ghost" type="submit">Ajouter la fermeture</button>
          </form>
          ${closures.length ? `<ul class="facts">${closures.map((c) => `
            <li><span>${c.start_date === c.end_date ? App.fmtDate(c.start_date, { day: 'numeric', month: 'short', year: 'numeric' }) : `${App.fmtDate(c.start_date, { day: 'numeric', month: 'short' })} → ${App.fmtDate(c.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`}${c.start_time ? ` · ${c.start_time.replace(':', 'h')}–${c.end_time.replace(':', 'h')}` : ' · journée entière'} ${c.reason ? `· ${esc(c.reason)}` : ''}</span>
            <button class="btn btn-danger btn-sm" data-del-closure="${c.id}">Supprimer</button></li>`).join('')}</ul>` : '<p class="muted">Aucune fermeture prévue.</p>'}
        </div>
      </div>`;

    // Pré-remplit la date de fin avec la date de début
    panel.querySelector('#c-start').addEventListener('change', (e) => {
      const end = panel.querySelector('#c-end');
      if (!end.value || end.value < e.target.value) end.value = e.target.value;
    });
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
        Admin.show('schedule');
      } catch (err) { fail(err); }
    });
  }

  // Actions des onglets Programmes / Horaires
  Admin.panel.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.id === 'new-program') openProgram(null).catch(fail);
    if (t.matches('[data-edit]')) openProgram(Number(t.dataset.edit)).catch(fail);
    if (t.matches('[data-del]') && confirm('Supprimer ce programme ? (s\'il a déjà été vendu, il sera seulement masqué du catalogue)')) {
      try {
        const r = await api(`/admin/programs/${t.dataset.del}`, { method: 'DELETE', body: {} });
        App.toast(r.unpublished ? 'Programme déjà vendu : masqué du catalogue.' : 'Programme supprimé.');
        Admin.show('programs');
      } catch (err) { fail(err); }
    }
    if (t.matches('[data-del-closure]')) {
      try { await api(`/admin/schedule/closures/${t.dataset.delClosure}`, { method: 'DELETE', body: {} }); Admin.show('schedule'); } catch (err) { fail(err); }
    }
  });

  Admin.register('programs', tabPrograms);
  Admin.register('orders', tabOrders);
  Admin.register('schedule', tabSchedule);
})();
