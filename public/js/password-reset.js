// Mot de passe oublié (demande du lien) et réinitialisation (choix du nouveau mot de passe)
(async () => {
  await App.ready;
  const alertBox = document.getElementById('alert');

  const forgot = document.getElementById('forgot-form');
  forgot?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.busy(forgot.querySelector('[type="submit"]'), async () => {
      try {
        await App.api('/auth/forgot', { method: 'POST', body: App.formData(forgot) });
        forgot.innerHTML = '<div class="alert alert-ok">Si un compte existe avec cette adresse, un e-mail vient de vous être envoyé. Pensez à vérifier vos courriers indésirables. Le lien est valable 1 heure.</div>'
          + (App.state.site?.mailConfigured ? '' : '<p class="alert alert-info small">Mode développement : l\'envoi d\'e-mails n\'est pas configuré (SMTP). Le lien est affiché dans le terminal du serveur.</p>');
      } catch (err) {
        App.showAlert(alertBox, err.message);
      }
    });
  });

  const reset = document.getElementById('reset-form');
  if (reset) {
    const token = App.params.get('token') || '';
    // Retire le jeton de la barre d'adresse (historique, partage d'écran…)
    history.replaceState(null, '', '/reinitialiser.html');
    if (!token) {
      App.showAlert(alertBox, 'Lien incomplet. Ouvrez le lien reçu par e-mail ou refaites une demande.');
      reset.querySelector('[type="submit"]').disabled = true;
    }
    reset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = App.formData(reset);
      if (data.password !== data.confirm) return App.showAlert(alertBox, 'Les deux mots de passe ne correspondent pas.');
      await App.busy(reset.querySelector('[type="submit"]'), async () => {
        try {
          await App.api('/auth/reset', { method: 'POST', body: { token, password: data.password } });
          App.toast('Mot de passe modifié, vous êtes connecté.');
          setTimeout(() => { location.href = '/compte.html'; }, 900);
        } catch (err) {
          App.showAlert(alertBox, `${err.message} `);
          alertBox.insertAdjacentHTML('beforeend', '<a href="/mot-de-passe-oublie.html">Nouvelle demande</a>');
        }
      });
    });
  }
})();
