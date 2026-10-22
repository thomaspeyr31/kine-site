// Programme acheté : exercices semaine par semaine, vidéos intégrées, progression et journal de séances.
(async () => {
  const { esc, params } = App;
  await App.ready;
  if (!App.requireLogin()) return;
  const box = document.getElementById('content');
  const slug = params.get('slug') || '';
  if (params.get('achat')) {
    App.showAlert(document.getElementById('alert'), 'Merci pour votre achat ! Votre programme est prêt. Votre facture vous a été envoyée par e-mail.', 'ok');
    history.replaceState(null, '', `/mon-programme.html?slug=${encodeURIComponent(slug)}`);
  }

  let data;
  try {
    data = await App.api(`/programs/${encodeURIComponent(slug)}/content`);
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)} <a href="/programme.html?slug=${encodeURIComponent(slug)}">Voir la fiche du programme</a></div>`;
    return;
  }
  const { program, exercises } = data;
  let sessions = data.sessions;
  document.title = program.title;

  const DIFF = { facile: 'Facile', adaptee: 'Adaptée', difficile: 'Difficile' };
  const painClass = (p) => (p >= 7 ? 'pain-high' : p >= 4 ? 'pain-mid' : 'pain-low');

  // Lien YouTube / Vimeo → adresse du lecteur intégrable (sinon simple lien)
  function embedUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\.|^m\./, '');
      let id;
      if (host === 'youtu.be') id = u.pathname.slice(1);
      else if (host.endsWith('youtube.com')) id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1];
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const v = u.pathname.match(/(\d+)/)?.[1];
        if (v) return `https://player.vimeo.com/video/${v}`;
      }
    } catch { /* lien invalide */ }
    return null;
  }

  const weeks = [...new Set(exercises.map((e) => e.week_number))].sort((a, b) => a - b);
  let currentWeek = weeks.find((w) => exercises.some((e) => e.week_number === w && !e.done)) || weeks[0];

  // Séances notées pendant la semaine calendaire en cours
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sessionsThisWeek = () => sessions.filter((s) => App.toDate(s.created_at) >= monday).length;
  const todayLog = () => sessions.find((s) => App.toDate(s.created_at).toDateString() === new Date().toDateString());
  const loggedToday = () => !!todayLog();

  function exerciseHtml(e) {
    const embed = e.video_url && embedUrl(e.video_url);
    return `
      <div class="exercise ${e.done ? 'done' : ''}" data-ex="${e.id}">
        <input type="checkbox" data-id="${e.id}" ${e.done ? 'checked' : ''} aria-label="Marquer « ${esc(e.name)} » comme fait">
        <h3>${esc(e.name)}</h3>
        <div class="dose">
          ${e.sets ? `<span class="badge">${e.sets} série${e.sets > 1 ? 's' : ''}</span>` : ''}
          ${e.reps ? `<span class="badge badge-accent">${esc(e.reps)}</span>` : ''}
          ${e.rest_seconds ? `<span class="badge badge-muted">repos ${e.rest_seconds} s</span>` : ''}
        </div>
        ${e.instructions ? `<p>${esc(e.instructions)}</p>` : ''}
        ${e.video_url ? (embed
          ? `<p><button type="button" class="btn btn-ghost btn-sm" data-video="${esc(embed)}">▶ Voir la vidéo</button></p><div class="video hidden"></div>`
          : `<p><a href="${esc(e.video_url)}" target="_blank" rel="noopener">▶ Voir la vidéo</a></p>`) : ''}
      </div>`;
  }

  function sessionsHtml() {
    const n = sessionsThisWeek();
    const t = todayLog() || { pain: 0, difficulty: 'adaptee', comment: '' };
    return `
      <section class="card stack" id="journal">
        <div class="spread">
          <h2>Journal de séances</h2>
          <span class="badge ${n >= program.sessions_per_week ? 'badge-ok' : 'badge-muted'}">${n} / ${program.sessions_per_week} cette semaine</span>
        </div>
        <p class="small muted">À la fin de chaque séance, notez votre douleur et votre ressenti : votre kiné peut suivre votre évolution et adapter le programme.</p>
        <form id="session-form" class="form">
          <div class="field">
            <label for="pain">Douleur pendant la séance : <output id="pain-out" class="pain ${painClass(t.pain)}">${t.pain}</output> / 10</label>
            <input id="pain" name="pain" type="range" min="0" max="10" step="1" value="${t.pain}">
            <div class="spread small muted"><span>0 aucune</span><span>5 modérée</span><span>10 maximale</span></div>
          </div>
          <fieldset class="field">
            <legend class="label">Difficulté des exercices</legend>
            <div class="row">
              ${Object.entries(DIFF).map(([k, v]) => `<label class="check"><input type="radio" name="difficulty" value="${k}" ${k === t.difficulty ? 'checked' : ''}> <span>${v}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field"><label for="comment">Commentaire <span class="muted">(facultatif)</span></label>
            <textarea id="comment" name="comment" maxlength="1000" placeholder="Ex. : genou un peu raide au réveil, montée de marche plus facile qu'hier…">${esc(t.comment || '')}</textarea></div>
          <div id="session-feedback" class="hidden" role="status"></div>
          <button class="btn" type="submit">${loggedToday() ? 'Mettre à jour la séance du jour' : 'J\'ai terminé ma séance'}</button>
        </form>
        ${sessions.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Semaine</th><th>Douleur</th><th>Ressenti</th><th>Commentaire</th></tr></thead>
            <tbody>${sessions.slice(0, 10).map((s) => `<tr>
              <td>${App.fmtDate(s.created_at, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
              <td>S${s.week_number}</td>
              <td><span class="pain ${painClass(s.pain)}">${s.pain}</span></td>
              <td>${DIFF[s.difficulty]}</td>
              <td class="small">${esc(s.comment || '—')}</td>
            </tr>`).join('')}</tbody></table></div>` : ''}
      </section>`;
  }

  function render() {
    box.innerHTML = `
      <a href="/compte.html" class="small">← Mon espace</a>
      <h1>${esc(program.title)}</h1>
      <p class="muted">${program.duration_weeks} semaines · ${program.sessions_per_week} séances par semaine. Arrêtez l'exercice si la douleur dépasse 3/10.</p>
      <div class="spread small"><span>Progression</span><strong id="pct"></strong></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div id="bar"></div></div>
      <div class="week-tabs" role="group" aria-label="Semaines">
        ${weeks.map((w) => {
          const all = exercises.filter((e) => e.week_number === w);
          const complete = all.every((e) => e.done);
          return `<button class="chip" data-week="${w}" aria-pressed="${w === currentWeek}">${complete ? '✓ ' : ''}Semaine ${w}</button>`;
        }).join('')}
      </div>
      <section class="week">${exercises.filter((e) => e.week_number === currentWeek).map(exerciseHtml).join('')}</section>
      ${sessionsHtml()}
      <div class="card spread"><span>Une question, une douleur qui persiste ?</span><a class="btn btn-sm" href="/rdv.html">Réserver un suivi</a></div>`;
    updateProgress();
  }

  function updateProgress() {
    const count = exercises.filter((e) => e.done).length;
    const pct = exercises.length ? Math.round((count / exercises.length) * 100) : 0;
    document.getElementById('pct').textContent = `${pct} %`;
    document.getElementById('bar').style.width = `${pct}%`;
    document.querySelector('.progress').setAttribute('aria-valuenow', pct);
  }

  box.addEventListener('click', (e) => {
    const w = e.target.closest('[data-week]');
    if (w) { currentWeek = Number(w.dataset.week); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const v = e.target.closest('[data-video]');
    if (v) {
      const frame = v.closest('.exercise').querySelector('.video');
      const open = frame.classList.toggle('hidden') === false;
      if (open && !frame.firstChild) {
        frame.innerHTML = `<iframe src="${esc(v.dataset.video)}" title="Vidéo de l'exercice" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      }
      v.textContent = open ? '✕ Masquer la vidéo' : '▶ Voir la vidéo';
    }
  });

  // Coche / décoche un exercice (sans recharger la page : une vidéo en cours continue)
  box.addEventListener('change', async (e) => {
    if (e.target.id === 'pain') return;
    if (!e.target.matches('[data-id]')) return;
    const ex = exercises.find((x) => x.id === Number(e.target.dataset.id));
    const checked = e.target.checked;
    ex.done = checked;
    e.target.closest('.exercise').classList.toggle('done', checked);
    updateProgress();
    try {
      await App.api(`/me/progress/${ex.id}`, { method: 'PUT', body: { done: checked } });
      const weekDone = exercises.filter((x) => x.week_number === currentWeek).every((x) => x.done);
      if (checked && weekDone) App.toast(`Semaine ${currentWeek} terminée, bravo ! 💪`);
    } catch (err) {
      ex.done = !checked;
      e.target.checked = !checked;
      e.target.closest('.exercise').classList.toggle('done', !checked);
      updateProgress();
      App.toast(err.message);
    }
  });

  box.addEventListener('input', (e) => {
    if (e.target.id !== 'pain') return;
    const out = document.getElementById('pain-out');
    out.textContent = e.target.value;
    out.className = `pain ${painClass(Number(e.target.value))}`;
  });

  box.addEventListener('submit', async (e) => {
    if (e.target.id !== 'session-form') return;
    e.preventDefault();
    const form = e.target;
    const d = App.formData(form);
    await App.busy(form.querySelector('[type="submit"]'), async () => {
      try {
        await App.api('/me/sessions', { method: 'POST', body: { programId: program.id, week: currentWeek, pain: Number(d.pain), difficulty: d.difficulty, comment: d.comment } });
        ({ sessions } = await App.api(`/programs/${encodeURIComponent(slug)}/content`));
        render();
        const pain = Number(d.pain);
        const fb = document.getElementById('session-feedback');
        if (pain >= 7) {
          App.showAlert(fb, `Douleur élevée (${pain}/10) : arrêtez les exercices qui font mal et contactez le cabinet au ${App.state.site.phone} ou réservez un suivi.`, 'error');
        } else if (pain >= 4) {
          App.showAlert(fb, `Séance enregistrée. Douleur modérée (${pain}/10) : réduisez le nombre de répétitions à la prochaine séance. Si elle persiste, parlez-en à votre kiné.`, 'info');
        } else {
          App.showAlert(fb, 'Séance enregistrée, bravo ! Continuez comme ça.', 'ok');
        }
      } catch (err) { App.toast(err.message, 5000); }
    });
  });

  render();
})();
