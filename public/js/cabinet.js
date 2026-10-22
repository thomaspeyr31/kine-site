(async () => {
  await App.ready;
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const { hours } = await App.api('/appointments/hours');
  document.getElementById('hours').innerHTML = DAYS.map((name, i) => {
    const ranges = hours.filter((h) => h.weekday === i + 1).map((h) => `${h.start.replace(':', 'h')} – ${h.end.replace(':', 'h')}`);
    return `<li><span>${name}</span><span>${ranges.length ? ranges.join(' / ') : 'Fermé'}</span></li>`;
  }).join('');
})();
