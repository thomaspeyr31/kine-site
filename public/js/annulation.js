// Annulation d'un RDV via le lien reçu par e-mail (sans compte)
(async () => {
  const { esc } = App;
  await App.ready;
  const box = document.getElementById('box');
  const token = App.params.get('token') || '';

  async function show() {
    try {
      const { appointment: a } = await App.api(`/appointments/by-token/${encodeURIComponent(token)}`);
      const when = App.fmtDateTime(a.start_at);
      if (a.status !== 'confirme') {
        box.innerHTML = `<h1>Rendez-vous ${a.status === 'annule' ? 'annulé' : 'terminé'}</h1><p>${esc(a.type_label)} du ${when}.</p><a class="btn" href="/rdv.html">Prendre un nouveau rendez-vous</a>`;
        return;
      }
      box.innerHTML = `
        <h1>Annuler votre rendez-vous ?</h1>
        <p>${esc(a.first_name)}, votre ${esc(a.type_label.toLowerCase())} est prévu le <strong>${when}</strong>.</p>
        <div id="alert" class="hidden"></div>
        <div class="row"><button class="btn btn-danger" id="cancel">Oui, annuler</button><a class="btn btn-ghost" href="/">Non, garder</a></div>`;
      document.getElementById('cancel').addEventListener('click', async (e) => {
        await App.busy(e.currentTarget, async () => {
          try {
            await App.api(`/appointments/by-token/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: {} });
            show();
          } catch (err) {
            App.showAlert(document.getElementById('alert'), err.message);
          }
        });
      });
    } catch (e) {
      box.innerHTML = `<h1>Lien invalide</h1><p class="muted">${esc(e.message)}</p>`;
    }
  }
  show();
})();
