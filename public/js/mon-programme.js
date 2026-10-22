(async () => {
  const { esc, params } = App;
  await App.ready;
  if (!App.requireLogin()) return;
  const box = document.getElementById('content');
  const slug = params.get('slug') || '';
  if (params.get('achat')) App.showAlert(document.getElementById('alert'), 'Merci pour votre achat ! Votre programme est prêt.', 'ok');

  let data;
  try {
    data = await App.api(`/programs/${encodeURIComponent(slug)}/content`);
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)} <a href="/programme.html?slug=${encodeURIComponent(slug)}">Voir la fiche du programme</a></div>`;
    return;
  }
  const { program, exercises } = data;
  document.title = program.title;

  // Progression enregistrée sur le serveur (retrouvée sur tous les appareils)
  const done = {};
  exercises.forEach((e, i) => { if (e.done) done[i] = true; });

  const weeks = [...new Set(exercises.map((e) => e.week_number))].sort((a, b) => a - b);
  let currentWeek = weeks.find((w) => exercises.some((e, i) => e.week_number === w && !done[i])) || weeks[0];

  function render() {
    const total = exercises.length;
    const count = exercises.filter((_, i) => done[i]).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    box.innerHTML = `
      <a href="/compte.html" class="small">← Mon espace</a>
      <h1>${esc(program.title)}</h1>
      <p class="muted">${program.duration_weeks} semaines · ${program.sessions_per_week} séances par semaine. Arrêtez l'exercice en cas de douleur supérieure à 3/10.</p>
      <div class="spread small"><span>Progression</span><strong>${pct} %</strong></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div id="bar"></div></div>
      <div class="week-tabs" role="group" aria-label="Semaines">
        ${weeks.map((w) => `<button class="chip" data-week="${w}" aria-pressed="${w === currentWeek}">Semaine ${w}</button>`).join('')}
      </div>
      <section class="week">
        ${exercises.map((e, i) => (e.week_number !== currentWeek ? '' : `
          <div class="exercise ${done[i] ? 'done' : ''}">
            <input type="checkbox" data-i="${i}" data-id="${e.id}" ${done[i] ? 'checked' : ''} aria-label="Marquer « ${esc(e.name)} » comme fait">
            <h3>${esc(e.name)}</h3>
            <div class="dose">
              ${e.sets ? `<span class="badge">${e.sets} série${e.sets > 1 ? 's' : ''}</span>` : ''}
              ${e.reps ? `<span class="badge badge-accent">${esc(e.reps)}</span>` : ''}
              ${e.rest_seconds ? `<span class="badge badge-muted">repos ${e.rest_seconds} s</span>` : ''}
            </div>
            ${e.instructions ? `<p>${esc(e.instructions)}</p>` : ''}
            ${e.video_url ? `<p><a href="${esc(e.video_url)}" target="_blank" rel="noopener">▶ Voir la vidéo</a></p>` : ''}
          </div>`)).join('')}
      </section>
      <div class="card spread"><span>Une question sur un exercice ?</span><a class="btn btn-sm" href="/rdv.html">Réserver un suivi</a></div>`;
    document.getElementById('bar').style.width = `${pct}%`;
  }

  box.addEventListener('click', (e) => {
    const w = e.target.closest('[data-week]');
    if (w) { currentWeek = Number(w.dataset.week); render(); }
  });
  box.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-i]')) return;
    const { i, id } = e.target.dataset;
    const checked = e.target.checked;
    done[i] = checked;
    render();
    try {
      await App.api(`/me/progress/${id}`, { method: 'PUT', body: { done: checked } });
    } catch (err) {
      done[i] = !checked; // annule l'affichage si l'enregistrement a échoué
      render();
      App.toast(err.message);
    }
  });
  render();
})();
