// Connexion et inscription
(async () => {
  await App.ready;
  // Retour vers la page demandée après connexion (uniquement un chemin interne)
  const nextParam = App.params.get('next') || '';
  const next = /^\/(?!\/)/.test(nextParam) ? nextParam : '/compte.html';
  if (App.state.user) { location.replace(next); return; }

  const qs = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';
  document.getElementById('to-register')?.setAttribute('href', `/inscription.html${qs}`);
  document.getElementById('to-login')?.setAttribute('href', `/connexion.html${qs}`);

  const form = document.getElementById('login-form') || document.getElementById('register-form');
  const alertBox = document.getElementById('alert');
  const endpoint = form.id === 'login-form' ? '/auth/login' : '/auth/register';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.busy(form.querySelector('[type="submit"]'), async () => {
      try {
        await App.api(endpoint, { method: 'POST', body: App.formData(form) });
        location.href = next;
      } catch (err) {
        App.showAlert(alertBox, err.message);
      }
    });
  });
})();
