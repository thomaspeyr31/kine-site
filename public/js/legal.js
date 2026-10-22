// Pages légales : textes qui dépendent de la configuration (TVA, durée de conservation…)
(async () => {
  const { site } = await App.ready;
  if (!site) return;
  const vat = document.getElementById('vat-line');
  if (vat) vat.textContent = site.vatRate > 0 ? `Ils incluent la TVA au taux de ${site.vatRate} %.` : `${site.vatExemptMention}.`;
  const ret = document.getElementById('retention');
  if (ret) ret.textContent = Math.round(site.retentionMonths / 12);
})();
