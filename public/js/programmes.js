(async () => {
  await App.ready;
  const list = document.getElementById('list');
  const filters = document.getElementById('filters');
  let programs = [];
  try {
    ({ programs } = await App.api('/programs'));
  } catch (e) {
    list.innerHTML = `<div class="empty">${App.esc(e.message)}</div>`;
    return;
  }

  const areas = ['Tous', ...new Set(programs.map((p) => p.body_area))];
  let current = 'Tous';

  function render() {
    filters.innerHTML = areas.map((a) => `<button class="chip" aria-pressed="${a === current}" data-area="${App.esc(a)}">${App.esc(a)}</button>`).join('');
    const shown = current === 'Tous' ? programs : programs.filter((p) => p.body_area === current);
    list.innerHTML = shown.length ? shown.map(App.programCard).join('') : '<div class="empty">Aucun programme pour le moment.</div>';
  }

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    current = btn.dataset.area;
    render();
  });
  render();
})();
