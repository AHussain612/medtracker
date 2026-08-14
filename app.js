const COLORS = [
  { name: 'teal', hex: '#0d9488' },
  { name: 'pink', hex: '#db2777' },
  { name: 'gold', hex: '#b45309' },
  { name: 'green', hex: '#059669' },
];

const MEDICINES_KEY = 'medtracker.medicines';
const LOGS_KEY = 'medtracker.logs';
const NOTIFIED_KEY = 'medtracker.notified';
const NOTIF_DISMISSED_KEY = 'medtracker.notifDismissed';

function getMedicines() {
  return JSON.parse(localStorage.getItem(MEDICINES_KEY) || '[]');
}

function saveMedicines(medicines) {
  localStorage.setItem(MEDICINES_KEY, JSON.stringify(medicines));
}

function getLogs() {
  return JSON.parse(localStorage.getItem(LOGS_KEY) || '{}');
}

function saveLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

function getNotified() {
  return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
}

function markNotified(key) {
  const notified = getNotified();
  notified.push(key);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified.slice(-500)));
}

function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function logKey(medId, timeIndex, dateStr) {
  return `${medId}|${timeIndex}|${dateStr}`;
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// --- Home screen ---

function renderHome() {
  const medicines = getMedicines();
  const list = document.getElementById('home-list');

  if (medicines.length === 0) {
    list.innerHTML = '<li class="empty-state">No medicines yet.<br>Tap "+ Add Medicine" to start tracking.</li>';
    return;
  }

  list.innerHTML = '';
  medicines.forEach((med) => {
    const li = document.createElement('li');
    li.className = 'med-card';
    li.style.setProperty('--card-color', med.color);
    li.innerHTML = `
      <div class="med-info">
        <div class="med-name"><span class="med-dot"></span>${escapeHtml(med.name)}</div>
        <div class="med-dose">${escapeHtml(med.dose || '')}${med.dose ? ' · ' : ''}${med.times.length}x daily</div>
      </div>
      <button class="delete-btn" data-id="${med.id}" aria-label="Delete ${escapeHtml(med.name)}">&times;</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const med = medicines.find((m) => m.id === btn.dataset.id);
      if (confirm(`Remove "${med.name}" from your list?`)) {
        saveMedicines(medicines.filter((m) => m.id !== med.id));
        renderAll();
      }
    });
  });
}

// --- Schedule screen ---

function renderSchedule() {
  document.getElementById('schedule-month').textContent =
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const medicines = getMedicines();
  const logs = getLogs();
  const today = todayString();
  const list = document.getElementById('schedule-list');

  const doses = [];
  medicines.forEach((med) => {
    med.times.forEach((time, i) => doses.push({ med, time, timeIndex: i }));
  });
  doses.sort((a, b) => a.time.localeCompare(b.time));

  if (doses.length === 0) {
    list.innerHTML = '<li class="empty-state">No doses scheduled.<br>Add a medicine to see it here.</li>';
    return;
  }

  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  list.innerHTML = '';
  doses.forEach(({ med, time, timeIndex }) => {
    const key = logKey(med.id, timeIndex, today);
    const isLogged = !!logs[key];
    const isOverdue = !isLogged && time <= nowHHMM;

    const li = document.createElement('li');
    li.className = `med-card${isOverdue ? ' overdue' : ''}`;
    li.style.setProperty('--card-color', med.color);
    li.innerHTML = `
      <div class="med-info">
        <div class="med-name"><span class="med-dot"></span>${escapeHtml(med.name)} <span style="color:var(--text-muted);font-weight:500;">${escapeHtml(med.dose || '')}</span></div>
        <div class="med-time">${formatTime(time)}</div>
      </div>
      <button class="log-btn ${isLogged ? 'logged' : ''}" data-key="${key}">
        ${isLogged ? '✓ LOGGED' : 'LOG DOSE'}
      </button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.log-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const logs = getLogs();
      const key = btn.dataset.key;
      if (logs[key]) {
        delete logs[key];
      } else {
        logs[key] = true;
      }
      saveLogs(logs);
      renderSchedule();
      renderHome();
      updateBanner();
    });
  });
}

// --- Calendar screen ---

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

function dayData(dateStr) {
  const medicines = getMedicines();
  const logs = getLogs();
  const doses = [];
  medicines.forEach((med) => {
    med.times.forEach((time, i) => {
      doses.push({ med, time, taken: !!logs[logKey(med.id, i, dateStr)] });
    });
  });
  return doses;
}

function renderCalendar() {
  const monthDate = new Date(calendarYear, calendarMonth, 1);
  document.getElementById('cal-month-label').textContent = String(calendarYear);
  document.getElementById('cal-month-title').textContent =
    monthDate.toLocaleDateString(undefined, { month: 'long' });

  const dowRow = document.getElementById('cal-dow-row');
  dowRow.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="cal-dow">${d}</div>`).join('');

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const firstDow = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = todayString();

  for (let i = 0; i < firstDow; i++) {
    grid.innerHTML += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = todayString(new Date(calendarYear, calendarMonth, d));
    const isToday = dateStr === today;
    const doses = dayData(dateStr);
    const dots = doses
      .filter((x) => x.taken)
      .map((x) => `<span class="cal-dot" style="background:${x.med.color}"></span>`)
      .join('');

    const btn = document.createElement('button');
    btn.className = `cal-day ${isToday ? 'today' : ''}`;
    btn.innerHTML = `<span>${d}</span><span class="cal-dots">${dots}</span>`;
    btn.addEventListener('click', () => openDaySheet(dateStr));
    grid.appendChild(btn);
  }

  const medicines = getMedicines();
  const legend = document.getElementById('cal-legend');
  legend.innerHTML = medicines
    .map((m) => `<div class="legend-item"><span class="legend-dot" style="background:${m.color}"></span>${escapeHtml(m.name)}</div>`)
    .join('');
}

function openDaySheet(dateStr) {
  const overlay = document.getElementById('day-sheet-overlay');
  const date = new Date(dateStr + 'T00:00:00');
  document.getElementById('day-sheet-title').textContent =
    date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const doses = dayData(dateStr);
  const sub = document.getElementById('day-sheet-sub');
  const list = document.getElementById('day-sheet-list');

  if (doses.length === 0) {
    sub.textContent = 'No medicines scheduled.';
    list.innerHTML = '';
  } else {
    const takenCount = doses.filter((x) => x.taken).length;
    sub.textContent = `${takenCount} of ${doses.length} doses logged`;
    list.innerHTML = doses
      .map(
        (x) => `
      <div class="dose-row">
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="legend-dot" style="background:${x.med.color}"></span>${escapeHtml(x.med.name)} · ${formatTime(x.time)}
        </span>
        <span class="dose-status ${x.taken ? 'taken' : 'missed'}" style="${x.taken ? `background:${x.med.color}` : ''}">
          ${x.taken ? 'TAKEN' : 'MISSED'}
        </span>
      </div>`
      )
      .join('');
  }

  overlay.classList.add('active');
}

// --- Add Medicine sheet ---

let selectedColor = COLORS[0].hex;

function openAddSheet() {
  document.getElementById('input-name').value = '';
  document.getElementById('input-dose').value = '';
  document.getElementById('form-error').classList.add('hidden');
  selectedColor = COLORS[0].hex;

  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = COLORS.map(
    (c, i) => `<button type="button" class="swatch ${i === 0 ? 'selected' : ''}" data-hex="${c.hex}" style="background:${c.hex}"></button>`
  ).join('');
  swatches.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      swatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.hex;
    });
  });

  const timesList = document.getElementById('times-list');
  timesList.innerHTML = '';
  addTimeRow('08:00');

  document.getElementById('add-sheet-overlay').classList.add('active');
}

function addTimeRow(value) {
  const timesList = document.getElementById('times-list');
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = `
    <input type="time" value="${value}" />
    <button type="button" class="remove-time" aria-label="Remove time">&times;</button>
  `;
  row.querySelector('.remove-time').addEventListener('click', () => {
    if (timesList.children.length > 1) row.remove();
  });
  timesList.appendChild(row);
}

function saveNewMedicine() {
  const name = document.getElementById('input-name').value.trim();
  const dose = document.getElementById('input-dose').value.trim();
  const times = Array.from(document.querySelectorAll('#times-list input[type="time"]'))
    .map((input) => input.value)
    .filter(Boolean)
    .sort();

  const errorEl = document.getElementById('form-error');
  if (!name) {
    errorEl.textContent = 'Please enter a name.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (times.length === 0) {
    errorEl.textContent = 'Please add at least one time.';
    errorEl.classList.remove('hidden');
    return;
  }

  const medicines = getMedicines();
  medicines.push({
    id: Date.now().toString(),
    name,
    dose,
    color: selectedColor,
    times,
  });
  saveMedicines(medicines);
  document.getElementById('add-sheet-overlay').classList.remove('active');
  renderAll();
}

// --- Notifications ("in-app" reminders: fire while the app is open/foregrounded) ---

function notificationsSupported() {
  return 'Notification' in window;
}

function updateBanner() {
  const banner = document.getElementById('banner');
  const medicines = getMedicines();
  const logs = getLogs();
  const today = todayString();
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let overdueCount = 0;
  medicines.forEach((med) => {
    med.times.forEach((time, i) => {
      if (time <= nowHHMM && !logs[logKey(med.id, i, today)]) overdueCount++;
    });
  });

  if (overdueCount > 0) {
    banner.innerHTML = `⏰ ${overdueCount} dose${overdueCount > 1 ? 's' : ''} due — <u>go to Schedule</u>`;
    banner.classList.remove('hidden');
    banner.onclick = () => switchTab('schedule');
    return;
  }

  if (notificationsSupported() && Notification.permission === 'default' && !localStorage.getItem(NOTIF_DISMISSED_KEY)) {
    banner.innerHTML = `🔔 Enable reminders for dose times? &nbsp;<u>Enable</u> &nbsp;·&nbsp; <span id="banner-dismiss">Dismiss</span>`;
    banner.classList.remove('hidden');
    banner.onclick = null;
    banner.querySelector('#banner-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem(NOTIF_DISMISSED_KEY, '1');
      updateBanner();
    });
    banner.addEventListener('click', function enableHandler(e) {
      if (e.target.id === 'banner-dismiss') return;
      Notification.requestPermission().then(() => updateBanner());
    });
    return;
  }

  banner.classList.add('hidden');
}

function checkDueNotifications() {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const medicines = getMedicines();
  const logs = getLogs();
  const notified = getNotified();
  const today = todayString();
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  medicines.forEach((med) => {
    med.times.forEach((time, i) => {
      const key = logKey(med.id, i, today);
      const notifyKey = `${key}:notified`;
      if (time <= nowHHMM && !logs[key] && !notified.includes(notifyKey)) {
        new Notification('Time for your medicine', {
          body: `${med.name}${med.dose ? ' · ' + med.dose : ''} — ${formatTime(time)}`,
        });
        markNotified(notifyKey);
      }
    });
  });
}

// --- Tabs ---

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderHome();
  renderSchedule();
  renderCalendar();
  updateBanner();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('add-medicine-btn').addEventListener('click', openAddSheet);
  document.getElementById('cancel-add-btn').addEventListener('click', () => {
    document.getElementById('add-sheet-overlay').classList.remove('active');
  });
  document.getElementById('add-sheet-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'add-sheet-overlay') e.currentTarget.classList.remove('active');
  });
  document.getElementById('day-sheet-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'day-sheet-overlay') e.currentTarget.classList.remove('active');
  });
  document.getElementById('add-time-btn').addEventListener('click', () => addTimeRow('08:00'));
  document.getElementById('save-medicine-btn').addEventListener('click', saveNewMedicine);

  renderAll();
  checkDueNotifications();
  setInterval(() => {
    updateBanner();
    checkDueNotifications();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderAll();
      checkDueNotifications();
    }
  });
});
