// Connexion et inscription
(async () => {
  await App.ready;
  // Retour vers la page demandée après connexion (uniquement un chemin interne)
  const nextParam = App.params.get('next') || '';
  const home = (u) => (u?.role === 'admin' ? '/admin.html' : '/compte.html');
  const next = /^\/(?!\/)/.test(nextParam) ? nextParam : null;
  if (App.state.user) { location.replace(next || home(App.state.user)); return; }

  const qs = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';
  document.getElementById('to-register')?.setAttribute('href', `/inscription.html${qs}`);
  document.getElementById('to-login')?.setAttribute('href', `/connexion.html${qs}`);

  const form = document.getElementById('login-form') || document.getElementById('register-form');

  // Comptes de test affichés uniquement en développement
  const demo = document.getElementById('demo-accounts');
  if (demo && App.state.site?.isDev) {
    demo.classList.remove('hidden');
    demo.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-demo]');
      if (!btn) return;
      const [mail, pwd] = btn.dataset.demo.split('|');
      form.elements.email.value = mail;
      form.elements.password.value = pwd;
    });
  }
  const alertBox = document.getElementById('alert');
  const endpoint = form.id === 'login-form' ? '/auth/login' : '/auth/register';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.busy(form.querySelector('[type="submit"]'), async () => {
      try {
        const { user } = await App.api(endpoint, { method: 'POST', body: App.formData(form) });
        location.href = next || home(user);
      } catch (err) {
        App.showAlert(alertBox, err.message);
      }
    });
  });
})();
