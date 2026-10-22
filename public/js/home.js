(async () => {
  await App.ready;
  const box = document.getElementById('featured');
  try {
    const { programs } = await App.api('/programs');
    box.innerHTML = programs.slice(0, 3).map(App.programCard).join('');
  } catch (e) {
    box.innerHTML = `<div class="empty">${App.esc(e.message)}</div>`;
  }
})();

if (App.params.get('compte') === 'supprime') {
  App.toast('Votre compte a été supprimé. Merci de votre confiance.', 6000);
  history.replaceState(null, '', '/');
}
