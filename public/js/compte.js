(async () => {
  const { esc, euros } = App;
  await App.ready;
  if (!App.requireLogin()) return;
  const me = App.state.user;
  document.getElementById('hello').textContent = me.firstName;
  const alertBox = document.getElementById('alert');

  // Retour de Stripe Checkout : on vérifie le paiement
  const sessionId = App.params.get('session_id');
  if (sessionId) {
    try {
      const { status } = await App.api('/orders/confirm', { method: 'POST', body: { sessionId } });
      App.showAlert(alertBox, status === 'paid'
        ? 'Paiement reçu, merci ! Votre programme est disponible ci-dessous et votre facture vous a été envoyée par e-mail.'
        : 'Paiement en cours de validation, actualisez la page dans quelques instants.', status === 'paid' ? 'ok' : 'info');
    } catch (e) {
      App.showAlert(alertBox, e.message);
    }
    history.replaceState(null, '', '/compte.html');
  }

  // ---------- Programmes ----------
  async function loadPrograms() {
    const box = document.getElementById('my-programs');
    const { programs } = await App.api('/me/programs');
    box.innerHTML = programs.length
      ? programs.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return `
          <a class="card program-card" href="/mon-programme.html?slug=${encodeURIComponent(p.slug)}">
            <div class="area-band ${App.areaColor(p.body_area)}"></div>
            <span class="badge">${esc(p.body_area)}</span>
            <h3>${esc(p.title)}</h3>
            <p>${p.duration_weeks} semaines · ${pct} % réalisé</p>
            <div class="progress"><div class="js-bar" data-pct="${pct}"></div></div>
            <div class="meta"><span class="small muted">Acheté le ${App.fmtDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span class="btn btn-sm">Ouvrir</span></div>
          </a>`;
        }).join('')
      : '<div class="empty">Aucun programme pour le moment. <a href="/programmes.html">Découvrir les programmes</a></div>';
    // Largeur des barres fixée en JS (la politique de sécurité interdit les styles en ligne)
    box.querySelectorAll('.js-bar').forEach((b) => { b.style.width = `${b.dataset.pct}%`; });
  }

  // ---------- Rendez-vous ----------
  async function loadAppointments() {
    const box = document.getElementById('my-appointments');
    const { appointments } = await App.api('/me/appointments');
    if (!appointments.length) {
      box.innerHTML = '<div class="empty">Aucun rendez-vous.</div>';
      return;
    }
    const now = new Date();
    box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Statut</th><th></th></tr></thead>
      <tbody>${appointments.map((a) => {
        const [label, cls] = App.APPT_STATUS[a.status];
        const future = App.toDate(a.start_at) > now && a.status === 'confirme';
        return `<tr>
          <td>${App.fmtDateTime(a.start_at)}</td>
          <td>${esc(a.type_label)}</td>
          <td><span class="badge ${cls}">${label}</span></td>
          <td>${future ? `<button class="btn btn-danger btn-sm" data-cancel="${a.id}">Annuler</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  document.getElementById('my-appointments').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn || !confirm('Annuler ce rendez-vous ?')) return;
    try {
      await App.api(`/me/appointments/${btn.dataset.cancel}/cancel`, { method: 'POST', body: {} });
      App.toast('Rendez-vous annulé.');
      loadAppointments();
    } catch (err) {
      App.showAlert(alertBox, err.message);
    }
  });

  // ---------- Factures ----------
  const ORDER_STATUS = { paid: '', refunded: ' <span class="badge badge-danger">Remboursé</span>' };
  async function loadOrders() {
    const box = document.getElementById('my-orders');
    const { orders } = await App.api('/me/orders');
    box.innerHTML = orders.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Programme</th><th>Montant</th><th>Facture</th></tr></thead>
      <tbody>${orders.map((o) => `<tr>
        <td>${App.fmtDate(o.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td>${esc(o.program_title)}${ORDER_STATUS[o.status] || ''}</td>
        <td>${euros(o.amount_cents)}</td>
        <td><a href="/api/me/orders/${o.id}/invoice.pdf" target="_blank" rel="noopener">${esc(o.invoice_number)} (PDF)</a></td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucune facture.</div>';
  }

  // ---------- Compte ----------
  const profile = document.getElementById('profile-form');
  profile.elements.firstName.value = me.firstName;
  profile.elements.lastName.value = me.lastName;
  profile.elements.phone.value = me.phone || '';
  document.getElementById('pf-email').value = me.email;

  profile.addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.busy(profile.querySelector('[type="submit"]'), async () => {
      try {
        await App.api('/me/profile', { method: 'PUT', body: App.formData(profile) });
        document.getElementById('hello').textContent = profile.elements.firstName.value;
        App.toast('Informations enregistrées.');
      } catch (err) { App.toast(err.message, 5000); }
    });
  });

  const pwForm = document.getElementById('password-form');
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.busy(pwForm.querySelector('[type="submit"]'), async () => {
      try {
        await App.api('/me/password', { method: 'PUT', body: App.formData(pwForm) });
        pwForm.reset();
        App.toast('Mot de passe modifié.');
      } catch (err) { App.toast(err.message, 5000); }
    });
  });

  const delForm = document.getElementById('delete-form');
  delForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('Supprimer définitivement votre compte ? Cette action est irréversible.')) return;
    await App.busy(delForm.querySelector('[type="submit"]'), async () => {
      try {
        await App.api('/me/delete', { method: 'POST', body: App.formData(delForm) });
        location.href = '/?compte=supprime';
      } catch (err) { App.toast(err.message, 5000); }
    });
  });

  try {
    await Promise.all([loadPrograms(), loadAppointments(), loadOrders()]);
  } catch (e) {
    App.showAlert(alertBox, e.message);
  }
})();
