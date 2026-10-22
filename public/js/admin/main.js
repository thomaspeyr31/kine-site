// Administration — démarrage : contrôle d'accès, onglet initial, liens directs (?patient=ID, ?rdv=ID).
(async () => {
  await App.ready;
  if (!App.requireLogin()) return;
  if (App.state.user.role !== 'admin') { location.replace('/compte.html'); return; }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) Admin.show(t.dataset.tab);
  });

  Admin.loadStats().catch(Admin.fail);
  await Admin.show('agenda');

  // Liens reçus par e-mail : ouvre directement la fiche ou le RDV
  const params = new URLSearchParams(location.search);
  if (params.get('patient')) Admin.openPatient(Number(params.get('patient')));
  else if (params.get('rdv')) Admin.openDetail(Number(params.get('rdv')));
  if (params.toString()) history.replaceState(null, '', '/admin.html');
})();
