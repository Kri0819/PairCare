
// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "peiYike_v3";

// Meal period definitions – order matters (used for sorting)
const PERIODS = [
  { id: "breakfast_before", label: "早餐前",  defaultTime: "07:30", icon: "🌅" },
  { id: "breakfast_after",  label: "早餐後",  defaultTime: "08:00", icon: "🍳" },
  { id: "lunch_before",     label: "午餐前",  defaultTime: "11:30", icon: "☀️"  },
  { id: "lunch_after",      label: "午餐後",  defaultTime: "12:30", icon: "🥗"  },
  { id: "dinner_before",    label: "晚餐前",  defaultTime: "17:30", icon: "🌇" },
  { id: "dinner_after",     label: "晚餐後",  defaultTime: "18:30", icon: "🍜"  },
  { id: "bedtime",          label: "睡前",    defaultTime: "22:00", icon: "🌙"  },
  { id: "custom",           label: "自訂時間", defaultTime: "09:00", icon: "⏰"  },
];
const PERIOD_MAP = Object.fromEntries(PERIODS.map(p => [p.id, p]));

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.scheduleLog) s.scheduleLog = {};
      if (!s.settings)    s.settings    = { dayResetHour: 4, reminderTimes: [] };
      return s;
    }
    // Migrate v1/v2
    for (const k of ["peiYike_v2", "peiYike_v1"]) {
      const old = localStorage.getItem(k);
      if (old) return migrateOld(JSON.parse(old));
    }
  } catch {}
  return null;
}

function migrateOld(old) {
  return {
    ...EMPTY_STATE,
    currentUser:   old.currentUser   || null,
    ownerPairCode: old.ownerPairCode || null,
    medications: (old.medications || []).map(m => ({
      ...m,
      schedules: m.schedules || [{ periodId: "breakfast_after", customTime: null, dose: m.dosePerTime || 1 }],
    })),
    doseLogs:     old.doseLogs     || [],
    scheduleLog:  old.scheduleLog  || {},
    doctorVisits: old.doctorVisits || [],
    settings: { dayResetHour: old.settings?.dayResetHour || 4, reminderTimes: [] },
  };
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function getLogicalDate(dayResetHour = 4) {
  const now = new Date();
  if (now.getHours() < dayResetHour) {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function nowHHMM() { return new Date().toTimeString().slice(0, 5); }

function periodTime(sched) {
  if (sched.periodId === "custom" && sched.customTime) return sched.customTime;
  return PERIOD_MAP[sched.periodId]?.defaultTime || "08:00";
}

function toMins(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function doseKey(dateStr, medId, periodId) { return `${dateStr}|${medId}|${periodId}`; }

function estimateFinishDate(remaining, dailyDose) {
  if (!dailyDose || dailyDose <= 0 || remaining <= 0) return null;
  const days = Math.floor(remaining / dailyDose);
  const d = new Date(); d.setDate(d.getDate() + days);
  return { days, date: d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" }) };
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function requestNotif() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied")  return false;
  return (await Notification.requestPermission()) === "granted";
}

function notify(title, body) {
  if (Notification?.permission !== "granted") return;
  try { new Notification(title, { body, tag: "peiYike", icon: "/icon-192.png" }); } catch {}
}

// ─── State shape ──────────────────────────────────────────────────────────────
const EMPTY_STATE = {
  currentUser:   null,
  ownerPairCode: null,
  medications:   [],   // { id, name, status, totalCount, remainingCount, createdAt, schedules[] }
  scheduleLog:   {},   // { [doseKey]: { takenAt, skipped } }
  doseLogs:      [],   // legacy
  doctorVisits:  [],
  settings:      { dayResetHour: 4, reminderTimes: [] },
};
// Medication.schedules[]: { periodId, customTime?, dose }

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --cream:       #F5F0E8;
  --warm:        #EDE6D6;
  --paper:       #FAF7F2;
  --ink:         #231C10;
  --ink-light:   #5C4F3A;
  --ink-muted:   #998870;
  --rose:        #C4785A;
  --rose-dark:   #A8623F;
  --rose-light:  #E8C4B2;
  --rose-pale:   #F5E6DE;
  --sage:        #6A9478;
  --sage-dark:   #557A62;
  --sage-light:  #B8D5C4;
  --sage-pale:   #E8F3EC;
  --amber:       #C8922A;
  --amber-pale:  #F5E8CC;
  --border:      rgba(35,28,16,0.13);
  --shadow-sm:   0 1px 4px rgba(35,28,16,0.07);
  --shadow:      0 3px 16px rgba(35,28,16,0.10);
  --radius:      16px;
  --radius-sm:   10px;
}

html, body { height: 100%; background: var(--cream); }

body {
  font-family: 'Noto Serif TC', serif;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 430px;
  margin: 0 auto;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  box-shadow: 0 0 60px rgba(35,28,16,0.12);
}

/* ── Onboarding ── */
.onboard {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 48px 28px; gap: 32px;
  background: linear-gradient(160deg, var(--paper) 55%, var(--rose-pale));
}
.onboard-logo h1 {
  font-size: 2.8rem; font-weight: 500; letter-spacing: 0.1em;
  text-align: center; color: var(--ink); line-height: 1.15;
}
.onboard-logo p {
  font-size: 0.72rem; color: var(--ink-muted); letter-spacing: 0.25em;
  font-family: 'DM Mono', monospace; text-align: center; margin-top: 6px;
}
.onboard-card {
  width: 100%; background: white; border-radius: var(--radius);
  padding: 28px 24px; border: 1px solid var(--border); box-shadow: var(--shadow);
}
.onboard-card h2 { font-size: 1rem; font-weight: 500; margin-bottom: 20px; letter-spacing: 0.04em; }

/* ── Form elements ── */
input[type="text"], input[type="number"], input[type="time"],
input[type="date"], textarea, select {
  width: 100%; padding: 11px 14px;
  border: 1.5px solid var(--border); border-radius: var(--radius-sm);
  font-family: 'Noto Serif TC', serif; font-size: 0.92rem;
  color: var(--ink); background: var(--cream);
  outline: none; transition: border-color 0.18s, background 0.18s;
  margin-top: 5px; display: block;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--rose); background: white;
}
label {
  font-size: 0.78rem; font-weight: 500;
  color: var(--ink-light); letter-spacing: 0.06em; display: block;
}
.field { margin-bottom: 16px; }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; padding: 13px 20px; border-radius: var(--radius-sm);
  font-family: 'Noto Serif TC', serif; font-size: 0.92rem; font-weight: 500;
  cursor: pointer; border: none; transition: all 0.18s;
  letter-spacing: 0.04em; white-space: nowrap;
}
.btn-primary { background: var(--rose); color: white; width: 100%; }
.btn-primary:active { background: var(--rose-dark); transform: scale(0.99); }
.btn-secondary { background: var(--cream); color: var(--ink); border: 1.5px solid var(--border); width: 100%; margin-top: 10px; }
.btn-secondary:active { background: var(--warm); }
.btn-ghost { background: transparent; color: var(--ink-light); padding: 9px 14px; font-size: 0.82rem; }
.btn-ghost:active { color: var(--rose); }
.btn-danger { background: #FEF2F2; color: #B91C1C; border: 1.5px solid #FECACA; font-size: 0.85rem; }
.btn-sm { padding: 8px 14px; font-size: 0.82rem; }
.btn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px; border-radius: var(--radius-sm);
  background: var(--cream); border: 1.5px solid var(--border);
  color: var(--ink-light); cursor: pointer; transition: all 0.15s; line-height: 1;
}
.btn-icon:active { background: var(--warm); color: var(--ink); }
.btn-icon svg { width: 20px; height: 20px; }

/* ── Nav ── */
.nav {
  display: flex; background: white; border-top: 1.5px solid var(--border);
  padding: 6px 0 env(safe-area-inset-bottom, 6px);
  position: sticky; bottom: 0; z-index: 20;
}
.nav-item {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 3px; padding: 9px 4px; cursor: pointer; border: none;
  background: transparent; color: var(--ink-muted); transition: color 0.15s;
  font-family: 'Noto Serif TC', serif;
}
.nav-item.active { color: var(--rose); }
.nav-item svg { width: 22px; height: 22px; }
.nav-item span { font-size: 0.67rem; font-weight: 500; letter-spacing: 0.04em; }

/* ── Header ── */
.header {
  padding: 18px 18px 12px; background: white;
  border-bottom: 1.5px solid var(--border);
  position: sticky; top: 0; z-index: 10;
}
.header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.header h2 { font-size: 1.15rem; font-weight: 600; letter-spacing: 0.06em; }
.date-chip {
  font-family: 'DM Mono', monospace; font-size: 0.7rem;
  color: var(--ink-muted); background: var(--cream);
  padding: 4px 10px; border-radius: 20px; flex-shrink: 0;
}
.header-icons { display: flex; gap: 6px; }

/* ── Main ── */
.main { flex: 1; overflow-y: auto; padding: 18px; padding-bottom: 90px; }

/* ── Today Summary ── */
.today-hero {
  background: linear-gradient(135deg, var(--rose-pale) 0%, var(--cream) 100%);
  border-radius: var(--radius); padding: 20px;
  border: 1.5px solid var(--rose-light); margin-bottom: 20px;
  display: flex; align-items: center; gap: 18px;
}
.hero-progress { flex-shrink: 0; position: relative; width: 68px; height: 68px; }
.hero-progress svg { width: 68px; height: 68px; transform: rotate(-90deg); }
.hero-progress .track { fill: none; stroke: var(--rose-light); stroke-width: 5; }
.hero-progress .fill  { fill: none; stroke: var(--rose); stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
.hero-center {
  position: absolute; inset: 0; display: flex;
  flex-direction: column; align-items: center; justify-content: center;
}
.hero-center .num { font-family: 'DM Mono', monospace; font-size: 1.15rem; font-weight: 500; color: var(--rose); line-height: 1; }
.hero-center .den { font-size: 0.62rem; color: var(--ink-muted); }
.hero-text h3 { font-size: 1rem; font-weight: 600; color: var(--ink); }
.hero-text p  { font-size: 0.8rem; color: var(--ink-light); margin-top: 3px; line-height: 1.5; }

/* ── Period group ── */
.period-group { margin-bottom: 18px; }
.period-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.82rem; font-weight: 600; color: var(--ink-light);
  letter-spacing: 0.08em; margin-bottom: 10px;
}
.period-title .period-icon { font-size: 1rem; }
.period-title .period-time {
  font-family: 'DM Mono', monospace; font-size: 0.7rem;
  color: var(--ink-muted); font-weight: 400; margin-left: auto;
}

.period-card {
  background: white; border-radius: var(--radius);
  border: 1.5px solid var(--border); overflow: hidden;
  box-shadow: var(--shadow-sm); transition: border-color 0.2s;
}
.period-card.is-now    { border-color: var(--rose-light); box-shadow: 0 0 0 3px var(--rose-pale), var(--shadow-sm); }
.period-card.is-done   { border-color: var(--sage-light); }
.period-card.is-late   { border-color: var(--amber); }

.period-meds { padding: 14px 16px 10px; }
.period-med-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0;
}
.period-med-row + .period-med-row { border-top: 1px solid var(--border); }
.period-med-name { font-size: 0.92rem; font-weight: 500; color: var(--ink); }
.period-med-dose { font-family: 'DM Mono', monospace; font-size: 0.78rem; color: var(--ink-muted); }
.period-med-check { font-size: 1rem; }

.period-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; background: var(--cream);
  border-top: 1px solid var(--border);
}
.period-footer.done  { background: var(--sage-pale); }
.period-footer.late  { background: var(--amber-pale); }

.period-footer-label { font-size: 0.8rem; color: var(--ink-muted); }
.period-footer.done .period-footer-label { color: var(--sage-dark); font-weight: 500; }
.period-footer.late .period-footer-label { color: var(--amber); }

.btn-take-period {
  padding: 8px 18px; border-radius: 8px;
  background: var(--rose); color: white; border: none;
  font-family: 'Noto Serif TC', serif; font-size: 0.85rem; font-weight: 500;
  cursor: pointer; transition: background 0.15s;
}
.btn-take-period:active { background: var(--rose-dark); }
.btn-undo {
  padding: 5px 12px; border-radius: 6px;
  background: transparent; color: var(--ink-muted);
  border: 1px solid var(--border);
  font-family: 'Noto Serif TC', serif; font-size: 0.75rem;
  cursor: pointer;
}

/* ── Inventory card ── */
.inventory-card { background: white; border-radius: var(--radius); border: 1.5px solid var(--border); margin-bottom: 16px; overflow: hidden; box-shadow: var(--shadow-sm); }
.inventory-card .card-header { padding: 13px 16px 10px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.inventory-card .card-header h4 { font-size: 0.82rem; font-weight: 600; color: var(--ink-light); letter-spacing: 0.08em; }
.inventory-card .card-body { padding: 4px 0; }

.inv-row {
  display: flex; align-items: center; padding: 12px 16px;
  border-bottom: 1px solid var(--border); gap: 12px;
}
.inv-row:last-child { border-bottom: none; }
.inv-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sage); flex-shrink: 0; }
.inv-dot.low { background: var(--rose); }
.inv-info { flex: 1; }
.inv-name { font-size: 0.92rem; font-weight: 500; }
.inv-sub  { font-size: 0.72rem; color: var(--ink-muted); font-family: 'DM Mono', monospace; margin-top: 2px; }
.inv-finish { text-align: right; }
.inv-days { font-family: 'DM Mono', monospace; font-size: 0.82rem; color: var(--rose); font-weight: 500; }
.inv-date { font-size: 0.68rem; color: var(--ink-muted); margin-top: 2px; }

/* ── Medication list ── */
.med-card {
  background: white; border-radius: var(--radius);
  border: 1.5px solid var(--border); padding: 18px;
  margin-bottom: 14px; position: relative; overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.med-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 4px; border-radius: 4px 0 0 4px; background: var(--rose-light);
}
.med-card.active::before { background: var(--sage); }
.med-card.paused::before { background: var(--ink-muted); }

.med-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
.med-card-name { font-size: 1rem; font-weight: 600; color: var(--ink); }
.status-tag {
  font-size: 0.65rem; font-family: 'DM Mono', monospace;
  padding: 3px 9px; border-radius: 20px; letter-spacing: 0.06em; flex-shrink: 0; margin-left: 8px; font-weight: 500;
}
.tag-active { background: var(--sage-pale); color: var(--sage-dark); }
.tag-paused { background: var(--cream); color: var(--ink-muted); }

.med-period-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
.med-period-tag {
  font-size: 0.72rem; background: var(--cream); border: 1.5px solid var(--border);
  border-radius: 6px; padding: 3px 9px; color: var(--ink-light); font-weight: 500;
}

.med-stats { display: flex; gap: 20px; }
.med-stat .val { font-family: 'DM Mono', monospace; font-size: 1.3rem; color: var(--rose); line-height: 1; font-weight: 500; }
.med-stat .lbl { font-size: 0.65rem; color: var(--ink-muted); margin-top: 2px; letter-spacing: 0.04em; }

.progress-wrap { margin-top: 12px; background: var(--cream); border-radius: 4px; height: 5px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--rose); border-radius: 4px; transition: width 0.4s; }

.estimate-row {
  margin-top: 10px; display: flex; align-items: center; gap: 6px;
  font-size: 0.78rem; color: var(--ink-light);
}
.estimate-row .days { font-family: 'DM Mono', monospace; color: var(--rose); font-weight: 500; }

.med-footer { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }

/* ── Visit timeline ── */
.timeline { position: relative; padding-left: 22px; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 1.5px; background: var(--border); }
.visit-item { position: relative; margin-bottom: 22px; }
.visit-item::before {
  content: ''; position: absolute; left: -19px; top: 8px;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--rose); border: 2px solid var(--paper); box-shadow: 0 0 0 2px var(--rose-light);
}
.visit-card { background: white; border-radius: var(--radius); border: 1.5px solid var(--border); overflow: hidden; box-shadow: var(--shadow-sm); }
.visit-date-bar { background: var(--rose-pale); padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; }
.visit-date { font-family: 'DM Mono', monospace; font-size: 0.8rem; color: var(--rose); font-weight: 500; letter-spacing: 0.06em; }
.visit-hospital { font-size: 0.75rem; color: var(--ink-muted); }
.visit-body { padding: 14px 16px; }
.visit-note { font-size: 0.85rem; color: var(--ink-light); margin-bottom: 12px; line-height: 1.6; font-style: italic; }
.change-list { display: flex; flex-direction: column; gap: 6px; }
.change-chip { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 500; }
.chip-continue { background: var(--sage-pale); color: var(--sage-dark); }
.chip-stop     { background: var(--cream); color: var(--ink-muted); }
.chip-new      { background: var(--amber-pale); color: var(--amber); }
.chip-label { font-family: 'DM Mono', monospace; font-size: 0.65rem; padding: 2px 7px; border-radius: 4px; background: rgba(0,0,0,0.07); }

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(35,28,16,0.45);
  z-index: 100; display: flex; align-items: flex-end;
  backdrop-filter: blur(3px);
}
.modal {
  background: var(--paper); border-radius: 22px 22px 0 0;
  width: 100%; max-width: 430px; margin: 0 auto;
  padding: 24px 24px 44px; max-height: 90svh; overflow-y: auto;
  animation: slideUp 0.26s cubic-bezier(.32,.72,0,1);
}
@keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.modal-handle { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 22px; }
.modal h3 { font-size: 1.05rem; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 20px; }

/* ── Misc ── */
.toast {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: white; padding: 11px 22px; border-radius: 22px;
  font-size: 0.85rem; font-weight: 500; z-index: 200;
  animation: toastIn 0.2s ease; white-space: nowrap; box-shadow: var(--shadow);
}
@keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.viewer-banner { background: var(--amber-pale); border-bottom: 1.5px solid #DFC070; padding: 9px 18px; font-size: 0.75rem; color: var(--amber); letter-spacing: 0.07em; text-align: center; font-family: 'DM Mono', monospace; font-weight: 500; }
.notif-banner { background: var(--sage-pale); border-bottom: 1.5px solid var(--sage-light); padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.8rem; font-weight: 500; color: var(--sage-dark); }
.notif-banner button { background: var(--sage); color: white; border: none; border-radius: 7px; padding: 6px 14px; font-size: 0.78rem; font-weight: 500; cursor: pointer; font-family: 'Noto Serif TC', serif; }

.section-title { font-size: 0.72rem; font-weight: 600; color: var(--ink-muted); letter-spacing: 0.14em; text-transform: uppercase; margin: 22px 0 10px; font-family: 'DM Mono', monospace; }
.section-tip { font-size: 0.78rem; color: var(--ink-muted); margin-bottom: 16px; line-height: 1.55; }

.empty-state { text-align: center; padding: 48px 20px; color: var(--ink-muted); }
.empty-state .icon { font-size: 2.8rem; margin-bottom: 14px; }
.empty-state p { font-size: 0.9rem; }

.fab {
  position: fixed; bottom: 82px; right: 18px; width: 54px; height: 54px;
  border-radius: 50%; background: var(--rose); color: white; border: none;
  font-size: 1.5rem; cursor: pointer; box-shadow: 0 4px 18px rgba(196,120,90,0.45);
  display: flex; align-items: center; justify-content: center; transition: all 0.18s; z-index: 50;
}
.fab:active { background: var(--rose-dark); transform: scale(0.95); }

.divider { border: none; border-top: 1.5px solid var(--border); margin: 16px 0; }

.pair-code-display { background: var(--cream); border-radius: 12px; padding: 18px; text-align: center; margin: 16px 0; border: 1.5px dashed var(--rose-light); }
.pair-code-display .code { font-family: 'DM Mono', monospace; font-size: 2.8rem; color: var(--rose); letter-spacing: 0.3em; font-weight: 500; }
.pair-code-display small { display: block; font-size: 0.72rem; color: var(--ink-muted); margin-top: 5px; }

.pair-info { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--sage-pale); border-radius: var(--radius-sm); border: 1.5px solid var(--sage-light); margin-bottom: 14px; font-size: 0.83rem; color: var(--sage-dark); font-weight: 500; }

/* Visit add – checkbox style */
.med-checkbox-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 0; border-bottom: 1.5px solid var(--border); cursor: pointer;
}
.med-checkbox-row:last-child { border-bottom: none; }
.med-checkbox-label { font-size: 0.92rem; font-weight: 500; color: var(--ink); }
.med-checkbox-sub { font-size: 0.72rem; color: var(--ink-muted); margin-top: 2px; font-family: 'DM Mono', monospace; }
.cb-box {
  width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  background: var(--cream); flex-shrink: 0; transition: all 0.15s;
}
.cb-box.checked { background: var(--sage); border-color: var(--sage); }
.cb-check { color: white; font-size: 0.85rem; font-weight: 700; }

/* Period selector */
.period-selector { display: flex; flex-direction: column; gap: 6px; }
.period-option {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; border: 1.5px solid var(--border);
  cursor: pointer; background: var(--cream); transition: all 0.15s;
  user-select: none;
}
.period-option.selected { background: var(--rose-pale); border-color: var(--rose-light); }
.period-option-icon { font-size: 1rem; }
.period-option-label { font-size: 0.88rem; font-weight: 500; flex: 1; }
.period-option-time { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--ink-muted); }
.period-dose-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 0 14px 10px; }
.period-dose-row input { width: 72px; margin-top: 0; }
.period-dose-row input[type="time"] { flex: 1; width: auto; }

/* Settings */
.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1.5px solid var(--border); }
.settings-row:last-child { border-bottom: none; }
.settings-label { font-size: 0.92rem; font-weight: 500; }
.settings-sub { font-size: 0.75rem; color: var(--ink-muted); margin-top: 2px; }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = {
  today:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="15" r="1.8" fill="currentColor" stroke="none"/></svg>,
  meds:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>,
  visits:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"><path d="M5 13l4 4L19 7"/></svg>,
  x:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  user:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  bell:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
};

// ─── App ──────────────────────────────────────────────────────────────────────
window.App = function App() {
  const [state, setState] = useState(() => loadState() || EMPTY_STATE);
  const [tab,   setTab]   = useState("today");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [notifOk, setNotifOk] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [now, setNow] = useState(() => new Date());
  const firedRef = useRef({});

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  // ── Reminder engine ──
  useEffect(() => {
    if (!notifOk) return;
    const check = () => {
      const date = getLogicalDate(state.settings?.dayResetHour ?? 4);
      const nowM = now.getHours() * 60 + now.getMinutes();
      state.medications.filter(m => m.status === "active").forEach(med => {
        (med.schedules || []).forEach(sched => {
          const key  = doseKey(date, med.id, sched.periodId);
          const log  = state.scheduleLog[key];
          if (log) return;
          const t    = toMins(periodTime(sched));
          const diff = nowM - t;
          if (diff >= 0 && diff < 2 && !firedRef.current[key+"_due"]) {
            firedRef.current[key+"_due"] = true;
            notify("陪一刻｜服藥提醒", `現在是${PERIOD_MAP[sched.periodId]?.label}用藥時間，記得吃 ${med.name}`);
          }
          if (diff >= 90 && !firedRef.current[key+"_late"]) {
            firedRef.current[key+"_late"] = true;
            notify("陪一刻｜還沒吃藥", `${med.name} ${PERIOD_MAP[sched.periodId]?.label}的劑量超過 90 分鐘未記錄`);
          }
        });
      });
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [notifOk, state.medications, state.scheduleLog, state.settings, now]);

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 2400);
  }, []);

  const update = useCallback((fn) => {
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev)); fn(next); return next;
    });
  }, []);

  const isViewer = state.currentUser?.role === "viewer";
  const dayResetHour = state.settings?.dayResetHour ?? 4;
  const logicalDate = getLogicalDate(dayResetHour);
  const activeMeds = state.medications.filter(m => m.status === "active");

  if (!state.currentUser) return <OnboardScreen update={update} />;

  async function askNotif() {
    const ok = await requestNotif();
    setNotifOk(ok);
    showToast(ok ? "✓ 提醒已開啟" : "瀏覽器拒絕了通知權限");
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      {toast && <div className="toast">{toast}</div>}
      {isViewer && <div className="viewer-banner">👀 檢視模式 — 你只能閱讀，無法修改</div>}
      {"Notification" in window && !notifOk && !isViewer && Notification.permission !== "denied" && (
        <div className="notif-banner">
          <span>{Ico.bell} 開啟提醒，到時間自動通知</span>
          <button onClick={askNotif}>開啟</button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "today"  && <TodayPage  state={state} update={update} isViewer={isViewer} showToast={showToast} setModal={setModal} logicalDate={logicalDate} now={now} />}
        {tab === "meds"   && <MedsPage   state={state} update={update} isViewer={isViewer} showToast={showToast} setModal={setModal} logicalDate={logicalDate} />}
        {tab === "visits" && <VisitsPage state={state} update={update} isViewer={isViewer} showToast={showToast} setModal={setModal} />}
      </div>

      <nav className="nav">
        {[{id:"today",label:"今日一刻",icon:Ico.today},{id:"meds",label:"藥物清單",icon:Ico.meds},{id:"visits",label:"看診紀錄",icon:Ico.visits}].map(item=>(
          <button key={item.id} className={`nav-item ${tab===item.id?"active":""}`} onClick={()=>setTab(item.id)}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>

      {modal === "addMed" && !isViewer && (
        <AddMedModal onClose={()=>setModal(null)} onSave={med=>{
          update(s=>{ s.medications.push({...med,id:uid(),status:"active",remainingCount:med.totalCount,createdAt:new Date().toISOString()}); });
          showToast("✓ 已新增藥物"); setModal(null);
        }}/>
      )}
      {modal === "addVisit" && !isViewer && (
        <AddVisitModal medications={activeMeds} allMeds={state.medications} onClose={()=>setModal(null)}
          onSave={visit=>{
            update(s=>{
              s.doctorVisits.unshift({...visit,id:uid()});
              // Mark all active meds as paused unless in continuedIds or newIds
              const continued = new Set(visit.continuedIds);
              const newIds    = new Set();
              // Add new meds
              (visit.newMeds||[]).forEach(nm=>{
                const id = uid();
                newIds.add(id);
                s.medications.push({id, name:nm.name, schedules:nm.schedules, totalCount:nm.totalCount, remainingCount:nm.totalCount, status:"active", createdAt:visit.date});
              });
              // Stop unchecked active meds
              s.medications.forEach(m=>{
                if(m.status==="active" && !continued.has(m.id) && !newIds.has(m.id)) m.status="paused";
              });
            });
            showToast("✓ 看診紀錄已儲存"); setModal(null);
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal state={state} update={update} onClose={()=>setModal(null)} showToast={showToast} notifOk={notifOk} askNotif={askNotif} />
      )}
      {modal === "profile" && (
        <ProfileModal state={state} update={update} onClose={()=>setModal(null)} showToast={showToast} />
      )}
    </div>
  );
}

// ─── Today page ───────────────────────────────────────────────────────────────
function TodayPage({ state, update, isViewer, showToast, setModal, logicalDate, now }) {
  const activeMeds = state.medications.filter(m => m.status === "active");
  const dayResetHour = state.settings?.dayResetHour ?? 4;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Build period groups: { periodId, label, icon, time, meds[] }
  const periodGroupMap = {};
  activeMeds.forEach(med => {
    (med.schedules || []).forEach(sched => {
      const pid = sched.periodId;
      if (!periodGroupMap[pid]) {
        periodGroupMap[pid] = {
          periodId: pid,
          label:    PERIOD_MAP[pid]?.label || pid,
          icon:     PERIOD_MAP[pid]?.icon  || "⏰",
          time:     periodTime(sched),
          meds:     [],
        };
      }
      periodGroupMap[pid].meds.push({ med, sched, key: doseKey(logicalDate, med.id, pid) });
    });
  });

  const groups = Object.values(periodGroupMap).sort((a, b) => toMins(a.time) - toMins(b.time));
  const totalGroups = groups.length;
  const doneGroups  = groups.filter(g => g.meds.every(({ key }) => !!state.scheduleLog[key]?.takenAt)).length;
  const pct = totalGroups > 0 ? Math.round((doneGroups / totalGroups) * 100) : 0;

  const CIRC = 2 * Math.PI * 26; // r=26

  function markPeriodTaken(group) {
    if (isViewer) return;
    const takenAt = nowHHMM();
    update(s => {
      group.meds.forEach(({ key, sched, med }) => {
        s.scheduleLog[key] = { takenAt };
        const m = s.medications.find(m => m.id === med.id);
        if (m) m.remainingCount = Math.max(0, (m.remainingCount || 0) - sched.dose);
      });
    });
    showToast(`✓ ${group.label} 已完成`);
  }

  function undoPeriod(group) {
    if (isViewer) return;
    update(s => {
      group.meds.forEach(({ key, sched, med }) => {
        if (s.scheduleLog[key]?.takenAt) {
          const m = s.medications.find(m => m.id === med.id);
          if (m) m.remainingCount = Math.min(m.totalCount, (m.remainingCount || 0) + sched.dose);
        }
        delete s.scheduleLog[key];
      });
    });
    showToast("已撤銷");
  }

  return (
    <>
      <div className="header">
        <div className="header-row">
          <h2>今日一刻</h2>
          <div className="header-icons">
            <span className="date-chip">{logicalDate}</span>
            <button className="btn-icon" onClick={()=>setModal("settings")}>{Ico.settings}</button>
            <button className="btn-icon" onClick={()=>setModal("profile")}>{Ico.user}</button>
          </div>
        </div>
      </div>
      <div className="main">
        {/* Hero progress ring */}
        {totalGroups > 0 && (
          <div className="today-hero">
            <div className="hero-progress">
              <svg>
                <circle className="track" cx="34" cy="34" r="26"/>
                <circle className="fill"  cx="34" cy="34" r="26"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC - (CIRC * pct / 100)}
                />
              </svg>
              <div className="hero-center">
                <div className="num">{doneGroups}</div>
                <div className="den">/ {totalGroups}</div>
              </div>
            </div>
            <div className="hero-text">
              <h3>
                {pct === 100 ? "今天全部完成 🌿"
                  : doneGroups === 0 ? "今天還沒有紀錄"
                  : `已完成 ${pct}%`}
              </h3>
              <p>
                {pct === 100 ? "謝謝你認真照顧自己"
                  : `還有 ${totalGroups - doneGroups} 個時段待服藥`}
              </p>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="empty-state">
            <div className="icon">✨</div>
            <p>還沒有設定藥物時程</p>
            {!isViewer && (
              <button className="btn btn-primary" style={{marginTop:16,display:"inline-flex"}} onClick={()=>setModal("addMed")}>新增藥物</button>
            )}
          </div>
        ) : (
          groups.map(group => {
            const allDone  = group.meds.every(({key}) => !!state.scheduleLog[key]?.takenAt);
            const anyDone  = group.meds.some(({key})  => !!state.scheduleLog[key]?.takenAt);
            const tMins    = toMins(group.time);
            const isLate   = !allDone && nowMins - tMins > 30;
            const isNow    = !allDone && nowMins - tMins >= 0 && nowMins - tMins <= 30;

            let cardClass = "period-card";
            if (allDone) cardClass += " is-done";
            else if (isNow)  cardClass += " is-now";
            else if (isLate) cardClass += " is-late";

            const firstTakenAt = group.meds.map(({key})=>state.scheduleLog[key]?.takenAt).filter(Boolean)[0];

            return (
              <div key={group.periodId} className="period-group">
                <div className="period-title">
                  <span className="period-icon">{group.icon}</span>
                  <span>{group.label}</span>
                  <span className="period-time">{group.time}</span>
                </div>
                <div className={cardClass}>
                  <div className="period-meds">
                    {group.meds.map(({med, sched, key}) => {
                      const log = state.scheduleLog[key];
                      return (
                        <div key={key} className="period-med-row">
                          <div>
                            <div className="period-med-name">{med.name}</div>
                            <div className="period-med-dose">{sched.dose} 顆</div>
                          </div>
                          <div className="period-med-check">
                            {log?.takenAt ? "✅" : "○"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`period-footer ${allDone?"done":isLate?"late":""}`}>
                    <div className="period-footer-label">
                      {allDone ? `✓ 已服藥 ${firstTakenAt || ""}` : isLate ? `⚠ 已超過 ${nowMins - tMins} 分鐘` : isNow ? "⏰ 現在服藥時間" : ""}
                    </div>
                    {!isViewer && (
                      allDone
                        ? <button className="btn-undo" onClick={()=>undoPeriod(group)}>撤銷</button>
                        : <button className="btn-take-period" onClick={()=>markPeriodTaken(group)}>已服用</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

      </div>
    </>
  );
}

// ─── Meds page ────────────────────────────────────────────────────────────────
function MedsPage({ state, update, isViewer, showToast, setModal, logicalDate }) {
  const active = state.medications.filter(m => m.status === "active");
  const paused = state.medications.filter(m => m.status === "paused");

  function toggle(id) {
    if (isViewer) return;
    update(s => { const m=s.medications.find(m=>m.id===id); if(m) m.status=m.status==="active"?"paused":"active"; });
    showToast("狀態已更新");
  }

  return (
    <>
      <div className="header">
        <div className="header-row">
          <h2>藥物清單</h2>
          {!isViewer && <button className="btn-icon" onClick={()=>setModal("addMed")}>{Ico.plus}</button>}
        </div>
      </div>
      <div className="main">
        {state.medications.length===0 ? (
          <div className="empty-state">
            <div className="icon">✨</div>
            <p>還沒有藥物紀錄</p>
            {!isViewer && <button className="btn btn-primary" style={{marginTop:16,display:"inline-flex"}} onClick={()=>setModal("addMed")}>新增藥物</button>}
          </div>
        ) : <>
          {active.length>0 && <><div className="section-title">服用中</div>{active.map(m=><MedCard key={m.id} med={m} isViewer={isViewer} onToggle={toggle}/>)}</>}
          {paused.length>0 && <><div className="section-title">已停藥</div>{paused.map(m=><MedCard key={m.id} med={m} isViewer={isViewer} onToggle={toggle}/>)}</>}
        </>}
      </div>
      {!isViewer && <button className="fab" onClick={()=>setModal("addMed")}>＋</button>}
    </>
  );
}

function MedCard({ med, isViewer, onToggle }) {
  const pct = med.totalCount > 0 ? Math.round(med.remainingCount / med.totalCount * 100) : 0;
  const dailyDose = (med.schedules||[]).reduce((s,sc)=>s+sc.dose,0);
  const est = estimateFinishDate(med.remainingCount, dailyDose);
  const low = est && est.days < 7;

  return (
    <div className={`med-card ${med.status}`}>
      <div className="med-card-top">
        <div>
          <div className="med-card-name">{med.name}</div>
        </div>
        <span className={`status-tag ${med.status==="active"?"tag-active":"tag-paused"}`}>
          {med.status==="active"?"服用中":"已停藥"}
        </span>
      </div>

      <div className="med-period-tags">
        {(med.schedules||[]).map((sched,i) => (
          <span key={i} className="med-period-tag">
            {PERIOD_MAP[sched.periodId]?.icon} {PERIOD_MAP[sched.periodId]?.label} × {sched.dose} 顆
          </span>
        ))}
      </div>

      <div className="med-stats">
        <div className="med-stat"><div className="val">{med.remainingCount}</div><div className="lbl">剩餘顆</div></div>
        <div className="med-stat"><div className="val">{med.totalCount}</div><div className="lbl">總顆數</div></div>
        <div className="med-stat"><div className="val">{dailyDose}</div><div className="lbl">每日顆</div></div>
        <div className="med-stat"><div className="val">{pct}%</div><div className="lbl">剩餘率</div></div>
      </div>

      <div className="progress-wrap"><div className="progress-fill" style={{width:`${pct}%`, background: low?"var(--rose)":"var(--sage)"}}/></div>

      {est && (
        <div className="estimate-row">
          <span>還可以吃</span>
          <span className="days" style={{color: low?"var(--rose)":"var(--sage)"}}>{est.days} 天</span>
          <span>｜預估 {est.date} 吃完</span>
          {low && <span style={{color:"var(--rose)",fontSize:"0.72rem",marginLeft:4}}>⚠ 快要不夠了</span>}
        </div>
      )}

      {!isViewer && (
        <div className="med-footer">
          <button className="btn btn-sm btn-ghost" onClick={()=>onToggle(med.id)}>
            {med.status==="active"?"暫停此藥":"恢復服用"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Visits page ──────────────────────────────────────────────────────────────
function VisitsPage({ state, update, isViewer, showToast, setModal }) {
  const sorted = [...state.doctorVisits].sort((a,b)=>b.date.localeCompare(a.date));
  function getMedName(id) { return state.medications.find(m=>m.id===id)?.name || "—"; }

  return (
    <>
      <div className="header">
        <div className="header-row">
          <h2>看診紀錄</h2>
          {!isViewer && <button className="btn-icon" onClick={()=>setModal("addVisit")}>{Ico.plus}</button>}
        </div>
      </div>
      <div className="main">
        {sorted.length===0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>還沒有看診紀錄</p>
            {!isViewer && <button className="btn btn-primary" style={{marginTop:16,display:"inline-flex"}} onClick={()=>setModal("addVisit")}>新增看診</button>}
          </div>
        ) : (
          <div className="timeline">
            {sorted.map(visit=>(
              <div key={visit.id} className="visit-item">
                <div className="visit-card">
                  <div className="visit-date-bar">
                    <span className="visit-date">{visit.date}</span>
                    <span className="visit-hospital">{visit.hospital||visit.doctor||""}</span>
                  </div>
                  <div className="visit-body">
                    {visit.note && <p className="visit-note">「{visit.note}」</p>}
                    <div className="change-list">
                      {(visit.continuedIds||[]).map(id=>(
                        <div key={id} className="change-chip chip-continue">
                          <span className="chip-label">繼續</span>
                          <span>↗ {getMedName(id)}</span>
                        </div>
                      ))}
                      {(visit.stoppedIds||[]).map(id=>(
                        <div key={id} className="change-chip chip-stop">
                          <span className="chip-label">停藥</span>
                          <span>✕ {getMedName(id)}</span>
                        </div>
                      ))}
                      {(visit.newMeds||[]).map((nm,i)=>(
                        <div key={i} className="change-chip chip-new">
                          <span className="chip-label">新藥</span>
                          <span>✦ {nm.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {!isViewer && <button className="fab" onClick={()=>setModal("addVisit")}>＋</button>}
    </>
  );
}

// ─── Period selector component ────────────────────────────────────────────────
function PeriodSelector({ selected, onChange }) {
  // selected: [{ periodId, customTime?, dose }]
  const isSelected = (pid) => selected.some(s => s.periodId === pid);

  function toggle(pid) {
    if (isSelected(pid)) {
      onChange(selected.filter(s => s.periodId !== pid));
    } else {
      const defaultT = PERIOD_MAP[pid]?.defaultTime || "08:00";
      onChange([...selected, { periodId: pid, customTime: pid === "custom" ? defaultT : null, dose: 1 }]);
    }
  }

  function updateSched(pid, patch) {
    onChange(selected.map(s => s.periodId === pid ? { ...s, ...patch } : s));
  }

  return (
    <div className="period-selector">
      {PERIODS.map(p => {
        const sel  = isSelected(p.id);
        const sched = selected.find(s => s.periodId === p.id);
        return (
          <div key={p.id}>
            <div className={`period-option ${sel ? "selected" : ""}`} onClick={() => toggle(p.id)}>
              <span className="period-option-icon">{p.icon}</span>
              <span className="period-option-label">{p.label}</span>
              {!sel && <span className="period-option-time">{p.defaultTime}</span>}
              {sel && <span style={{color:"var(--rose)",fontSize:"0.85rem",fontWeight:700}}>✓</span>}
            </div>
            {sel && (
              <div className="period-dose-row">
                <span style={{fontSize:"0.78rem",color:"var(--ink-muted)",whiteSpace:"nowrap"}}>每次</span>
                <input type="number" min={0.5} step={0.5} value={sched.dose}
                  onChange={e => updateSched(p.id, { dose: Number(e.target.value) })}
                  style={{width:72}} />
                <span style={{fontSize:"0.78rem",color:"var(--ink-muted)"}}>顆</span>
                {p.id === "custom" && (
                  <input type="time" value={sched.customTime || p.defaultTime}
                    onChange={e => updateSched(p.id, { customTime: e.target.value })} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add Med Modal ────────────────────────────────────────────────────────────
function AddMedModal({ onClose, onSave }) {
  const [name,      setName]      = useState("");
  const [total,     setTotal]     = useState(30);
  const [schedules, setSchedules] = useState([]);

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <h3>新增藥物</h3>
        <div className="field">
          <label>藥物名稱</label>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="例：Escitalopram 10mg" autoFocus/>
        </div>
        <div className="field">
          <label>初始總顆數</label>
          <input type="number" min={1} value={total} onChange={e=>setTotal(e.target.value)}/>
        </div>
        <div className="field">
          <label style={{marginBottom:10}}>服用時段（可複選）</label>
          <PeriodSelector selected={schedules} onChange={setSchedules}/>
        </div>
        <button className="btn btn-primary" style={{marginTop:8}}
          onClick={()=>{ if(!name.trim()||schedules.length===0) return; onSave({name:name.trim(),schedules,totalCount:Number(total)}); }}>
          儲存藥物
        </button>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

// ─── Add Visit Modal ──────────────────────────────────────────────────────────
function AddVisitModal({ medications, allMeds, onClose, onSave }) {
  const todayStr = new Date().toISOString().slice(0,10);
  const [date,     setDate]     = useState(todayStr);
  const [hospital, setHospital] = useState("");
  const [doctor,   setDoctor]   = useState("");
  const [note,     setNote]     = useState("");
  // continuedIds: set of med ids the user checks as "still taking"
  const [continuedIds, setContinuedIds] = useState(new Set(medications.map(m=>m.id)));
  const [newMeds, setNewMeds] = useState([]);

  function toggleContinue(id) {
    setContinuedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function addNewMed() {
    setNewMeds(prev => [...prev, { _key: uid(), name:"", schedules:[], totalCount:30 }]);
  }

  function updateNewMed(key, patch) {
    setNewMeds(prev => prev.map(m => m._key===key ? {...m,...patch} : m));
  }

  function removeNewMed(key) {
    setNewMeds(prev => prev.filter(m => m._key!==key));
  }

  // Compute which will be stopped = active meds NOT in continuedIds
  const stoppedIds = medications.filter(m => !continuedIds.has(m.id)).map(m=>m.id);

  function save() {
    onSave({
      date, hospital, doctor, note,
      continuedIds: [...continuedIds],
      stoppedIds,
      newMeds: newMeds.filter(m=>m.name.trim()).map(({_key,...m})=>m),
    });
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <h3>新增看診紀錄</h3>
        <div className="field">
          <label>看診日期</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div className="field">
          <label>醫院（選填）</label>
          <input type="text" value={hospital} onChange={e=>setHospital(e.target.value)} placeholder="醫院名稱"/>
        </div>
        <div className="field">
          <label>醫師（選填）</label>
          <input type="text" value={doctor} onChange={e=>setDoctor(e.target.value)} placeholder="醫師姓名"/>
        </div>
        <div className="field">
          <label>備註（選填）</label>
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="這次醫師說了什麼…" style={{resize:"none"}}/>
        </div>

        <hr className="divider"/>

        {medications.length > 0 ? (
          <>
            <label style={{marginBottom:10,display:"block"}}>這次回診繼續服用哪些藥？</label>
            <p className="section-tip">勾選的 = 繼續服用。沒勾選的藥，儲存後自動停藥。</p>
            <div style={{background:"white",borderRadius:12,border:"1.5px solid var(--border)",padding:"0 16px",marginBottom:16}}>
              {medications.map(med => {
                const checked = continuedIds.has(med.id);
                const dailyDose = (med.schedules||[]).reduce((s,sc)=>s+sc.dose,0);
                return (
                  <div key={med.id} className="med-checkbox-row" onClick={()=>toggleContinue(med.id)}>
                    <div>
                      <div className="med-checkbox-label">{med.name}</div>
                      <div className="med-checkbox-sub">每日 {dailyDose} 顆 · 剩 {med.remainingCount} 顆</div>
                    </div>
                    <div className={`cb-box ${checked?"checked":""}`}>
                      {checked && <span className="cb-check">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {stoppedIds.length > 0 && (
              <p style={{fontSize:"0.75rem",color:"var(--rose)",marginBottom:16}}>
                ⚠ 以下藥物將自動停藥：{stoppedIds.map(id=>medications.find(m=>m.id===id)?.name).join("、")}
              </p>
            )}
          </>
        ) : (
          <p className="section-tip">目前沒有服用中藥物。</p>
        )}

        <hr className="divider"/>
        <label style={{marginBottom:10,display:"block"}}>這次開了新藥？</label>

        {newMeds.map(nm => (
          <div key={nm._key} style={{background:"white",border:"1.5px solid var(--border)",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontWeight:600,fontSize:"0.85rem",color:"var(--ink-light)"}}>新藥</span>
              <button className="btn-icon" onClick={()=>removeNewMed(nm._key)}>{Ico.x}</button>
            </div>
            <div className="field">
              <label>藥物名稱</label>
              <input type="text" value={nm.name} onChange={e=>updateNewMed(nm._key,{name:e.target.value})} placeholder="藥名"/>
            </div>
            <div className="field">
              <label>總顆數</label>
              <input type="number" min={1} value={nm.totalCount} onChange={e=>updateNewMed(nm._key,{totalCount:Number(e.target.value)})}/>
            </div>
            <div className="field">
              <label style={{marginBottom:8}}>服用時段</label>
              <PeriodSelector selected={nm.schedules||[]} onChange={scheds=>updateNewMed(nm._key,{schedules:scheds})}/>
            </div>
          </div>
        ))}

        <button className="btn btn-secondary" style={{marginTop:0}} onClick={addNewMed}>＋ 新增一筆新藥</button>

        <hr className="divider"/>
        <button className="btn btn-primary" onClick={save}>儲存看診紀錄</button>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({ state, update, onClose, showToast, notifOk, askNotif }) {
  const hr = state.settings?.dayResetHour ?? 4;

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <h3>設定</h3>
        <div style={{background:"white",borderRadius:16,border:"1.5px solid var(--border)",padding:"0 16px",marginBottom:16}}>
          <div className="settings-row">
            <div>
              <div className="settings-label">日切點時間</div>
              <div className="settings-sub">幾點以前算昨天（預設 4 點）</div>
            </div>
            <input type="number" min={0} max={11} value={hr} style={{width:64,marginTop:0,textAlign:"center"}}
              onChange={e=>update(s=>{s.settings.dayResetHour=Number(e.target.value);})}/>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">服藥提醒通知</div>
              <div className="settings-sub">
                {Notification?.permission==="denied" ? "已被瀏覽器封鎖，請至設定手動開啟"
                  : notifOk ? "已開啟 — 依各藥物時段自動推播" : "尚未開啟"}
              </div>
            </div>
            {notifOk
              ? <span style={{fontSize:"1.3rem"}}>✅</span>
              : Notification?.permission!=="denied" && (
                  <button className="btn btn-sm" style={{background:"var(--sage)",color:"white",border:"none"}} onClick={askNotif}>開啟</button>
                )
            }
          </div>
        </div>
        <p style={{fontSize:"0.75rem",color:"var(--ink-muted)",lineHeight:1.65,marginBottom:16}}>
          提醒時間依每個藥物的服用時段自動決定。到達時段預設時間時推播；超過 90 分鐘未記錄時再提醒一次。
        </p>
        <button className="btn btn-ghost" style={{width:"100%"}} onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ state, update, onClose, showToast }) {
  const u = state.currentUser;

  function logout() { update(s=>{s.currentUser=null;}); onClose(); }
  function resetAll() {
    if(!window.confirm("⚠️ 確定清除所有資料？此操作無法還原。")) return;
    [STORAGE_KEY,"peiYike_v2","peiYike_v1"].forEach(k=>localStorage.removeItem(k));
    window.location.reload();
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <h3>帳號</h3>
        <div className="pair-info">
          <span>👤</span>
          <span>{u.name} · {u.role==="user"?"用藥者":"陪伴者（檢視）"}</span>
        </div>
        {u.role==="user" && (
          <div className="pair-code-display">
            <div className="code">{u.pairCode}</div>
            <small>把這組邀請碼分享給你的陪伴者</small>
          </div>
        )}
        <hr className="divider"/>
        <p style={{fontSize:"0.78rem",color:"var(--ink-muted)",marginBottom:16,lineHeight:1.7}}>
          {state.medications.length} 種藥物 · {Object.keys(state.scheduleLog||{}).length} 筆服藥紀錄 · {state.doctorVisits.length} 筆看診紀錄
        </p>
        <button className="btn btn-secondary" style={{marginBottom:8,marginTop:0}} onClick={logout}>登出帳號（保留所有資料）</button>
        <div style={{background:"var(--amber-pale)",border:"1.5px solid #DFC070",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:"0.75rem",color:"var(--amber)",lineHeight:1.6}}>
          ⚠ 登出 ≠ 清除資料。登出只是換人登入，所有紀錄仍然保留。
        </div>
        {u.role==="user" && <button className="btn btn-danger btn-sm" onClick={resetAll}>清除所有資料（無法還原）</button>}
        <button className="btn btn-ghost" style={{marginTop:10,width:"100%"}} onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardScreen({ update }) {
  const [step, setStep] = useState("choose");
  const [name, setName] = useState("");
  const [pairCode] = useState(()=>String(Math.floor(Math.random()*10000)).padStart(4,"0"));
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  function createUser() {
    if(!name.trim()) return;
    update(s=>{ s.currentUser={id:uid(),name:name.trim(),role:"user",pairCode}; s.ownerPairCode=pairCode; });
  }

  function joinAsViewer() {
    if(!name.trim()) return;
    if(joinCode.length!==4){ setJoinError("請輸入完整四位數邀請碼"); return; }
    const existing = loadState();
    if(existing?.ownerPairCode && joinCode!==existing.ownerPairCode){ setJoinError("邀請碼不正確，請再確認"); return; }
    update(s=>{ s.currentUser={id:uid(),name:name.trim(),role:"viewer",pairCode:joinCode}; });
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      <div className="onboard">
        <div className="onboard-logo">
          <h1>陪一刻</h1>
          <p>SHARED MEDICATION LOG</p>
        </div>

        {step==="choose" && (
          <div className="onboard-card">
            <h2>歡迎 — 請選擇你的身份</h2>
            <button className="btn btn-primary" onClick={()=>setStep("createUser")}>我是用藥者（本人）</button>
            <button className="btn btn-secondary" onClick={()=>setStep("joinViewer")}>我是陪伴者（需要邀請碼）</button>
          </div>
        )}

        {step==="createUser" && (
          <div className="onboard-card">
            <h2>建立用藥紀錄</h2>
            <div className="field">
              <label>你的名字</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="請輸入名字" autoFocus/>
            </div>
            <div className="pair-code-display">
              <div className="code">{pairCode}</div>
              <small>把這組邀請碼分享給你的陪伴者</small>
            </div>
            <button className="btn btn-primary" style={{marginTop:8}} onClick={createUser}>開始記錄</button>
            <button className="btn btn-ghost" onClick={()=>setStep("choose")}>← 返回</button>
          </div>
        )}

        {step==="joinViewer" && (
          <div className="onboard-card">
            <h2>加入陪伴</h2>
            <div className="field">
              <label>你的名字</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="請輸入名字" autoFocus/>
            </div>
            <div className="field">
              <label>用藥者的四位數邀請碼</label>
              <input type="text" maxLength={4} value={joinCode}
                onChange={e=>{setJoinCode(e.target.value.replace(/\D/g,""));setJoinError("");}}
                placeholder="0000"
                style={{textAlign:"center",fontSize:"1.8rem",letterSpacing:"0.4em",fontFamily:"'DM Mono',monospace"}}/>
              {joinError && <p style={{color:"var(--rose)",fontSize:"0.75rem",marginTop:6}}>{joinError}</p>}
            </div>
            <p style={{fontSize:"0.75rem",color:"var(--ink-muted)",marginBottom:12,lineHeight:1.6}}>陪伴者只能閱讀，無法修改任何紀錄。</p>
            <button className="btn btn-primary" onClick={joinAsViewer}>以陪伴者身份加入</button>
            <button className="btn btn-ghost" onClick={()=>setStep("choose")}>← 返回</button>
          </div>
        )}

      </div>
    </div>
  );
}
