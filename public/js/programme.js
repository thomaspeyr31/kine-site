(async () => {
  const { esc, euros, LEVELS, params } = App;
  await App.ready;
  const box = document.getElementById('program');
  const alertBox = document.getElementById('alert');
  const slug = params.get('slug');
  const { user, site } = App.state;

  if (params.get('annule')) App.showAlert(alertBox, 'Paiement annulé : aucun montant n\'a été débité.', 'info');

  let data;
  try {
    data = await App.api(`/programs/${encodeURIComponent(slug || '')}`);
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)} <a href="/programmes.html">Voir le catalogue</a></div>`;
    return;
  }
  const { program: p, preview, weeks, owned } = data;
  document.title = `${p.title} — programme de rééducation`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', p.short_description);

  const paragraphs = p.description.split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join('');
  const total = weeks.reduce((n, w) => n + w.exercises, 0);
  const contentLink = `/mon-programme.html?slug=${encodeURIComponent(p.slug)}`;

  let action;
  if (user?.role === 'admin') {
    action = `<div class="alert alert-info small">Vous êtes connecté en tant que <strong>kiné (administrateur)</strong> : vous avez accès à tous les programmes, donc pas de bouton d'achat. Pour tester un achat, connectez-vous avec un compte patient.</div>
      <a class="btn btn-block" href="${contentLink}">Voir le contenu</a>`;
  } else if (owned) {
    action = `<a class="btn btn-block" href="${contentLink}">Ouvrir mon programme</a>`;
  } else {
    action = `<form id="buy-form" class="form">
        <label class="check small"><input type="checkbox" name="acceptCgv" required> <span>J'ai lu et j'accepte les <a href="/cgv.html" target="_blank">conditions générales de vente</a>.</span></label>
        <label class="check small"><input type="checkbox" name="waiver" required> <span>Je souhaite accéder au programme immédiatement après le paiement et je reconnais perdre mon droit de rétractation de 14 jours.</span></label>
        <button class="btn btn-accent btn-block" type="submit">${user ? 'Acheter ce programme' : 'Se connecter et acheter'}</button>
      </form>
      ${site.demoPayments
        ? '<p class="alert alert-info small">Mode démo : aucun paiement ne sera demandé (Stripe non configuré). Le programme sera débloqué directement.</p>'
        : '<p class="small muted center">🔒 Paiement sécurisé par carte via Stripe. Facture envoyée par e-mail.</p>'}`;
  }

  box.innerHTML = `
    <article class="stack">
      <a href="/programmes.html" class="small">← Tous les programmes</a>
      <div class="row"><span class="badge">${esc(p.body_area)}</span><span class="badge badge-muted">${LEVELS[p.level]}</span></div>
      <h1>${esc(p.title)}</h1>
      <p class="lead muted">${esc(p.short_description)}</p>
      ${paragraphs}

      <h2>Déroulé</h2>
      <ol class="weeks-list">
        ${weeks.map((w) => `<li><strong>Semaine ${w.week}</strong><span>${w.exercises} exercice${w.exercises > 1 ? 's' : ''} · ${p.sessions_per_week} séances</span></li>`).join('')}
      </ol>
      <p class="small muted">${total} exercices au total, avec séries, répétitions, temps de repos, consignes et vidéos de démonstration.</p>

      <h2>Aperçu de la semaine 1</h2>
      <ol class="preview-list">${preview.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
      ${owned ? '' : '<div class="locked">🔒 Le détail des exercices et les semaines suivantes sont accessibles après l\'achat.</div>'}

      <div class="card small stack">
        <strong>À savoir avant de commencer</strong>
        <p class="muted">Ce programme ne remplace pas une consultation. En cas de douleur importante, récente, nocturne ou accompagnée de fourmillements, faites d'abord un bilan. Pendant les exercices, la douleur doit rester inférieure à 3/10.</p>
      </div>
    </article>
    <aside class="card buy-box">
      <div class="price">${euros(p.price_cents)}</div>
      <p class="small muted">Paiement unique · accès illimité</p>
      <ul class="facts">
        <li><span>Durée</span><span>${p.duration_weeks} semaines</span></li>
        <li><span>Fréquence</span><span>${p.sessions_per_week} séances / sem.</span></li>
        <li><span>Exercices</span><span>${total}</span></li>
        <li><span>Niveau</span><span>${LEVELS[p.level]}</span></li>
      </ul>
      ${action}
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
        location.href = url; // redirection vers Stripe Checkout (ou directement le programme en mode démo)
      } catch (err) {
        App.showAlert(alertBox, err.message);
      }
    });
  });
})();
