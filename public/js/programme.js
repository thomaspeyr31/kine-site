(async () => {
  const { esc, euros, LEVELS, params } = App;
  await App.ready;
  const box = document.getElementById('program');
  const alertBox = document.getElementById('alert');
  const slug = params.get('slug');

  if (params.get('annule')) App.showAlert(alertBox, 'Paiement annulé : aucun montant n\'a été débité.', 'info');

  let data;
  try {
    data = await App.api(`/programs/${encodeURIComponent(slug || '')}`);
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)} <a href="/programmes.html">Voir le catalogue</a></div>`;
    return;
  }
  const { program: p, preview, owned } = data;
  document.title = `${p.title} — programme de rééducation`;

  const paragraphs = p.description.split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join('');
  box.innerHTML = `
    <article class="stack">
      <a href="/programmes.html" class="small">← Tous les programmes</a>
      <div class="row"><span class="badge">${esc(p.body_area)}</span><span class="badge badge-muted">${LEVELS[p.level]}</span></div>
      <h1>${esc(p.title)}</h1>
      <p class="lead muted">${esc(p.short_description)}</p>
      ${paragraphs}
      <h2>Aperçu de la semaine 1</h2>
      <ol class="preview-list">${preview.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
      ${owned ? '' : '<div class="locked">🔒 Le détail des exercices (séries, répétitions, consignes) et les semaines suivantes sont accessibles après l\'achat.</div>'}
    </article>
    <aside class="card buy-box">
      <div class="price">${euros(p.price_cents)}</div>
      <p class="small muted">Paiement unique · accès illimité</p>
      <ul class="facts">
        <li><span>Durée</span><span>${p.duration_weeks} semaines</span></li>
        <li><span>Fréquence</span><span>${p.sessions_per_week} séances / sem.</span></li>
        <li><span>Niveau</span><span>${LEVELS[p.level]}</span></li>
      </ul>
      ${App.state.user?.role === 'admin'
        ? `<div class="alert alert-info small">Vous êtes connecté en tant que <strong>kiné (administrateur)</strong> : vous avez accès à tous les programmes, donc pas de bouton d'achat. Pour tester un achat, déconnectez-vous et créez un compte patient.</div>
           <a class="btn btn-block" href="/mon-programme.html?slug=${encodeURIComponent(p.slug)}">Voir le contenu</a>`
        : owned
        ? `<a class="btn btn-block" href="/mon-programme.html?slug=${encodeURIComponent(p.slug)}">Ouvrir mon programme</a>`
        : `<form id="buy-form" class="form">
            <label class="check small"><input type="checkbox" name="acceptCgv" required> <span>J'ai lu et j'accepte les <a href="/cgv.html" target="_blank">conditions générales de vente</a>.</span></label>
            <label class="check small"><input type="checkbox" name="waiver" required> <span>Je souhaite accéder au programme immédiatement après le paiement et je reconnais perdre mon droit de rétractation de 14 jours.</span></label>
            <button class="btn btn-accent btn-block" type="submit">Acheter ce programme</button>
          </form>`}
      <p class="small muted center">Besoin d'un avis avant de commencer ? <a href="/rdv.html">Réservez un bilan</a></p>
    </aside>`;

  const form = document.getElementById('buy-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!App.requireLogin()) return;
    const { acceptCgv, waiver } = App.formData(form);
    if (!acceptCgv || !waiver) return App.showAlert(alertBox, 'Merci de cocher les deux cases avant de payer.');
    await App.busy(form.querySelector('[type="submit"]'), async () => {
      try {
        const { url } = await App.api('/orders/checkout', { method: 'POST', body: { programId: p.id, acceptCgv, waiver } });
        location.href = url; // redirection vers Stripe Checkout
      } catch (err) {
        App.showAlert(alertBox, err.message);
      }
    });
  });
})();
