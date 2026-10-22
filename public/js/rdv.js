// Prise de rendez-vous : calendrier mensuel → créneaux du jour → formulaire patient
(async () => {
  const { esc } = App;
  await App.ready;

  const cal = document.getElementById('calendar');
  const slotsBox = document.getElementById('slots');
  const slotsTitle = document.getElementById('slots-title');
  const form = document.getElementById('form');
  const recap = document.getElementById('recap');
  const formAlert = document.getElementById('form-alert');

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1); // 60 jours ≈ 3 mois affichables

  let month = new Date(firstMonth);
  let availability = {};
  let selectedDay = null;
  let selectedTime = null;

  // Pré-remplit le formulaire si le patient est connecté
  const u = App.state.user;
  if (u) {
    form.firstName.value = u.firstName;
    form.lastName.value = u.lastName;
    form.email.value = u.email;
    form.phone.value = u.phone || '';
  }

  async function loadMonth() {
    const key = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
    cal.setAttribute('aria-busy', 'true');
    try {
      ({ days: availability } = await App.api(`/appointments/availability?month=${key}`));
    } catch (e) {
      availability = {};
      App.toast(e.message);
    }
    cal.removeAttribute('aria-busy');
    renderCalendar();
  }

  function renderCalendar() {
    const label = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7; // lundi en premier
    const nbDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let d = 1; d <= nbDays; d++) {
      const key = ymd(new Date(month.getFullYear(), month.getMonth(), d));
      const n = availability[key] || 0;
      const cls = ['cal-day', n ? 'available' : '', n && n <= 3 ? 'few' : '', key === selectedDay ? 'selected' : '', key === ymd(today) ? 'today' : ''].join(' ');
      const aria = n ? `${d} — ${n} créneau${n > 1 ? 'x' : ''} libre${n > 1 ? 's' : ''}` : `${d} — complet ou fermé`;
      cells += `<button class="${cls}" data-day="${key}" ${n ? '' : 'disabled'} aria-label="${aria}">${d}</button>`;
    }
    cal.innerHTML = `
      <div class="cal-head">
        <button class="cal-nav" id="prev" aria-label="Mois précédent" ${month <= firstMonth ? 'disabled' : ''}>‹</button>
        <h3>${label}</h3>
        <button class="cal-nav" id="next" aria-label="Mois suivant" ${month >= lastMonth ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-grid">
        ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((j) => `<span class="cal-dow">${j}</span>`).join('')}
        ${cells}
      </div>`;
  }

  cal.addEventListener('click', (e) => {
    if (e.target.id === 'prev') { month.setMonth(month.getMonth() - 1); loadMonth(); return; }
    if (e.target.id === 'next') { month.setMonth(month.getMonth() + 1); loadMonth(); return; }
    const btn = e.target.closest('[data-day]');
    if (btn && !btn.disabled) selectDay(btn.dataset.day);
  });

  async function selectDay(day) {
    selectedDay = day;
    selectedTime = null;
    form.classList.add('hidden');
    renderCalendar();
    slotsTitle.textContent = `Créneaux du ${App.fmtDate(day)}`;
    slotsBox.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const { slots } = await App.api(`/appointments/slots?date=${day}`);
      slotsBox.innerHTML = slots.length
        ? slots.map((t) => `<button class="slot" data-time="${t}" aria-pressed="false">${t.replace(':', 'h')}</button>`).join('')
        : '<p class="muted">Plus de créneau ce jour-là.</p>';
    } catch (e) {
      slotsBox.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
    }
  }

  slotsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-time]');
    if (!btn) return;
    selectedTime = btn.dataset.time;
    slotsBox.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', b === btn));
    recap.textContent = `📅 ${App.fmtDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} à ${selectedTime.replace(':', 'h')}`;
    form.classList.remove('hidden');
    formAlert.classList.add('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = App.formData(form);
    if (!data.firstName || !data.lastName || !data.email || !data.phone) return App.showAlert(formAlert, 'Merci de remplir les champs obligatoires (*).');
    if (!data.consent) return App.showAlert(formAlert, 'Merci de cocher la case de consentement.');
    const btn = form.querySelector('[type="submit"]');
    await App.busy(btn, async () => {
      try {
        const r = await App.api('/appointments', { method: 'POST', body: { ...data, date: selectedDay, time: selectedTime } });
        document.getElementById('booking').classList.add('hidden');
        const done = document.getElementById('done');
        done.className = 'card stack';
        done.innerHTML = `
          <h2>✅ Rendez-vous confirmé</h2>
          <p>Le <strong>${esc(r.when)}</strong>, au ${esc(App.state.site.address)}.</p>
          <p class="muted">Un e-mail de confirmation vous a été envoyé à ${esc(data.email)}, avec un lien pour annuler si besoin (jusqu'à ${App.state.site.cancelHours} h avant).</p>
          ${App.state.site.mailConfigured ? '' : '<p class="alert alert-info small">Mode développement : l\'envoi d\'e-mails n\'est pas configuré (SMTP). L\'e-mail de confirmation est affiché dans le terminal du serveur.</p>'}
          <p class="muted">Pensez à apporter votre ordonnance, votre carte Vitale et une tenue confortable.</p>
          <div class="row"><a class="btn" href="/">Retour à l'accueil</a>${App.state.user ? '<a class="btn btn-ghost" href="/compte.html">Mes rendez-vous</a>' : ''}</div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        if (err.status === 409) {
          // Créneau pris entre-temps : on recharge les disponibilités
          App.toast(err.message, 6000);
          await loadMonth();
          selectDay(selectedDay);
        } else {
          App.showAlert(formAlert, err.message);
        }
      }
    });
  });

  await loadMonth();
  // Ouvre directement le premier jour disponible (mois suivant si celui-ci est complet)
  let first = Object.keys(availability).find((d) => availability[d] > 0);
  if (!first) {
    month.setMonth(month.getMonth() + 1);
    await loadMonth();
    first = Object.keys(availability).find((d) => availability[d] > 0);
  }
  if (first) selectDay(first);
})();
