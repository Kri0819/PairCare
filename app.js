"use strict";

var _jsxRuntime = { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };
// ═══════════════════════════════════════════════════════════════════════════════
// 陪一刻 — Main App
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. CONSTANTS (must be first — everything below references these) ──────────
const STORAGE_KEY = "peiYike_v3";
const PERIODS = [{
  id: "breakfast_before",
  label: "早餐前",
  defaultTime: "07:30",
  icon: "🌅"
}, {
  id: "breakfast_after",
  label: "早餐後",
  defaultTime: "08:00",
  icon: "🍳"
}, {
  id: "lunch_before",
  label: "午餐前",
  defaultTime: "11:30",
  icon: "☀️"
}, {
  id: "lunch_after",
  label: "午餐後",
  defaultTime: "12:30",
  icon: "🥗"
}, {
  id: "dinner_before",
  label: "晚餐前",
  defaultTime: "17:30",
  icon: "🌇"
}, {
  id: "dinner_after",
  label: "晚餐後",
  defaultTime: "18:30",
  icon: "🍜"
}, {
  id: "bedtime",
  label: "睡前",
  defaultTime: "22:00",
  icon: "🌙"
}, {
  id: "custom",
  label: "自訂時間",
  defaultTime: "09:00",
  icon: "⏰"
}];
const PERIOD_MAP = Object.fromEntries(PERIODS.map(p => [p.id, p]));

// ─── 2. EMPTY STATE (must be before loadState) ────────────────────────────────
const EMPTY_STATE = {
  currentUser: null,
  ownerPairCode: null,
  medications: [],
  scheduleLog: {},
  doseLogs: [],
  doctorVisits: [],
  settings: {
    dayResetHour: 4,
    reminderTimes: []
  }
};

// ─── 3. HELPERS (must be before storage) ─────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function getLogicalDate(dayResetHour) {
  try {
    const h = Number(dayResetHour) || 4;
    const now = new Date();
    if (now.getHours() < h) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    return now.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
function nowHHMM() {
  try {
    return new Date().toTimeString().slice(0, 5);
  } catch {
    return "00:00";
  }
}
function periodTime(sched) {
  if (!sched) return "08:00";
  if (sched.periodId === "custom" && sched.customTime) return sched.customTime;
  return (PERIOD_MAP[sched.periodId] ? PERIOD_MAP[sched.periodId].defaultTime : "08:00") || "08:00";
}
function toMins(hhmm) {
  try {
    const [h, m] = (hhmm || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  } catch {
    return 0;
  }
}
function doseKey(dateStr, medId, periodId) {
  return String(dateStr) + "|" + String(medId) + "|" + String(periodId);
}
function estimateFinishDate(remaining, dailyDose) {
  try {
    if (!dailyDose || dailyDose <= 0 || !remaining || remaining <= 0) return null;
    const days = Math.floor(remaining / dailyDose);
    if (!isFinite(days) || days < 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return {
      days,
      date: d.toLocaleDateString("zh-TW", {
        month: "numeric",
        day: "numeric"
      })
    };
  } catch {
    return null;
  }
}

// ─── 4. STORAGE (depends on EMPTY_STATE + helpers) ────────────────────────────
function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function sanitizeState(s) {
  // Ensure all required keys exist and have correct types
  if (!s || typeof s !== "object") return null;
  return {
    currentUser: s.currentUser || null,
    ownerPairCode: s.ownerPairCode || null,
    medications: Array.isArray(s.medications) ? s.medications.map(sanitizeMed).filter(Boolean) : [],
    scheduleLog: s.scheduleLog && typeof s.scheduleLog === "object" ? s.scheduleLog : {},
    doseLogs: Array.isArray(s.doseLogs) ? s.doseLogs : [],
    doctorVisits: Array.isArray(s.doctorVisits) ? s.doctorVisits : [],
    settings: {
      dayResetHour: Number(s.settings && s.settings.dayResetHour) || 4,
      reminderTimes: Array.isArray(s.settings && s.settings.reminderTimes) ? s.settings.reminderTimes : []
    }
  };
}
function sanitizeMed(m) {
  if (!m || typeof m !== "object") return null;
  return {
    id: m.id || uid(),
    name: String(m.name || "未知藥物"),
    status: ["active", "paused", "completed"].includes(m.status) ? m.status : "active",
    totalCount: Number(m.totalCount) || 0,
    remainingCount: Number(m.remainingCount) || 0,
    createdAt: m.createdAt || new Date().toISOString(),
    schedules: Array.isArray(m.schedules) ? m.schedules.filter(Boolean) : [{
      periodId: "breakfast_after",
      customTime: null,
      dose: Number(m.dosePerTime) || 1
    }]
  };
}
function loadCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + "_user");
    if (!raw) return null;
    const u = safeParseJSON(raw);
    if (!u || !u.id || !u.name) return null;
    return u;
  } catch {
    return null;
  }
}
function loadState() {
  try {
    // Try primary storage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = safeParseJSON(raw);
      const clean = sanitizeState(parsed);
      if (clean) {
        if (!clean.currentUser) clean.currentUser = loadCurrentUser();
        return clean;
      }
    }
    // Try migrating v1/v2
    for (const k of ["peiYike_v2", "peiYike_v1"]) {
      const oldRaw = localStorage.getItem(k);
      if (!oldRaw) continue;
      const old = safeParseJSON(oldRaw);
      if (!old) continue;
      const migrated = sanitizeState({
        ...EMPTY_STATE,
        currentUser: old.currentUser || null,
        ownerPairCode: old.ownerPairCode || null,
        medications: old.medications || [],
        doseLogs: old.doseLogs || [],
        scheduleLog: old.scheduleLog || {},
        doctorVisits: old.doctorVisits || [],
        settings: {
          dayResetHour: old.settings && old.settings.dayResetHour || 4,
          reminderTimes: []
        }
      });
      if (migrated) {
        if (!migrated.currentUser) migrated.currentUser = loadCurrentUser();
        return migrated;
      }
    }
  } catch (e) {
    console.warn("[陪一刻] loadState error:", e);
  }
  // Fallback: fresh state, but try to recover user identity
  const user = loadCurrentUser();
  if (user) return {
    ...EMPTY_STATE,
    currentUser: user
  };
  return {
    ...EMPTY_STATE
  };
}
function saveState(s) {
  try {
    if (!s || typeof s !== "object") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    if (s.currentUser && s.currentUser.id) {
      localStorage.setItem(STORAGE_KEY + "_user", JSON.stringify(s.currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY + "_user");
    }
  } catch (e) {
    console.warn("[陪一刻] saveState error:", e);
  }
}

// ─── 5. NOTIFICATIONS ─────────────────────────────────────────────────────────
async function requestNotif() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}
function notify(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(title, {
      body,
      tag: "peiYike",
      icon: "/icons/icon-192.png"
    });
  } catch {}
}

// ─── 6. ERROR BOUNDARY ────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      crashed: false,
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      crashed: true,
      error
    };
  }
  componentDidCatch(error, info) {
    console.error("[陪一刻 ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.crashed) {
      return React.createElement("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100svh",
          padding: "32px",
          textAlign: "center",
          background: "#FAF7F2",
          gap: 16
        }
      }, React.createElement("div", {
        style: {
          fontSize: "2rem"
        }
      }, "😕"), React.createElement("h2", {
        style: {
          fontSize: "1.1rem",
          color: "#231C10"
        }
      }, "發生錯誤"), React.createElement("p", {
        style: {
          fontSize: "0.82rem",
          color: "#998870",
          lineHeight: 1.6,
          maxWidth: 300
        }
      }, "應用程式發生了意外錯誤。請點擊下方重新啟動。"), React.createElement("button", {
        onClick: () => window.location.reload(),
        style: {
          padding: "12px 24px",
          background: "#C4785A",
          color: "white",
          border: "none",
          borderRadius: 10,
          fontSize: "0.9rem",
          cursor: "pointer"
        }
      }, "重新啟動"), React.createElement("button", {
        onClick: () => {
          try {
            localStorage.clear();
          } catch (e) {}
          window.location.reload();
        },
        style: {
          padding: "10px 20px",
          background: "#998870",
          color: "white",
          border: "none",
          borderRadius: 10,
          fontSize: "0.82rem",
          cursor: "pointer"
        }
      }, "清除資料並重啟"));
    }
    return this.props.children;
  }
}
window.ErrorBoundary = ErrorBoundary;
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
  position: fixed; inset: 0;
  background: rgba(35,28,16,0.45);
  z-index: 100;
  display: flex; align-items: flex-end; justify-content: center;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.modal {
  background: var(--paper);
  border-radius: 22px 22px 0 0;
  width: 100%; max-width: 430px;
  /* 90vh fallback, then dvh for iOS Safari with toolbar */
  max-height: 90vh;
  max-height: 90dvh;
  display: flex; flex-direction: column;
  animation: slideUp 0.26s cubic-bezier(.32,.72,0,1);
  /* No overflow here — scroll is on .modal-scroll only */
}
.modal-top {
  padding: 20px 24px 0;
  flex-shrink: 0; /* never compress the header */
}
.modal-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 0 24px;
  /* Extra bottom space for iPhone home bar + last button visibility */
  padding-bottom: max(40px, calc(24px + env(safe-area-inset-bottom, 16px)));
}
@keyframes slideUp {
  from { transform: translateY(60px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.modal-handle {
  width: 40px; height: 4px;
  background: var(--border); border-radius: 2px;
  margin: 0 auto 18px;
}
.modal h3 {
  font-size: 1.05rem; font-weight: 600;
  letter-spacing: 0.05em; margin-bottom: 18px;
}

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
  today: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("rect", {
      x: "3",
      y: "4",
      width: "18",
      height: "18",
      rx: "2"
    }), (0, _jsxRuntime.jsx)("path", {
      d: "M16 2v4M8 2v4M3 10h18"
    }), (0, _jsxRuntime.jsx)("circle", {
      cx: "12",
      cy: "15",
      r: "1.8",
      fill: "currentColor",
      stroke: "none"
    })]
  }),
  meds: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("rect", {
      x: "3",
      y: "3",
      width: "8",
      height: "8",
      rx: "1.5"
    }), (0, _jsxRuntime.jsx)("rect", {
      x: "13",
      y: "3",
      width: "8",
      height: "8",
      rx: "1.5"
    }), (0, _jsxRuntime.jsx)("rect", {
      x: "3",
      y: "13",
      width: "8",
      height: "8",
      rx: "1.5"
    }), (0, _jsxRuntime.jsx)("rect", {
      x: "13",
      y: "13",
      width: "8",
      height: "8",
      rx: "1.5"
    })]
  }),
  visits: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("path", {
      d: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
    }), (0, _jsxRuntime.jsx)("rect", {
      x: "9",
      y: "3",
      width: "6",
      height: "4",
      rx: "1"
    }), (0, _jsxRuntime.jsx)("path", {
      d: "M9 12h6M9 16h4"
    })]
  }),
  plus: (0, _jsxRuntime.jsx)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    children: (0, _jsxRuntime.jsx)("path", {
      d: "M12 5v14M5 12h14"
    })
  }),
  check: (0, _jsxRuntime.jsx)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.8",
    children: (0, _jsxRuntime.jsx)("path", {
      d: "M5 13l4 4L19 7"
    })
  }),
  x: (0, _jsxRuntime.jsx)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    children: (0, _jsxRuntime.jsx)("path", {
      d: "M18 6L6 18M6 6l12 12"
    })
  }),
  user: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("circle", {
      cx: "12",
      cy: "8",
      r: "4"
    }), (0, _jsxRuntime.jsx)("path", {
      d: "M4 20c0-4 3.6-7 8-7s8 3 8 7"
    })]
  }),
  settings: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), (0, _jsxRuntime.jsx)("path", {
      d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    })]
  }),
  bell: (0, _jsxRuntime.jsxs)("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    children: [(0, _jsxRuntime.jsx)("path", {
      d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
    }), (0, _jsxRuntime.jsx)("path", {
      d: "M13.73 21a2 2 0 0 1-3.46 0"
    })]
  })
};

// ─── App ──────────────────────────────────────────────────────────────────────
window.App = function App() {
  const [state, setState] = useState(() => {
    try {
      const loaded = loadState();
      // loadState always returns an object, but double-check
      if (loaded && typeof loaded === 'object') {
        // If no currentUser in state, try the backup one more time
        if (!loaded.currentUser) {
          loaded.currentUser = loadCurrentUser();
        }
        return loaded;
      }
    } catch(e) {
      console.error('[陪一刻] useState init error:', e);
    }
    // Final fallback — still try to recover user
    const recoveredUser = loadCurrentUser();
    return Object.assign({}, EMPTY_STATE, { currentUser: recoveredUser });
  });
  const [tab, setTab] = useState("today");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [notifOk, setNotifOk] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [now, setNow] = useState(() => new Date());
  const firedRef = useRef({});
  const lastSavedRef = useRef(null);
  useEffect(() => {
    // Only save if state actually changed (avoid unnecessary writes)
    const serialized = JSON.stringify(state);
    if (serialized !== lastSavedRef.current) {
      lastSavedRef.current = serialized;
      saveState(state);
    }
  }, [state]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Reminder engine ──
  useEffect(() => {
    if (!notifOk) return;
    const check = () => {
      const date = getLogicalDate(state.settings && state.settings.dayResetHour || 4);
      const nowM = now.getHours() * 60 + now.getMinutes();

      // ── Per-medication period reminders ──
      safeMeds.filter(m => m && m.status === "active").forEach(med => {
        (med.schedules || []).forEach(sched => {
          const key = doseKey(date, med.id, sched.periodId);
          const log = safeLog[key];
          if (log) return;
          const t = toMins(periodTime(sched));
          const diff = nowM - t;
          if (diff >= 0 && diff < 2 && !firedRef.current[key + "_due"]) {
            firedRef.current[key + "_due"] = true;
            notify("陪一刻｜服藥提醒", `現在是${PERIOD_MAP[sched.periodId] && PERIOD_MAP[sched.periodId].label}用藥時間，記得吃 ${med.name}`);
          }
          if (diff >= 90 && !firedRef.current[key + "_late"]) {
            firedRef.current[key + "_late"] = true;
            notify("陪一刻｜還沒吃藥", `${med.name} ${PERIOD_MAP[sched.periodId] && PERIOD_MAP[sched.periodId].label}的劑量超過 90 分鐘未記錄`);
          }
        });
      });

      // ── Custom reminder times (settings) ──
      (safeSettings.reminderTimes || []).forEach(rt => {
        const fireKey = "reminder_" + date + "_" + rt;
        const diff = nowM - toMins(rt);
        if (diff >= 0 && diff < 2 && !firedRef.current[fireKey]) {
          firedRef.current[fireKey] = true;
          notify("陪一刻｜該吃藥了", "記得按時服藥，照顧好自己 💊");
        }
      });
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [notifOk, state.medications, state.scheduleLog, state.settings, now]);
  const showToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);
  const update = useCallback(fn => {
    setState(prev => {
      try {
        const next = JSON.parse(JSON.stringify(prev));
        fn(next);
        // Ensure arrays are always arrays after update
        if (!Array.isArray(next.medications))  next.medications  = [];
        if (!Array.isArray(next.doseLogs))     next.doseLogs     = [];
        if (!Array.isArray(next.doctorVisits)) next.doctorVisits = [];
        if (!next.scheduleLog || typeof next.scheduleLog !== 'object') next.scheduleLog = {};
        if (!next.settings)                    next.settings     = { dayResetHour: 4, reminderTimes: [] };
        return next;
      } catch(e) {
        console.error('[陪一刻] update error:', e);
        return prev; // Keep previous state on error — never crash
      }
    });
  }, []);
  const isViewer = !!(state.currentUser && state.currentUser.role === "viewer");
  // ── Guards: must come BEFORE anything that reads these ──────────────────────
  const safeMeds     = Array.isArray(state.medications)   ? state.medications   : [];
  const safeLog      = (state.scheduleLog && typeof state.scheduleLog === 'object') ? state.scheduleLog : {};
  const safeVisits   = Array.isArray(state.doctorVisits)  ? state.doctorVisits  : [];
  const safeSettings = (state.settings && typeof state.settings === 'object')
    ? state.settings
    : { dayResetHour: 4, reminderTimes: [] };
  const dayResetHour = (safeSettings.dayResetHour != null ? Number(safeSettings.dayResetHour) : 4) || 4;
  const logicalDate  = getLogicalDate(dayResetHour);
  const activeMeds   = safeMeds.filter(function(m){ return m && m.status === "active"; });
  if (!state.currentUser) return (0, _jsxRuntime.jsx)(OnboardScreen, {
    update: update
  });
  async function askNotif() {
    const ok = await requestNotif();
    setNotifOk(ok);
    showToast(ok ? "✓ 提醒已開啟" : "瀏覽器拒絕了通知權限");
  }
  return (0, _jsxRuntime.jsxs)("div", {
    className: "app",
    children: [(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), toast && (0, _jsxRuntime.jsx)("div", {
      className: "toast",
      children: toast
    }), isViewer && (0, _jsxRuntime.jsx)("div", {
      className: "viewer-banner",
      children: "\uD83D\uDC40 \u6AA2\u8996\u6A21\u5F0F \u2014 \u4F60\u53EA\u80FD\u95B1\u8B80\uFF0C\u7121\u6CD5\u4FEE\u6539"
    }), (function(){ try { return "Notification" in window && !notifOk && !isViewer && Notification.permission !== "denied"; } catch(e){ return false; } })() && (0, _jsxRuntime.jsxs)("div", {
      className: "notif-banner",
      children: [(0, _jsxRuntime.jsxs)("span", {
        children: [Ico.bell, " \u958B\u555F\u63D0\u9192\uFF0C\u5230\u6642\u9593\u81EA\u52D5\u901A\u77E5"]
      }), (0, _jsxRuntime.jsx)("button", {
        onClick: askNotif,
        children: "\u958B\u555F"
      })]
    }), (0, _jsxRuntime.jsxs)("div", {
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      },
      children: [tab === "today" && (0, _jsxRuntime.jsx)(TodayPage, {
        state: state,
        update: update,
        isViewer: isViewer,
        showToast: showToast,
        setModal: setModal,
        logicalDate: logicalDate,
        now: now
      }), tab === "meds" && (0, _jsxRuntime.jsx)(MedsPage, {
        state: state,
        update: update,
        isViewer: isViewer,
        showToast: showToast,
        setModal: setModal,
        logicalDate: logicalDate
      }), tab === "visits" && (0, _jsxRuntime.jsx)(VisitsPage, {
        state: state,
        update: update,
        isViewer: isViewer,
        showToast: showToast,
        setModal: setModal
      })]
    }), (0, _jsxRuntime.jsx)("nav", {
      className: "nav",
      children: [{
        id: "today",
        label: "今日一刻",
        icon: Ico.today
      }, {
        id: "meds",
        label: "藥物清單",
        icon: Ico.meds
      }, {
        id: "visits",
        label: "看診紀錄",
        icon: Ico.visits
      }].map(item => (0, _jsxRuntime.jsxs)("button", {
        className: `nav-item ${tab === item.id ? "active" : ""}`,
        onClick: () => setTab(item.id),
        children: [item.icon, (0, _jsxRuntime.jsx)("span", {
          children: item.label
        })]
      }, item.id))
    }), modal === "addMed" && !isViewer && (0, _jsxRuntime.jsx)(AddMedModal, {
      onClose: () => setModal(null),
      onSave: med => {
        update(s => {
          s.medications.push({
            ...med,
            id: uid(),
            status: "active",
            remainingCount: med.totalCount,
            createdAt: new Date().toISOString()
          });
        });
        showToast("✓ 已新增藥物");
        setModal(null);
      }
    }), modal === "addVisit" && !isViewer && (0, _jsxRuntime.jsx)(AddVisitModal, {
      medications: activeMeds,
      allMeds: state.medications,
      onClose: () => setModal(null),
      onSave: visit => {
        update(s => {
          s.doctorVisits.unshift({
            ...visit,
            id: uid()
          });
          // Mark all active meds as paused unless in continuedIds or newIds
          const continued = new Set(visit.continuedIds);
          const newIds = new Set();
          // Add new meds
          (visit.newMeds || []).forEach(nm => {
            const id = uid();
            newIds.add(id);
            s.medications.push({
              id,
              name: nm.name,
              schedules: nm.schedules,
              totalCount: nm.totalCount,
              remainingCount: nm.totalCount,
              status: "active",
              createdAt: visit.date
            });
          });
          // Stop unchecked active meds
          s.medications.forEach(m => {
            if (m.status === "active" && !continued.has(m.id) && !newIds.has(m.id)) m.status = "paused";
          });
        });
        showToast("✓ 看診紀錄已儲存");
        setModal(null);
      }
    }), modal === "settings" && (0, _jsxRuntime.jsx)(SettingsModal, {
      state: state,
      update: update,
      onClose: () => setModal(null),
      showToast: showToast,
      notifOk: notifOk,
      askNotif: askNotif
    }), modal === "profile" && (0, _jsxRuntime.jsx)(ProfileModal, {
      state: state,
      update: update,
      onClose: () => setModal(null),
      showToast: showToast
    })]
  });
};

// ─── Today page ───────────────────────────────────────────────────────────────
function TodayPage({
  state,
  update,
  isViewer,
  showToast,
  setModal,
  logicalDate,
  now
}) {
  // ── Guard: ensure all state arrays exist before use ──
  const safeMeds     = Array.isArray(state.medications)  ? state.medications  : [];
  const safeLog      = (state.scheduleLog && typeof state.scheduleLog === 'object') ? state.scheduleLog : {};
  const safeVisits   = Array.isArray(state.doctorVisits) ? state.doctorVisits : [];
  const safeSettings = state.settings && typeof state.settings === 'object'
    ? state.settings
    : { dayResetHour: 4, reminderTimes: [] };
  const activeMeds = safeMeds.filter(m => m && m.status === "active");
  const dayResetHour = safeSettings.dayResetHour || 4;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Build period groups: { periodId, label, icon, time, meds[] }
  const periodGroupMap = {};
  activeMeds.forEach(med => {
    (med.schedules || []).forEach(sched => {
      const pid = sched.periodId;
      if (!periodGroupMap[pid]) {
        periodGroupMap[pid] = {
          periodId: pid,
          label: PERIOD_MAP[pid] && PERIOD_MAP[pid].label || pid,
          icon: PERIOD_MAP[pid] && PERIOD_MAP[pid].icon || "⏰",
          time: periodTime(sched),
          meds: []
        };
      }
      periodGroupMap[pid].meds.push({
        med,
        sched,
        key: doseKey(logicalDate, med.id, pid)
      });
    });
  });
  const groups = Object.values(periodGroupMap).sort((a, b) => toMins(a.time) - toMins(b.time));
  const totalGroups = groups.length;
  const doneGroups = groups.filter(g => g.meds.every(({
    key
  }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt))).length;
  const pct = totalGroups > 0 ? Math.round(doneGroups / totalGroups * 100) : 0;
  const CIRC = 2 * Math.PI * 26; // r=26

  function markPeriodTaken(group) {
    if (isViewer) return;
    const takenAt = nowHHMM();
    update(s => {
      group.meds.forEach(({
        key,
        sched,
        med
      }) => {
        s.scheduleLog[key] = {
          takenAt
        };
        const m = s.medications.find(m => m.id === med.id);
        if (m) m.remainingCount = Math.max(0, (m.remainingCount || 0) - sched.dose);
      });
    });
    showToast(`✓ ${group.label} 已完成`);
  }
  function undoPeriod(group) {
    if (isViewer) return;
    update(s => {
      group.meds.forEach(({
        key,
        sched,
        med
      }) => {
        if ((s.scheduleLog[key] && s.scheduleLog[key].takenAt)) {
          const m = s.medications.find(m => m.id === med.id);
          if (m) m.remainingCount = Math.min(m.totalCount, (m.remainingCount || 0) + sched.dose);
        }
        delete s.scheduleLog[key];
      });
    });
    showToast("已撤銷");
  }
  return (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [(0, _jsxRuntime.jsx)("div", {
      className: "header",
      children: (0, _jsxRuntime.jsxs)("div", {
        className: "header-row",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u4ECA\u65E5\u4E00\u523B"
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "header-icons",
          children: [(0, _jsxRuntime.jsx)("span", {
            className: "date-chip",
            children: logicalDate
          }), (0, _jsxRuntime.jsx)("button", {
            className: "btn-icon",
            onClick: () => setModal("settings"),
            children: Ico.settings
          }), (0, _jsxRuntime.jsx)("button", {
            className: "btn-icon",
            onClick: () => setModal("profile"),
            children: Ico.user
          })]
        })]
      })
    }), (0, _jsxRuntime.jsxs)("div", {
      className: "main",
      children: [totalGroups > 0 && (0, _jsxRuntime.jsxs)("div", {
        className: "today-hero",
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "hero-progress",
          children: [(0, _jsxRuntime.jsxs)("svg", {
            children: [(0, _jsxRuntime.jsx)("circle", {
              className: "track",
              cx: "34",
              cy: "34",
              r: "26"
            }), (0, _jsxRuntime.jsx)("circle", {
              className: "fill",
              cx: "34",
              cy: "34",
              r: "26",
              strokeDasharray: CIRC,
              strokeDashoffset: CIRC - CIRC * pct / 100
            })]
          }), (0, _jsxRuntime.jsxs)("div", {
            className: "hero-center",
            children: [(0, _jsxRuntime.jsx)("div", {
              className: "num",
              children: doneGroups
            }), (0, _jsxRuntime.jsxs)("div", {
              className: "den",
              children: ["/ ", totalGroups]
            })]
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "hero-text",
          children: [(0, _jsxRuntime.jsx)("h3", {
            children: pct === 100 ? "今天全部完成 🌿" : doneGroups === 0 ? "今天還沒有紀錄" : `已完成 ${pct}%`
          }), (0, _jsxRuntime.jsx)("p", {
            children: pct === 100 ? "謝謝你認真照顧自己" : `還有 ${totalGroups - doneGroups} 個時段待服藥`
          })]
        })]
      }), groups.length === 0 ? (0, _jsxRuntime.jsxs)("div", {
        className: "empty-state",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "icon",
          children: "\u2728"
        }), (0, _jsxRuntime.jsx)("p", {
          children: "\u9084\u6C92\u6709\u8A2D\u5B9A\u85E5\u7269\u6642\u7A0B"
        }), !isViewer && (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          style: {
            marginTop: 16,
            display: "inline-flex"
          },
          onClick: () => setModal("addMed"),
          children: "\u65B0\u589E\u85E5\u7269"
        })]
      }) : groups.map(group => {
        const allDone = group.meds.every(({
          key
        }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt));
        const anyDone = group.meds.some(({
          key
        }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt));
        const tMins = toMins(group.time);
        const isLate = !allDone && nowMins - tMins > 30;
        const isNow = !allDone && nowMins - tMins >= 0 && nowMins - tMins <= 30;
        let cardClass = "period-card";
        if (allDone) cardClass += " is-done";else if (isNow) cardClass += " is-now";else if (isLate) cardClass += " is-late";
        const firstTakenAt = group.meds.map(({
          key
        }) => ((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt)).filter(Boolean)[0];
        return (0, _jsxRuntime.jsxs)("div", {
          className: "period-group",
          children: [(0, _jsxRuntime.jsxs)("div", {
            className: "period-title",
            children: [(0, _jsxRuntime.jsx)("span", {
              className: "period-icon",
              children: group.icon
            }), (0, _jsxRuntime.jsx)("span", {
              children: group.label
            }), (0, _jsxRuntime.jsx)("span", {
              className: "period-time",
              children: group.time
            })]
          }), (0, _jsxRuntime.jsxs)("div", {
            className: cardClass,
            children: [(0, _jsxRuntime.jsx)("div", {
              className: "period-meds",
              children: group.meds.map(({
                med,
                sched,
                key
              }) => {
                const log = (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key];
                return (0, _jsxRuntime.jsxs)("div", {
                  className: "period-med-row",
                  children: [(0, _jsxRuntime.jsxs)("div", {
                    children: [(0, _jsxRuntime.jsx)("div", {
                      className: "period-med-name",
                      children: med.name
                    }), (0, _jsxRuntime.jsxs)("div", {
                      className: "period-med-dose",
                      children: [sched.dose, " \u9846"]
                    })]
                  }), (0, _jsxRuntime.jsx)("div", {
                    className: "period-med-check",
                    children: log && log.takenAt ? "✅" : "○"
                  })]
                }, key);
              })
            }), (0, _jsxRuntime.jsxs)("div", {
              className: `period-footer ${allDone ? "done" : isLate ? "late" : ""}`,
              children: [(0, _jsxRuntime.jsx)("div", {
                className: "period-footer-label",
                children: allDone ? `✓ 已服藥 ${firstTakenAt || ""}` : isLate ? `⚠ 已超過 ${nowMins - tMins} 分鐘` : isNow ? "⏰ 現在服藥時間" : ""
              }), !isViewer && (allDone ? (0, _jsxRuntime.jsx)("button", {
                className: "btn-undo",
                onClick: () => undoPeriod(group),
                children: "\u64A4\u92B7"
              }) : (0, _jsxRuntime.jsx)("button", {
                className: "btn-take-period",
                onClick: () => markPeriodTaken(group),
                children: "\u5DF2\u670D\u7528"
              }))]
            })]
          })]
        }, group.periodId);
      })]
    })]
  });
}

// ─── Meds page ────────────────────────────────────────────────────────────────
function MedsPage({
  state,
  update,
  isViewer,
  showToast,
  setModal,
  logicalDate
}) {
  const active = (Array.isArray(state.medications) ? state.medications : []).filter(m => m.status === "active");
  const paused = (Array.isArray(state.medications) ? state.medications : []).filter(m => m.status === "paused");
  function toggle(id) {
    if (isViewer) return;
    update(s => {
      const m = s.medications.find(m => m.id === id);
      if (m) m.status = m.status === "active" ? "paused" : "active";
    });
    showToast("狀態已更新");
  }
  return (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [(0, _jsxRuntime.jsx)("div", {
      className: "header",
      children: (0, _jsxRuntime.jsxs)("div", {
        className: "header-row",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u85E5\u7269\u6E05\u55AE"
        }), !isViewer && (0, _jsxRuntime.jsx)("button", {
          className: "btn-icon",
          onClick: () => setModal("addMed"),
          children: Ico.plus
        })]
      })
    }), (0, _jsxRuntime.jsx)("div", {
      className: "main",
      children: (Array.isArray(state.medications) ? state.medications : []).length === 0 ? (0, _jsxRuntime.jsxs)("div", {
        className: "empty-state",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "icon",
          children: "\u2728"
        }), (0, _jsxRuntime.jsx)("p", {
          children: "\u9084\u6C92\u6709\u85E5\u7269\u7D00\u9304"
        }), !isViewer && (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          style: {
            marginTop: 16,
            display: "inline-flex"
          },
          onClick: () => setModal("addMed"),
          children: "\u65B0\u589E\u85E5\u7269"
        })]
      }) : (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [active.length > 0 && (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [(0, _jsxRuntime.jsx)("div", {
            className: "section-title",
            children: "\u670D\u7528\u4E2D"
          }), active.map(m => (0, _jsxRuntime.jsx)(MedCard, {
            med: m,
            isViewer: isViewer,
            onToggle: toggle
          }, m.id))]
        }), paused.length > 0 && (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [(0, _jsxRuntime.jsx)("div", {
            className: "section-title",
            children: "\u5DF2\u505C\u85E5"
          }), paused.map(m => (0, _jsxRuntime.jsx)(MedCard, {
            med: m,
            isViewer: isViewer,
            onToggle: toggle
          }, m.id))]
        })]
      })
    }), !isViewer && (0, _jsxRuntime.jsx)("button", {
      className: "fab",
      onClick: () => setModal("addMed"),
      children: "\uFF0B"
    })]
  });
}
function MedCard({
  med,
  isViewer,
  onToggle
}) {
  const pct = med.totalCount > 0 ? Math.round(med.remainingCount / med.totalCount * 100) : 0;
  const dailyDose = (med.schedules || []).reduce((s, sc) => s + sc.dose, 0);
  const est = estimateFinishDate(med.remainingCount, dailyDose);
  const low = est && est.days < 7;
  return (0, _jsxRuntime.jsxs)("div", {
    className: `med-card ${med.status}`,
    children: [(0, _jsxRuntime.jsxs)("div", {
      className: "med-card-top",
      children: [(0, _jsxRuntime.jsx)("div", {
        children: (0, _jsxRuntime.jsx)("div", {
          className: "med-card-name",
          children: med.name
        })
      }), (0, _jsxRuntime.jsx)("span", {
        className: `status-tag ${med.status === "active" ? "tag-active" : "tag-paused"}`,
        children: med.status === "active" ? "服用中" : "已停藥"
      })]
    }), (0, _jsxRuntime.jsx)("div", {
      className: "med-period-tags",
      children: (med.schedules || []).map((sched, i) => (0, _jsxRuntime.jsxs)("span", {
        className: "med-period-tag",
        children: [PERIOD_MAP[sched.periodId] && PERIOD_MAP[sched.periodId].icon, " ", PERIOD_MAP[sched.periodId] && PERIOD_MAP[sched.periodId].label, " \xD7 ", sched.dose, " \u9846"]
      }, i))
    }), (0, _jsxRuntime.jsxs)("div", {
      className: "med-stats",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "med-stat",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "val",
          children: med.remainingCount
        }), (0, _jsxRuntime.jsx)("div", {
          className: "lbl",
          children: "\u5269\u9918\u9846"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "med-stat",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "val",
          children: med.totalCount
        }), (0, _jsxRuntime.jsx)("div", {
          className: "lbl",
          children: "\u7E3D\u9846\u6578"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "med-stat",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "val",
          children: dailyDose
        }), (0, _jsxRuntime.jsx)("div", {
          className: "lbl",
          children: "\u6BCF\u65E5\u9846"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "med-stat",
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "val",
          children: [pct, "%"]
        }), (0, _jsxRuntime.jsx)("div", {
          className: "lbl",
          children: "\u5269\u9918\u7387"
        })]
      })]
    }), (0, _jsxRuntime.jsx)("div", {
      className: "progress-wrap",
      children: (0, _jsxRuntime.jsx)("div", {
        className: "progress-fill",
        style: {
          width: `${pct}%`,
          background: low ? "var(--rose)" : "var(--sage)"
        }
      })
    }), est && (0, _jsxRuntime.jsxs)("div", {
      className: "estimate-row",
      children: [(0, _jsxRuntime.jsx)("span", {
        children: "\u9084\u53EF\u4EE5\u5403"
      }), (0, _jsxRuntime.jsxs)("span", {
        className: "days",
        style: {
          color: low ? "var(--rose)" : "var(--sage)"
        },
        children: [est.days, " \u5929"]
      }), (0, _jsxRuntime.jsxs)("span", {
        children: ["\uFF5C\u9810\u4F30 ", est.date, " \u5403\u5B8C"]
      }), low && (0, _jsxRuntime.jsx)("span", {
        style: {
          color: "var(--rose)",
          fontSize: "0.72rem",
          marginLeft: 4
        },
        children: "\u26A0 \u5FEB\u8981\u4E0D\u5920\u4E86"
      })]
    }), !isViewer && (0, _jsxRuntime.jsx)("div", {
      className: "med-footer",
      children: (0, _jsxRuntime.jsx)("button", {
        className: "btn btn-sm btn-ghost",
        onClick: () => onToggle(med.id),
        children: med.status === "active" ? "暫停此藥" : "恢復服用"
      })
    })]
  });
}

// ─── Visits page ──────────────────────────────────────────────────────────────
function VisitsPage({
  state,
  update,
  isViewer,
  showToast,
  setModal
}) {
  const sorted = [...state.doctorVisits].sort((a, b) => b.date.localeCompare(a.date));
  function getMedName(id) {
    return ((Array.isArray(state.medications) ? state.medications : []).find(m => m.id === id) || {}).name || "—";
  }
  return (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [(0, _jsxRuntime.jsx)("div", {
      className: "header",
      children: (0, _jsxRuntime.jsxs)("div", {
        className: "header-row",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u770B\u8A3A\u7D00\u9304"
        }), !isViewer && (0, _jsxRuntime.jsx)("button", {
          className: "btn-icon",
          onClick: () => setModal("addVisit"),
          children: Ico.plus
        })]
      })
    }), (0, _jsxRuntime.jsx)("div", {
      className: "main",
      children: sorted.length === 0 ? (0, _jsxRuntime.jsxs)("div", {
        className: "empty-state",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "icon",
          children: "\uD83D\uDCCB"
        }), (0, _jsxRuntime.jsx)("p", {
          children: "\u9084\u6C92\u6709\u770B\u8A3A\u7D00\u9304"
        }), !isViewer && (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          style: {
            marginTop: 16,
            display: "inline-flex"
          },
          onClick: () => setModal("addVisit"),
          children: "\u65B0\u589E\u770B\u8A3A"
        })]
      }) : (0, _jsxRuntime.jsx)("div", {
        className: "timeline",
        children: sorted.map(visit => (0, _jsxRuntime.jsx)("div", {
          className: "visit-item",
          children: (0, _jsxRuntime.jsxs)("div", {
            className: "visit-card",
            children: [(0, _jsxRuntime.jsxs)("div", {
              className: "visit-date-bar",
              children: [(0, _jsxRuntime.jsx)("span", {
                className: "visit-date",
                children: visit.date
              }), (0, _jsxRuntime.jsx)("span", {
                className: "visit-hospital",
                children: visit.hospital || visit.doctor || ""
              })]
            }), (0, _jsxRuntime.jsxs)("div", {
              className: "visit-body",
              children: [visit.note && (0, _jsxRuntime.jsxs)("p", {
                className: "visit-note",
                children: ["\u300C", visit.note, "\u300D"]
              }), (0, _jsxRuntime.jsxs)("div", {
                className: "change-list",
                children: [(visit.continuedIds || []).map(id => (0, _jsxRuntime.jsxs)("div", {
                  className: "change-chip chip-continue",
                  children: [(0, _jsxRuntime.jsx)("span", {
                    className: "chip-label",
                    children: "\u7E7C\u7E8C"
                  }), (0, _jsxRuntime.jsxs)("span", {
                    children: ["\u2197 ", getMedName(id)]
                  })]
                }, id)), (visit.stoppedIds || []).map(id => (0, _jsxRuntime.jsxs)("div", {
                  className: "change-chip chip-stop",
                  children: [(0, _jsxRuntime.jsx)("span", {
                    className: "chip-label",
                    children: "\u505C\u85E5"
                  }), (0, _jsxRuntime.jsxs)("span", {
                    children: ["\u2715 ", getMedName(id)]
                  })]
                }, id)), (visit.newMeds || []).map((nm, i) => (0, _jsxRuntime.jsxs)("div", {
                  className: "change-chip chip-new",
                  children: [(0, _jsxRuntime.jsx)("span", {
                    className: "chip-label",
                    children: "\u65B0\u85E5"
                  }), (0, _jsxRuntime.jsxs)("span", {
                    children: ["\u2726 ", nm.name]
                  })]
                }, i))]
              })]
            })]
          })
        }, visit.id))
      })
    }), !isViewer && (0, _jsxRuntime.jsx)("button", {
      className: "fab",
      onClick: () => setModal("addVisit"),
      children: "\uFF0B"
    })]
  });
}

// ─── Period selector component ────────────────────────────────────────────────
function PeriodSelector({
  selected,
  onChange
}) {
  // selected: [{ periodId, customTime?, dose }]
  const isSelected = pid => selected.some(s => s.periodId === pid);
  function toggle(pid) {
    if (isSelected(pid)) {
      onChange(selected.filter(s => s.periodId !== pid));
    } else {
      const defaultT = PERIOD_MAP[pid] && PERIOD_MAP[pid].defaultTime || "08:00";
      onChange([...selected, {
        periodId: pid,
        customTime: pid === "custom" ? defaultT : null,
        dose: 1
      }]);
    }
  }
  function updateSched(pid, patch) {
    onChange(selected.map(s => s.periodId === pid ? {
      ...s,
      ...patch
    } : s));
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "period-selector",
    children: PERIODS.map(p => {
      const sel = isSelected(p.id);
      const sched = selected.find(s => s.periodId === p.id);
      return (0, _jsxRuntime.jsxs)("div", {
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: `period-option ${sel ? "selected" : ""}`,
          onClick: () => toggle(p.id),
          children: [(0, _jsxRuntime.jsx)("span", {
            className: "period-option-icon",
            children: p.icon
          }), (0, _jsxRuntime.jsx)("span", {
            className: "period-option-label",
            children: p.label
          }), !sel && (0, _jsxRuntime.jsx)("span", {
            className: "period-option-time",
            children: p.defaultTime
          }), sel && (0, _jsxRuntime.jsx)("span", {
            style: {
              color: "var(--rose)",
              fontSize: "0.85rem",
              fontWeight: 700
            },
            children: "\u2713"
          })]
        }), sel && (0, _jsxRuntime.jsxs)("div", {
          className: "period-dose-row",
          children: [(0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: "0.78rem",
              color: "var(--ink-muted)",
              whiteSpace: "nowrap"
            },
            children: "\u6BCF\u6B21"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "number",
            min: 0.5,
            step: 0.5,
            value: sched.dose,
            onChange: e => updateSched(p.id, {
              dose: Number(e.target.value)
            }),
            style: {
              width: 72
            }
          }), (0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: "0.78rem",
              color: "var(--ink-muted)"
            },
            children: "\u9846"
          }), p.id === "custom" && (0, _jsxRuntime.jsx)("input", {
            type: "time",
            value: sched.customTime || p.defaultTime,
            onChange: e => updateSched(p.id, {
              customTime: e.target.value
            })
          })]
        })]
      }, p.id);
    })
  });
}

// ─── Add Med Modal ────────────────────────────────────────────────────────────
function AddMedModal({
  onClose,
  onSave
}) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState(30);
  const [schedules, setSchedules] = useState([]);
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: (0, _jsxRuntime.jsxs)("div", {
      className: "modal",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "modal-top",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "modal-handle"
        }), (0, _jsxRuntime.jsx)("h3", {
          children: "\u65B0\u589E\u85E5\u7269"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "modal-scroll",
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u85E5\u7269\u540D\u7A31"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            value: name,
            onChange: e => setName(e.target.value),
            placeholder: "\u4F8B\uFF1AEscitalopram 10mg",
            autoFocus: true
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u521D\u59CB\u7E3D\u9846\u6578"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "number",
            min: 1,
            value: total,
            onChange: e => setTotal(e.target.value)
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            style: {
              marginBottom: 10
            },
            children: "\u670D\u7528\u6642\u6BB5\uFF08\u53EF\u8907\u9078\uFF09"
          }), (0, _jsxRuntime.jsx)(PeriodSelector, {
            selected: schedules,
            onChange: setSchedules
          })]
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          style: {
            marginTop: 8
          },
          onClick: () => {
            if (!name.trim() || schedules.length === 0) return;
            onSave({
              name: name.trim(),
              schedules,
              totalCount: Number(total)
            });
          },
          children: "\u5132\u5B58\u85E5\u7269"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-ghost",
          onClick: onClose,
          children: "\u53D6\u6D88"
        })]
      })]
    })
  });
}

// ─── Add Visit Modal ──────────────────────────────────────────────────────────
function AddVisitModal({
  medications,
  allMeds,
  onClose,
  onSave
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [hospital, setHospital] = useState("");
  const [doctor, setDoctor] = useState("");
  const [note, setNote] = useState("");
  // continuedIds: set of med ids the user checks as "still taking"
  const [continuedIds, setContinuedIds] = useState(new Set(medications.map(m => m.id)));
  const [newMeds, setNewMeds] = useState([]);
  function toggleContinue(id) {
    setContinuedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  function addNewMed() {
    setNewMeds(prev => [...prev, {
      _key: uid(),
      name: "",
      schedules: [],
      totalCount: 30
    }]);
  }
  function updateNewMed(key, patch) {
    setNewMeds(prev => prev.map(m => m._key === key ? {
      ...m,
      ...patch
    } : m));
  }
  function removeNewMed(key) {
    setNewMeds(prev => prev.filter(m => m._key !== key));
  }

  // Compute which will be stopped = active meds NOT in continuedIds
  const stoppedIds = medications.filter(m => !continuedIds.has(m.id)).map(m => m.id);
  function save() {
    onSave({
      date,
      hospital,
      doctor,
      note,
      continuedIds: [...continuedIds],
      stoppedIds,
      newMeds: newMeds.filter(m => m.name.trim()).map(({
        _key,
        ...m
      }) => m)
    });
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: (0, _jsxRuntime.jsxs)("div", {
      className: "modal",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "modal-top",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "modal-handle"
        }), (0, _jsxRuntime.jsx)("h3", {
          children: "\u65B0\u589E\u770B\u8A3A\u7D00\u9304"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "modal-scroll",
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u770B\u8A3A\u65E5\u671F"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "date",
            value: date,
            onChange: e => setDate(e.target.value)
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u91AB\u9662\uFF08\u9078\u586B\uFF09"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            value: hospital,
            onChange: e => setHospital(e.target.value),
            placeholder: "\u91AB\u9662\u540D\u7A31"
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u91AB\u5E2B\uFF08\u9078\u586B\uFF09"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            value: doctor,
            onChange: e => setDoctor(e.target.value),
            placeholder: "\u91AB\u5E2B\u59D3\u540D"
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u5099\u8A3B\uFF08\u9078\u586B\uFF09"
          }), (0, _jsxRuntime.jsx)("textarea", {
            rows: 2,
            value: note,
            onChange: e => setNote(e.target.value),
            placeholder: "\u9019\u6B21\u91AB\u5E2B\u8AAA\u4E86\u4EC0\u9EBC\u2026",
            style: {
              resize: "none"
            }
          })]
        }), (0, _jsxRuntime.jsx)("hr", {
          className: "divider"
        }), medications.length > 0 ? (0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [(0, _jsxRuntime.jsx)("label", {
            style: {
              marginBottom: 10,
              display: "block"
            },
            children: "\u9019\u6B21\u56DE\u8A3A\u7E7C\u7E8C\u670D\u7528\u54EA\u4E9B\u85E5\uFF1F"
          }), (0, _jsxRuntime.jsx)("p", {
            className: "section-tip",
            children: "\u52FE\u9078\u7684 = \u7E7C\u7E8C\u670D\u7528\u3002\u6C92\u52FE\u9078\u7684\u85E5\uFF0C\u5132\u5B58\u5F8C\u81EA\u52D5\u505C\u85E5\u3002"
          }), (0, _jsxRuntime.jsx)("div", {
            style: {
              background: "white",
              borderRadius: 12,
              border: "1.5px solid var(--border)",
              padding: "0 16px",
              marginBottom: 16
            },
            children: medications.map(med => {
              const checked = continuedIds.has(med.id);
              const dailyDose = (med.schedules || []).reduce((s, sc) => s + sc.dose, 0);
              return (0, _jsxRuntime.jsxs)("div", {
                className: "med-checkbox-row",
                onClick: () => toggleContinue(med.id),
                children: [(0, _jsxRuntime.jsxs)("div", {
                  children: [(0, _jsxRuntime.jsx)("div", {
                    className: "med-checkbox-label",
                    children: med.name
                  }), (0, _jsxRuntime.jsxs)("div", {
                    className: "med-checkbox-sub",
                    children: ["\u6BCF\u65E5 ", dailyDose, " \u9846 \xB7 \u5269 ", med.remainingCount, " \u9846"]
                  })]
                }), (0, _jsxRuntime.jsx)("div", {
                  className: `cb-box ${checked ? "checked" : ""}`,
                  children: checked && (0, _jsxRuntime.jsx)("span", {
                    className: "cb-check",
                    children: "\u2713"
                  })
                })]
              }, med.id);
            })
          }), stoppedIds.length > 0 && (0, _jsxRuntime.jsxs)("p", {
            style: {
              fontSize: "0.75rem",
              color: "var(--rose)",
              marginBottom: 16
            },
            children: ["\u26A0 \u4EE5\u4E0B\u85E5\u7269\u5C07\u81EA\u52D5\u505C\u85E5\uFF1A", stoppedIds.map(id => medications.find(m => m.id === id)?.name).join("、")]
          })]
        }) : (0, _jsxRuntime.jsx)("p", {
          className: "section-tip",
          children: "\u76EE\u524D\u6C92\u6709\u670D\u7528\u4E2D\u85E5\u7269\u3002"
        }), (0, _jsxRuntime.jsx)("hr", {
          className: "divider"
        }), (0, _jsxRuntime.jsx)("label", {
          style: {
            marginBottom: 10,
            display: "block"
          },
          children: "\u9019\u6B21\u958B\u4E86\u65B0\u85E5\uFF1F"
        }), newMeds.map(nm => (0, _jsxRuntime.jsxs)("div", {
          style: {
            background: "white",
            border: "1.5px solid var(--border)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 10
          },
          children: [(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10
            },
            children: [(0, _jsxRuntime.jsx)("span", {
              style: {
                fontWeight: 600,
                fontSize: "0.85rem",
                color: "var(--ink-light)"
              },
              children: "\u65B0\u85E5"
            }), (0, _jsxRuntime.jsx)("button", {
              className: "btn-icon",
              onClick: () => removeNewMed(nm._key),
              children: Ico.x
            })]
          }), (0, _jsxRuntime.jsxs)("div", {
            className: "field",
            children: [(0, _jsxRuntime.jsx)("label", {
              children: "\u85E5\u7269\u540D\u7A31"
            }), (0, _jsxRuntime.jsx)("input", {
              type: "text",
              value: nm.name,
              onChange: e => updateNewMed(nm._key, {
                name: e.target.value
              }),
              placeholder: "\u85E5\u540D"
            })]
          }), (0, _jsxRuntime.jsxs)("div", {
            className: "field",
            children: [(0, _jsxRuntime.jsx)("label", {
              children: "\u7E3D\u9846\u6578"
            }), (0, _jsxRuntime.jsx)("input", {
              type: "number",
              min: 1,
              value: nm.totalCount,
              onChange: e => updateNewMed(nm._key, {
                totalCount: Number(e.target.value)
              })
            })]
          }), (0, _jsxRuntime.jsxs)("div", {
            className: "field",
            children: [(0, _jsxRuntime.jsx)("label", {
              style: {
                marginBottom: 8
              },
              children: "\u670D\u7528\u6642\u6BB5"
            }), (0, _jsxRuntime.jsx)(PeriodSelector, {
              selected: nm.schedules || [],
              onChange: scheds => updateNewMed(nm._key, {
                schedules: scheds
              })
            })]
          })]
        }, nm._key)), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-secondary",
          style: {
            marginTop: 0
          },
          onClick: addNewMed,
          children: "\uFF0B \u65B0\u589E\u4E00\u7B46\u65B0\u85E5"
        }), (0, _jsxRuntime.jsx)("hr", {
          className: "divider"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          onClick: save,
          children: "\u5132\u5B58\u770B\u8A3A\u7D00\u9304"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-ghost",
          onClick: onClose,
          children: "\u53D6\u6D88"
        })]
      })]
    })
  });
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({
  state,
  update,
  onClose,
  showToast,
  notifOk,
  askNotif
}) {
  const hr = state.settings && state.settings.dayResetHour || 4;
  const reminderTimes = state.settings && state.settings.reminderTimes || [];
  function addReminderTime() {
    const t = "08:00";
    update(s => {
      s.settings.reminderTimes = [...(s.settings.reminderTimes || []), t];
    });
  }
  function updateReminderTime(idx, val) {
    update(s => {
      const arr = [...(s.settings.reminderTimes || [])];
      arr[idx] = val;
      s.settings.reminderTimes = arr;
    });
  }
  function removeReminderTime(idx) {
    update(s => {
      s.settings.reminderTimes = (s.settings.reminderTimes || []).filter((_, i) => i !== idx);
    });
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: (0, _jsxRuntime.jsxs)("div", {
      className: "modal",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "modal-top",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "modal-handle"
        }), (0, _jsxRuntime.jsx)("h3", {
          children: "\u8A2D\u5B9A"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "modal-scroll",
        children: [(0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 20
          },
          children: [(0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--ink-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "'DM Mono',monospace",
              marginBottom: 10
            },
            children: "\u670D\u85E5\u63D0\u9192\u901A\u77E5"
          }), (0, _jsxRuntime.jsx)("div", {
            style: {
              background: "white",
              borderRadius: 12,
              border: "1.5px solid var(--border)",
              padding: "0 16px",
              marginBottom: 10
            },
            children: (0, _jsxRuntime.jsxs)("div", {
              className: "settings-row",
              children: [(0, _jsxRuntime.jsxs)("div", {
                children: [(0, _jsxRuntime.jsx)("div", {
                  className: "settings-label",
                  children: "\u63A8\u64AD\u901A\u77E5"
                }), (0, _jsxRuntime.jsx)("div", {
                  className: "settings-sub",
                  children: typeof Notification === "undefined" ? "此裝置不支援通知" : Notification.permission === "denied" ? "⚠ 已被封鎖，請至瀏覽器設定手動開啟" : notifOk ? "已開啟" : "尚未開啟"
                })]
              }), notifOk ? (0, _jsxRuntime.jsx)("span", {
                style: {
                  fontSize: "1.3rem"
                },
                children: "\u2705"
              }) : typeof Notification !== "undefined" && Notification.permission !== "denied" && (0, _jsxRuntime.jsx)("button", {
                className: "btn btn-sm",
                style: {
                  background: "var(--sage)",
                  color: "white",
                  border: "none",
                  flexShrink: 0
                },
                onClick: askNotif,
                children: "\u958B\u555F"
              })]
            })
          }), (0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: "0.78rem",
              color: "var(--ink-light)",
              marginBottom: 8,
              fontWeight: 500
            },
            children: "\u6BCF\u65E5\u63D0\u9192\u6642\u9593"
          }), (0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: "0.72rem",
              color: "var(--ink-muted)",
              marginBottom: 10,
              lineHeight: 1.5
            },
            children: "\u5230\u6642\u9593\u81EA\u52D5\u63A8\u64AD\u300C\u966A\u4E00\u523B\uFF5C\u8A72\u5403\u85E5\u4E86\u300D\uFF0C\u53EF\u8A2D\u5B9A\u591A\u7D44\u3002"
          }), reminderTimes.map((t, idx) => (0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8
            },
            children: [(0, _jsxRuntime.jsx)("input", {
              type: "time",
              value: t,
              style: {
                flex: 1,
                marginTop: 0
              },
              onChange: e => updateReminderTime(idx, e.target.value)
            }), (0, _jsxRuntime.jsx)("button", {
              className: "btn-icon",
              onClick: () => removeReminderTime(idx),
              style: {
                flexShrink: 0
              },
              children: (0, _jsxRuntime.jsx)("svg", {
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2.2",
                style: {
                  width: 18,
                  height: 18
                },
                children: (0, _jsxRuntime.jsx)("path", {
                  d: "M18 6L6 18M6 6l12 12"
                })
              })
            })]
          }, idx)), (0, _jsxRuntime.jsx)("button", {
            className: "btn btn-secondary",
            style: {
              marginTop: 4
            },
            onClick: addReminderTime,
            children: "\uFF0B \u65B0\u589E\u63D0\u9192\u6642\u9593"
          }), reminderTimes.length > 0 && !notifOk && (0, _jsxRuntime.jsx)("p", {
            style: {
              fontSize: "0.72rem",
              color: "var(--rose)",
              marginTop: 10,
              lineHeight: 1.5
            },
            children: "\u26A0 \u8ACB\u5148\u958B\u555F\u63A8\u64AD\u901A\u77E5\uFF0C\u63D0\u9192\u624D\u80FD\u6B63\u5E38\u904B\u4F5C\u3002"
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 20
          },
          children: [(0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--ink-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "'DM Mono',monospace",
              marginBottom: 10
            },
            children: "\u65E5\u671F\u8A2D\u5B9A"
          }), (0, _jsxRuntime.jsx)("div", {
            style: {
              background: "white",
              borderRadius: 12,
              border: "1.5px solid var(--border)",
              padding: "0 16px"
            },
            children: (0, _jsxRuntime.jsxs)("div", {
              className: "settings-row",
              children: [(0, _jsxRuntime.jsxs)("div", {
                children: [(0, _jsxRuntime.jsx)("div", {
                  className: "settings-label",
                  children: "\u63DB\u65E5\u6642\u9593"
                }), (0, _jsxRuntime.jsx)("div", {
                  className: "settings-sub",
                  children: "\u5E7E\u9EDE\u4EE5\u524D\u4ECD\u7B97\u524D\u4E00\u5929\uFF08\u9810\u8A2D 4:00\uFF09"
                })]
              }), (0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: 0,
                max: 11,
                value: hr,
                style: {
                  width: 64,
                  marginTop: 0,
                  textAlign: "center",
                  flexShrink: 0
                },
                onChange: e => update(s => {
                  s.settings.dayResetHour = Number(e.target.value);
                })
              })]
            })
          })]
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-secondary",
          style: {
            marginTop: 0
          },
          onClick: onClose,
          children: "\u95DC\u9589"
        })]
      })]
    })
  });
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({
  state,
  update,
  onClose,
  showToast
}) {
  const u = state.currentUser;
  function logout() {
    // Clear from both state and localStorage backup
    try { localStorage.removeItem("peiYike_v3_user"); } catch(e) {}
    update(s => { s.currentUser = null; });
    onClose();
  }
  function resetAll() {
    if (!window.confirm("⚠️ 確定清除所有資料？此操作無法還原。")) return;
    [STORAGE_KEY, STORAGE_KEY + "_user", "peiYike_v2", "peiYike_v1"].forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: (0, _jsxRuntime.jsxs)("div", {
      className: "modal",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "modal-top",
        children: [(0, _jsxRuntime.jsx)("div", {
          className: "modal-handle"
        }), (0, _jsxRuntime.jsx)("h3", {
          children: "\u5E33\u865F"
        })]
      }), (0, _jsxRuntime.jsxs)("div", {
        className: "modal-scroll",
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "pair-info",
          children: [(0, _jsxRuntime.jsx)("span", {
            children: "\uD83D\uDC64"
          }), (0, _jsxRuntime.jsxs)("span", {
            children: [u.name, " \xB7 ", u.role === "user" ? "用藥者" : "陪伴者（檢視）"]
          })]
        }), u.role === "user" && (0, _jsxRuntime.jsxs)("div", {
          className: "pair-code-display",
          children: [(0, _jsxRuntime.jsx)("div", {
            className: "code",
            children: u.pairCode
          }), (0, _jsxRuntime.jsx)("small", {
            children: "\u628A\u9019\u7D44\u9080\u8ACB\u78BC\u5206\u4EAB\u7D66\u4F60\u7684\u966A\u4F34\u8005"
          })]
        }), (0, _jsxRuntime.jsx)("hr", {
          className: "divider"
        }), (0, _jsxRuntime.jsxs)("p", {
          style: {
            fontSize: "0.78rem",
            color: "var(--ink-muted)",
            marginBottom: 16,
            lineHeight: 1.7
          },
          children: [(Array.isArray(state.medications) ? state.medications : []).length, " \u7A2E\u85E5\u7269 \xB7 ", Object.keys(state.scheduleLog || {}).length, " \u7B46\u670D\u85E5\u7D00\u9304 \xB7 ", (Array.isArray(state.doctorVisits) ? state.doctorVisits : []).length, " \u7B46\u770B\u8A3A\u7D00\u9304"]
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-secondary",
          style: {
            marginBottom: 8,
            marginTop: 0
          },
          onClick: logout,
          children: "\u767B\u51FA\u5E33\u865F\uFF08\u4FDD\u7559\u6240\u6709\u8CC7\u6599\uFF09"
        }), (0, _jsxRuntime.jsx)("div", {
          style: {
            background: "var(--amber-pale)",
            border: "1.5px solid #DFC070",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: "0.75rem",
            color: "var(--amber)",
            lineHeight: 1.6
          },
          children: "\u26A0 \u767B\u51FA \u2260 \u6E05\u9664\u8CC7\u6599\u3002\u767B\u51FA\u53EA\u662F\u63DB\u4EBA\u767B\u5165\uFF0C\u6240\u6709\u7D00\u9304\u4ECD\u7136\u4FDD\u7559\u3002"
        }), u.role === "user" && (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-danger btn-sm",
          onClick: resetAll,
          children: "\u6E05\u9664\u6240\u6709\u8CC7\u6599\uFF08\u7121\u6CD5\u9084\u539F\uFF09"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-ghost",
          style: {
            marginTop: 10,
            width: "100%"
          },
          onClick: onClose,
          children: "\u53D6\u6D88"
        })]
      })]
    })
  });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardScreen({
  update
}) {
  const [step, setStep] = useState("choose");
  const [name, setName] = useState("");
  const [pairCode] = useState(() => String(Math.floor(Math.random() * 10000)).padStart(4, "0"));
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  function createUser() {
    if (!name.trim()) return;
    const newUser = { id: uid(), name: name.trim(), role: "user", pairCode: pairCode };
    // Write to backup immediately — don't wait for saveState cycle
    try { localStorage.setItem("peiYike_v3_user", JSON.stringify(newUser)); } catch(e) {}
    update(s => {
      s.currentUser = newUser;
      s.ownerPairCode = pairCode;
    });
  }
  function joinAsViewer() {
    if (!name.trim()) return;
    if (joinCode.length !== 4) {
      setJoinError("請輸入完整四位數邀請碼");
      return;
    }
    const existing = loadState();
    if (existing && existing.ownerPairCode && joinCode !== existing.ownerPairCode) {
      setJoinError("邀請碼不正確，請再確認");
      return;
    }
    const viewerUser = { id: uid(), name: name.trim(), role: "viewer", pairCode: joinCode };
    try { localStorage.setItem("peiYike_v3_user", JSON.stringify(viewerUser)); } catch(e) {}
    update(s => { s.currentUser = viewerUser; });
  }
  return (0, _jsxRuntime.jsxs)("div", {
    className: "app",
    children: [(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), (0, _jsxRuntime.jsxs)("div", {
      className: "onboard",
      children: [(0, _jsxRuntime.jsxs)("div", {
        className: "onboard-logo",
        children: [(0, _jsxRuntime.jsx)("h1", {
          children: "\u966A\u4E00\u523B"
        }), (0, _jsxRuntime.jsx)("p", {
          children: "SHARED MEDICATION LOG"
        })]
      }), step === "choose" && (0, _jsxRuntime.jsxs)("div", {
        className: "onboard-card",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u6B61\u8FCE \u2014 \u8ACB\u9078\u64C7\u4F60\u7684\u8EAB\u4EFD"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          onClick: () => setStep("createUser"),
          children: "\u6211\u662F\u7528\u85E5\u8005\uFF08\u672C\u4EBA\uFF09"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-secondary",
          onClick: () => setStep("joinViewer"),
          children: "\u6211\u662F\u966A\u4F34\u8005\uFF08\u9700\u8981\u9080\u8ACB\u78BC\uFF09"
        })]
      }), step === "createUser" && (0, _jsxRuntime.jsxs)("div", {
        className: "onboard-card",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u5EFA\u7ACB\u7528\u85E5\u7D00\u9304"
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u4F60\u7684\u540D\u5B57"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            value: name,
            onChange: e => setName(e.target.value),
            placeholder: "\u8ACB\u8F38\u5165\u540D\u5B57",
            autoFocus: true
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "pair-code-display",
          children: [(0, _jsxRuntime.jsx)("div", {
            className: "code",
            children: pairCode
          }), (0, _jsxRuntime.jsx)("small", {
            children: "\u628A\u9019\u7D44\u9080\u8ACB\u78BC\u5206\u4EAB\u7D66\u4F60\u7684\u966A\u4F34\u8005"
          })]
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          style: {
            marginTop: 8
          },
          onClick: createUser,
          children: "\u958B\u59CB\u8A18\u9304"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-ghost",
          onClick: () => setStep("choose"),
          children: "\u2190 \u8FD4\u56DE"
        })]
      }), step === "joinViewer" && (0, _jsxRuntime.jsxs)("div", {
        className: "onboard-card",
        children: [(0, _jsxRuntime.jsx)("h2", {
          children: "\u52A0\u5165\u966A\u4F34"
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u4F60\u7684\u540D\u5B57"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            value: name,
            onChange: e => setName(e.target.value),
            placeholder: "\u8ACB\u8F38\u5165\u540D\u5B57",
            autoFocus: true
          })]
        }), (0, _jsxRuntime.jsxs)("div", {
          className: "field",
          children: [(0, _jsxRuntime.jsx)("label", {
            children: "\u7528\u85E5\u8005\u7684\u56DB\u4F4D\u6578\u9080\u8ACB\u78BC"
          }), (0, _jsxRuntime.jsx)("input", {
            type: "text",
            maxLength: 4,
            value: joinCode,
            onChange: e => {
              setJoinCode(e.target.value.replace(/\D/g, ""));
              setJoinError("");
            },
            placeholder: "0000",
            style: {
              textAlign: "center",
              fontSize: "1.8rem",
              letterSpacing: "0.4em",
              fontFamily: "'DM Mono',monospace"
            }
          }), joinError && (0, _jsxRuntime.jsx)("p", {
            style: {
              color: "var(--rose)",
              fontSize: "0.75rem",
              marginTop: 6
            },
            children: joinError
          })]
        }), (0, _jsxRuntime.jsx)("p", {
          style: {
            fontSize: "0.75rem",
            color: "var(--ink-muted)",
            marginBottom: 12,
            lineHeight: 1.6
          },
          children: "\u966A\u4F34\u8005\u53EA\u80FD\u95B1\u8B80\uFF0C\u7121\u6CD5\u4FEE\u6539\u4EFB\u4F55\u7D00\u9304\u3002"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-primary",
          onClick: joinAsViewer,
          children: "\u4EE5\u966A\u4F34\u8005\u8EAB\u4EFD\u52A0\u5165"
        }), (0, _jsxRuntime.jsx)("button", {
          className: "btn btn-ghost",
          onClick: () => setStep("choose"),
          children: "\u2190 \u8FD4\u56DE"
        })]
      })]
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTVE9SQUdFX0tFWSIsIlBFUklPRFMiLCJpZCIsImxhYmVsIiwiZGVmYXVsdFRpbWUiLCJpY29uIiwiUEVSSU9EX01BUCIsIk9iamVjdCIsImZyb21FbnRyaWVzIiwibWFwIiwicCIsIkVNUFRZX1NUQVRFIiwiY3VycmVudFVzZXIiLCJvd25lclBhaXJDb2RlIiwibWVkaWNhdGlvbnMiLCJzY2hlZHVsZUxvZyIsImRvc2VMb2dzIiwiZG9jdG9yVmlzaXRzIiwic2V0dGluZ3MiLCJkYXlSZXNldEhvdXIiLCJyZW1pbmRlclRpbWVzIiwidWlkIiwiTWF0aCIsInJhbmRvbSIsInRvU3RyaW5nIiwic2xpY2UiLCJnZXRMb2dpY2FsRGF0ZSIsImgiLCJOdW1iZXIiLCJub3ciLCJEYXRlIiwiZ2V0SG91cnMiLCJkIiwic2V0RGF0ZSIsImdldERhdGUiLCJ0b0lTT1N0cmluZyIsIm5vd0hITU0iLCJ0b1RpbWVTdHJpbmciLCJwZXJpb2RUaW1lIiwic2NoZWQiLCJwZXJpb2RJZCIsImN1c3RvbVRpbWUiLCJ0b01pbnMiLCJoaG1tIiwibSIsInNwbGl0IiwiZG9zZUtleSIsImRhdGVTdHIiLCJtZWRJZCIsIlN0cmluZyIsImVzdGltYXRlRmluaXNoRGF0ZSIsInJlbWFpbmluZyIsImRhaWx5RG9zZSIsImRheXMiLCJmbG9vciIsImlzRmluaXRlIiwiZGF0ZSIsInRvTG9jYWxlRGF0ZVN0cmluZyIsIm1vbnRoIiwiZGF5Iiwic2FmZVBhcnNlSlNPTiIsInJhdyIsIkpTT04iLCJwYXJzZSIsInNhbml0aXplU3RhdGUiLCJzIiwiQXJyYXkiLCJpc0FycmF5Iiwic2FuaXRpemVNZWQiLCJuYW1lIiwic3RhdHVzIiwiaW5jbHVkZXMiLCJ0b3RhbENvdW50IiwicmVtYWluaW5nQ291bnQiLCJjcmVhdGVkQXQiLCJzY2hlZHVsZXMiLCJmaWx0ZXIiLCJCb29sZWFuIiwiZG9zZSIsImRvc2VQZXJUaW1lIiwibG9hZEN1cnJlbnRVc2VyIiwibG9jYWxTdG9yYWdlIiwiZ2V0SXRlbSIsInUiLCJsb2FkU3RhdGUiLCJwYXJzZWQiLCJjbGVhbiIsImsiLCJvbGRSYXciLCJvbGQiLCJtaWdyYXRlZCIsImUiLCJjb25zb2xlIiwid2FybiIsInVzZXIiLCJzYXZlU3RhdGUiLCJzZXRJdGVtIiwic3RyaW5naWZ5IiwicmVtb3ZlSXRlbSIsInJlcXVlc3ROb3RpZiIsIndpbmRvdyIsIk5vdGlmaWNhdGlvbiIsInBlcm1pc3Npb24iLCJyZXN1bHQiLCJyZXF1ZXN0UGVybWlzc2lvbiIsIm5vdGlmeSIsInRpdGxlIiwiYm9keSIsInRhZyIsIkVycm9yQm91bmRhcnkiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJzdGF0ZSIsImNyYXNoZWQiLCJlcnJvciIsImdldERlcml2ZWRTdGF0ZUZyb21FcnJvciIsImNvbXBvbmVudERpZENhdGNoIiwiaW5mbyIsInJlbmRlciIsImNyZWF0ZUVsZW1lbnQiLCJzdHlsZSIsImRpc3BsYXkiLCJmbGV4RGlyZWN0aW9uIiwiYWxpZ25JdGVtcyIsImp1c3RpZnlDb250ZW50IiwibWluSGVpZ2h0IiwicGFkZGluZyIsInRleHRBbGlnbiIsImJhY2tncm91bmQiLCJnYXAiLCJmb250U2l6ZSIsImNvbG9yIiwibGluZUhlaWdodCIsIm1heFdpZHRoIiwib25DbGljayIsImxvY2F0aW9uIiwicmVsb2FkIiwiYm9yZGVyIiwiYm9yZGVyUmFkaXVzIiwiY3Vyc29yIiwiY2xlYXIiLCJjaGlsZHJlbiIsIkNTUyIsIkljbyIsInRvZGF5IiwiX2pzeFJ1bnRpbWUiLCJqc3hzIiwidmlld0JveCIsImZpbGwiLCJzdHJva2UiLCJzdHJva2VXaWR0aCIsImpzeCIsIngiLCJ5Iiwid2lkdGgiLCJoZWlnaHQiLCJyeCIsImN4IiwiY3kiLCJyIiwibWVkcyIsInZpc2l0cyIsInBsdXMiLCJjaGVjayIsImJlbGwiLCJBcHAiLCJzZXRTdGF0ZSIsInVzZVN0YXRlIiwidGFiIiwic2V0VGFiIiwibW9kYWwiLCJzZXRNb2RhbCIsInRvYXN0Iiwic2V0VG9hc3QiLCJub3RpZk9rIiwic2V0Tm90aWZPayIsInNldE5vdyIsImZpcmVkUmVmIiwidXNlUmVmIiwidXNlRWZmZWN0IiwidCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsIm5vd00iLCJnZXRNaW51dGVzIiwiZm9yRWFjaCIsIm1lZCIsImtleSIsImxvZyIsImRpZmYiLCJjdXJyZW50IiwicnQiLCJmaXJlS2V5Iiwic2hvd1RvYXN0IiwidXNlQ2FsbGJhY2siLCJtc2ciLCJzZXRUaW1lb3V0IiwidXBkYXRlIiwiZm4iLCJwcmV2IiwibmV4dCIsImlzVmlld2VyIiwicm9sZSIsImxvZ2ljYWxEYXRlIiwiYWN0aXZlTWVkcyIsIk9uYm9hcmRTY3JlZW4iLCJhc2tOb3RpZiIsIm9rIiwiY2xhc3NOYW1lIiwiZmxleCIsIm92ZXJmbG93IiwiVG9kYXlQYWdlIiwiTWVkc1BhZ2UiLCJWaXNpdHNQYWdlIiwiaXRlbSIsIkFkZE1lZE1vZGFsIiwib25DbG9zZSIsIm9uU2F2ZSIsInB1c2giLCJBZGRWaXNpdE1vZGFsIiwiYWxsTWVkcyIsInZpc2l0IiwidW5zaGlmdCIsImNvbnRpbnVlZCIsIlNldCIsImNvbnRpbnVlZElkcyIsIm5ld0lkcyIsIm5ld01lZHMiLCJubSIsImFkZCIsImhhcyIsIlNldHRpbmdzTW9kYWwiLCJQcm9maWxlTW9kYWwiLCJub3dNaW5zIiwicGVyaW9kR3JvdXBNYXAiLCJwaWQiLCJ0aW1lIiwiZ3JvdXBzIiwidmFsdWVzIiwic29ydCIsImEiLCJiIiwidG90YWxHcm91cHMiLCJsZW5ndGgiLCJkb25lR3JvdXBzIiwiZyIsImV2ZXJ5IiwidGFrZW5BdCIsInBjdCIsInJvdW5kIiwiQ0lSQyIsIlBJIiwibWFya1BlcmlvZFRha2VuIiwiZ3JvdXAiLCJmaW5kIiwibWF4IiwidW5kb1BlcmlvZCIsIm1pbiIsIkZyYWdtZW50Iiwic3Ryb2tlRGFzaGFycmF5Iiwic3Ryb2tlRGFzaG9mZnNldCIsIm1hcmdpblRvcCIsImFsbERvbmUiLCJhbnlEb25lIiwic29tZSIsInRNaW5zIiwiaXNMYXRlIiwiaXNOb3ciLCJjYXJkQ2xhc3MiLCJmaXJzdFRha2VuQXQiLCJhY3RpdmUiLCJwYXVzZWQiLCJ0b2dnbGUiLCJNZWRDYXJkIiwib25Ub2dnbGUiLCJyZWR1Y2UiLCJzYyIsImVzdCIsImxvdyIsImkiLCJtYXJnaW5MZWZ0Iiwic29ydGVkIiwibG9jYWxlQ29tcGFyZSIsImdldE1lZE5hbWUiLCJob3NwaXRhbCIsImRvY3RvciIsIm5vdGUiLCJzdG9wcGVkSWRzIiwiUGVyaW9kU2VsZWN0b3IiLCJzZWxlY3RlZCIsIm9uQ2hhbmdlIiwiaXNTZWxlY3RlZCIsImRlZmF1bHRUIiwidXBkYXRlU2NoZWQiLCJwYXRjaCIsInNlbCIsImZvbnRXZWlnaHQiLCJ3aGl0ZVNwYWNlIiwidHlwZSIsInN0ZXAiLCJ2YWx1ZSIsInRhcmdldCIsInNldE5hbWUiLCJ0b3RhbCIsInNldFRvdGFsIiwic2V0U2NoZWR1bGVzIiwiY3VycmVudFRhcmdldCIsInBsYWNlaG9sZGVyIiwiYXV0b0ZvY3VzIiwibWFyZ2luQm90dG9tIiwidHJpbSIsInRvZGF5U3RyIiwic2V0SG9zcGl0YWwiLCJzZXREb2N0b3IiLCJzZXROb3RlIiwic2V0Q29udGludWVkSWRzIiwic2V0TmV3TWVkcyIsInRvZ2dsZUNvbnRpbnVlIiwiZGVsZXRlIiwiYWRkTmV3TWVkIiwiX2tleSIsInVwZGF0ZU5ld01lZCIsInJlbW92ZU5ld01lZCIsInNhdmUiLCJyb3dzIiwicmVzaXplIiwiY2hlY2tlZCIsImpvaW4iLCJzY2hlZHMiLCJociIsImFkZFJlbWluZGVyVGltZSIsInVwZGF0ZVJlbWluZGVyVGltZSIsImlkeCIsInZhbCIsImFyciIsInJlbW92ZVJlbWluZGVyVGltZSIsIl8iLCJsZXR0ZXJTcGFjaW5nIiwidGV4dFRyYW5zZm9ybSIsImZvbnRGYW1pbHkiLCJmbGV4U2hyaW5rIiwibG9nb3V0IiwicmVzZXRBbGwiLCJjb25maXJtIiwicGFpckNvZGUiLCJrZXlzIiwic2V0U3RlcCIsInBhZFN0YXJ0Iiwiam9pbkNvZGUiLCJzZXRKb2luQ29kZSIsImpvaW5FcnJvciIsInNldEpvaW5FcnJvciIsImNyZWF0ZVVzZXIiLCJqb2luQXNWaWV3ZXIiLCJleGlzdGluZyIsIm1heExlbmd0aCIsInJlcGxhY2UiXSwic291cmNlcyI6WyJhcHAuanN4Il0sInNvdXJjZXNDb250ZW50IjpbIi8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuLy8g6Zmq5LiA5Yi7IOKAlCBNYWluIEFwcFxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG5cbi8vIOKUgOKUgOKUgCAxLiBDT05TVEFOVFMgKG11c3QgYmUgZmlyc3Qg4oCUIGV2ZXJ5dGhpbmcgYmVsb3cgcmVmZXJlbmNlcyB0aGVzZSkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5jb25zdCBTVE9SQUdFX0tFWSA9IFwicGVpWWlrZV92M1wiO1xuXG5jb25zdCBQRVJJT0RTID0gW1xuICB7IGlkOiBcImJyZWFrZmFzdF9iZWZvcmVcIiwgbGFiZWw6IFwi5pep6aSQ5YmNXCIsICAgZGVmYXVsdFRpbWU6IFwiMDc6MzBcIiwgaWNvbjogXCLwn4yFXCIgfSxcbiAgeyBpZDogXCJicmVha2Zhc3RfYWZ0ZXJcIiwgIGxhYmVsOiBcIuaXqemkkOW+jFwiLCAgIGRlZmF1bHRUaW1lOiBcIjA4OjAwXCIsIGljb246IFwi8J+Ns1wiIH0sXG4gIHsgaWQ6IFwibHVuY2hfYmVmb3JlXCIsICAgICBsYWJlbDogXCLljYjppJDliY1cIiwgICBkZWZhdWx0VGltZTogXCIxMTozMFwiLCBpY29uOiBcIuKYgO+4j1wiIH0sXG4gIHsgaWQ6IFwibHVuY2hfYWZ0ZXJcIiwgICAgICBsYWJlbDogXCLljYjppJDlvoxcIiwgICBkZWZhdWx0VGltZTogXCIxMjozMFwiLCBpY29uOiBcIvCfpZdcIiB9LFxuICB7IGlkOiBcImRpbm5lcl9iZWZvcmVcIiwgICAgbGFiZWw6IFwi5pma6aSQ5YmNXCIsICAgZGVmYXVsdFRpbWU6IFwiMTc6MzBcIiwgaWNvbjogXCLwn4yHXCIgfSxcbiAgeyBpZDogXCJkaW5uZXJfYWZ0ZXJcIiwgICAgIGxhYmVsOiBcIuaZmumkkOW+jFwiLCAgIGRlZmF1bHRUaW1lOiBcIjE4OjMwXCIsIGljb246IFwi8J+NnFwiIH0sXG4gIHsgaWQ6IFwiYmVkdGltZVwiLCAgICAgICAgICBsYWJlbDogXCLnnaHliY1cIiwgICAgIGRlZmF1bHRUaW1lOiBcIjIyOjAwXCIsIGljb246IFwi8J+MmVwiIH0sXG4gIHsgaWQ6IFwiY3VzdG9tXCIsICAgICAgICAgICBsYWJlbDogXCLoh6roqILmmYLplpNcIiwgZGVmYXVsdFRpbWU6IFwiMDk6MDBcIiwgaWNvbjogXCLij7BcIiB9LFxuXTtcbmNvbnN0IFBFUklPRF9NQVAgPSBPYmplY3QuZnJvbUVudHJpZXMoUEVSSU9EUy5tYXAocCA9PiBbcC5pZCwgcF0pKTtcblxuLy8g4pSA4pSA4pSAIDIuIEVNUFRZIFNUQVRFIChtdXN0IGJlIGJlZm9yZSBsb2FkU3RhdGUpIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuY29uc3QgRU1QVFlfU1RBVEUgPSB7XG4gIGN1cnJlbnRVc2VyOiAgIG51bGwsXG4gIG93bmVyUGFpckNvZGU6IG51bGwsXG4gIG1lZGljYXRpb25zOiAgIFtdLFxuICBzY2hlZHVsZUxvZzogICB7fSxcbiAgZG9zZUxvZ3M6ICAgICAgW10sXG4gIGRvY3RvclZpc2l0czogIFtdLFxuICBzZXR0aW5nczogICAgICB7IGRheVJlc2V0SG91cjogNCwgcmVtaW5kZXJUaW1lczogW10gfSxcbn07XG5cbi8vIOKUgOKUgOKUgCAzLiBIRUxQRVJTIChtdXN0IGJlIGJlZm9yZSBzdG9yYWdlKSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIHVpZCgpICB7IHJldHVybiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCAxMCk7IH1cblxuZnVuY3Rpb24gZ2V0TG9naWNhbERhdGUoZGF5UmVzZXRIb3VyKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgaCA9IE51bWJlcihkYXlSZXNldEhvdXIpIHx8IDQ7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBpZiAobm93LmdldEhvdXJzKCkgPCBoKSB7XG4gICAgICBjb25zdCBkID0gbmV3IERhdGUobm93KTsgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpIC0gMSk7XG4gICAgICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgICB9XG4gICAgcmV0dXJuIG5vdy50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgfSBjYXRjaCB7IHJldHVybiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApOyB9XG59XG5cbmZ1bmN0aW9uIG5vd0hITU0oKSB7XG4gIHRyeSB7IHJldHVybiBuZXcgRGF0ZSgpLnRvVGltZVN0cmluZygpLnNsaWNlKDAsIDUpOyB9IGNhdGNoIHsgcmV0dXJuIFwiMDA6MDBcIjsgfVxufVxuXG5mdW5jdGlvbiBwZXJpb2RUaW1lKHNjaGVkKSB7XG4gIGlmICghc2NoZWQpIHJldHVybiBcIjA4OjAwXCI7XG4gIGlmIChzY2hlZC5wZXJpb2RJZCA9PT0gXCJjdXN0b21cIiAmJiBzY2hlZC5jdXN0b21UaW1lKSByZXR1cm4gc2NoZWQuY3VzdG9tVGltZTtcbiAgcmV0dXJuIChQRVJJT0RfTUFQW3NjaGVkLnBlcmlvZElkXSA/IFBFUklPRF9NQVBbc2NoZWQucGVyaW9kSWRdLmRlZmF1bHRUaW1lIDogXCIwODowMFwiKSB8fCBcIjA4OjAwXCI7XG59XG5cbmZ1bmN0aW9uIHRvTWlucyhoaG1tKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgW2gsIG1dID0gKGhobW0gfHwgXCIwMDowMFwiKS5zcGxpdChcIjpcIikubWFwKE51bWJlcik7XG4gICAgcmV0dXJuIChoIHx8IDApICogNjAgKyAobSB8fCAwKTtcbiAgfSBjYXRjaCB7IHJldHVybiAwOyB9XG59XG5cbmZ1bmN0aW9uIGRvc2VLZXkoZGF0ZVN0ciwgbWVkSWQsIHBlcmlvZElkKSB7XG4gIHJldHVybiBTdHJpbmcoZGF0ZVN0cikgKyBcInxcIiArIFN0cmluZyhtZWRJZCkgKyBcInxcIiArIFN0cmluZyhwZXJpb2RJZCk7XG59XG5cbmZ1bmN0aW9uIGVzdGltYXRlRmluaXNoRGF0ZShyZW1haW5pbmcsIGRhaWx5RG9zZSkge1xuICB0cnkge1xuICAgIGlmICghZGFpbHlEb3NlIHx8IGRhaWx5RG9zZSA8PSAwIHx8ICFyZW1haW5pbmcgfHwgcmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGRheXMgPSBNYXRoLmZsb29yKHJlbWFpbmluZyAvIGRhaWx5RG9zZSk7XG4gICAgaWYgKCFpc0Zpbml0ZShkYXlzKSB8fCBkYXlzIDwgMCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZCA9IG5ldyBEYXRlKCk7IGQuc2V0RGF0ZShkLmdldERhdGUoKSArIGRheXMpO1xuICAgIHJldHVybiB7IGRheXMsIGRhdGU6IGQudG9Mb2NhbGVEYXRlU3RyaW5nKFwiemgtVFdcIiwgeyBtb250aDogXCJudW1lcmljXCIsIGRheTogXCJudW1lcmljXCIgfSkgfTtcbiAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG59XG5cbi8vIOKUgOKUgOKUgCA0LiBTVE9SQUdFIChkZXBlbmRzIG9uIEVNUFRZX1NUQVRFICsgaGVscGVycykg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5mdW5jdGlvbiBzYWZlUGFyc2VKU09OKHJhdykge1xuICB0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShyYXcpOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbn1cblxuZnVuY3Rpb24gc2FuaXRpemVTdGF0ZShzKSB7XG4gIC8vIEVuc3VyZSBhbGwgcmVxdWlyZWQga2V5cyBleGlzdCBhbmQgaGF2ZSBjb3JyZWN0IHR5cGVzXG4gIGlmICghcyB8fCB0eXBlb2YgcyAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgY3VycmVudFVzZXI6ICAgcy5jdXJyZW50VXNlciAgIHx8IG51bGwsXG4gICAgb3duZXJQYWlyQ29kZTogcy5vd25lclBhaXJDb2RlIHx8IG51bGwsXG4gICAgbWVkaWNhdGlvbnM6ICAgQXJyYXkuaXNBcnJheShzLm1lZGljYXRpb25zKSAgID8gcy5tZWRpY2F0aW9ucy5tYXAoc2FuaXRpemVNZWQpICAgOiBbXSxcbiAgICBzY2hlZHVsZUxvZzogICAocy5zY2hlZHVsZUxvZyAmJiB0eXBlb2Ygcy5zY2hlZHVsZUxvZyA9PT0gXCJvYmplY3RcIikgPyBzLnNjaGVkdWxlTG9nIDoge30sXG4gICAgZG9zZUxvZ3M6ICAgICAgQXJyYXkuaXNBcnJheShzLmRvc2VMb2dzKSAgICAgICA/IHMuZG9zZUxvZ3MgICAgICAgOiBbXSxcbiAgICBkb2N0b3JWaXNpdHM6ICBBcnJheS5pc0FycmF5KHMuZG9jdG9yVmlzaXRzKSAgID8gcy5kb2N0b3JWaXNpdHMgICA6IFtdLFxuICAgIHNldHRpbmdzOiB7XG4gICAgICBkYXlSZXNldEhvdXI6ICBOdW1iZXIoKHMuc2V0dGluZ3MgJiYgcy5zZXR0aW5ncy5kYXlSZXNldEhvdXIpKSAgfHwgNCxcbiAgICAgIHJlbWluZGVyVGltZXM6IEFycmF5LmlzQXJyYXkoKHMuc2V0dGluZ3MgJiYgcy5zZXR0aW5ncy5yZW1pbmRlclRpbWVzKSkgPyBzLnNldHRpbmdzLnJlbWluZGVyVGltZXMgOiBbXSxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZU1lZChtKSB7XG4gIGlmICghbSB8fCB0eXBlb2YgbSAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6ICAgICAgICAgICAgIG0uaWQgICAgICAgICAgICAgfHwgdWlkKCksXG4gICAgbmFtZTogICAgICAgICAgIFN0cmluZyhtLm5hbWUgICAgfHwgXCLmnKrnn6Xol6XnialcIiksXG4gICAgc3RhdHVzOiAgICAgICAgIFtcImFjdGl2ZVwiLFwicGF1c2VkXCIsXCJjb21wbGV0ZWRcIl0uaW5jbHVkZXMobS5zdGF0dXMpID8gbS5zdGF0dXMgOiBcImFjdGl2ZVwiLFxuICAgIHRvdGFsQ291bnQ6ICAgICBOdW1iZXIobS50b3RhbENvdW50KSAgICAgfHwgMCxcbiAgICByZW1haW5pbmdDb3VudDogTnVtYmVyKG0ucmVtYWluaW5nQ291bnQpIHx8IDAsXG4gICAgY3JlYXRlZEF0OiAgICAgIG0uY3JlYXRlZEF0ICAgICAgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIHNjaGVkdWxlczogICAgICBBcnJheS5pc0FycmF5KG0uc2NoZWR1bGVzKSA/IG0uc2NoZWR1bGVzLmZpbHRlcihCb29sZWFuKSA6XG4gICAgICAgICAgICAgICAgICAgIFt7IHBlcmlvZElkOiBcImJyZWFrZmFzdF9hZnRlclwiLCBjdXN0b21UaW1lOiBudWxsLCBkb3NlOiBOdW1iZXIobS5kb3NlUGVyVGltZSkgfHwgMSB9XSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbG9hZEN1cnJlbnRVc2VyKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZICsgXCJfdXNlclwiKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgdSA9IHNhZmVQYXJzZUpTT04ocmF3KTtcbiAgICBpZiAoIXUgfHwgIXUuaWQgfHwgIXUubmFtZSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHU7XG4gIH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfVxufVxuXG5mdW5jdGlvbiBsb2FkU3RhdGUoKSB7XG4gIHRyeSB7XG4gICAgLy8gVHJ5IHByaW1hcnkgc3RvcmFnZVxuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICBpZiAocmF3KSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBzYWZlUGFyc2VKU09OKHJhdyk7XG4gICAgICBjb25zdCBjbGVhbiAgPSBzYW5pdGl6ZVN0YXRlKHBhcnNlZCk7XG4gICAgICBpZiAoY2xlYW4pIHtcbiAgICAgICAgaWYgKCFjbGVhbi5jdXJyZW50VXNlcikgY2xlYW4uY3VycmVudFVzZXIgPSBsb2FkQ3VycmVudFVzZXIoKTtcbiAgICAgICAgcmV0dXJuIGNsZWFuO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBUcnkgbWlncmF0aW5nIHYxL3YyXG4gICAgZm9yIChjb25zdCBrIG9mIFtcInBlaVlpa2VfdjJcIiwgXCJwZWlZaWtlX3YxXCJdKSB7XG4gICAgICBjb25zdCBvbGRSYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrKTtcbiAgICAgIGlmICghb2xkUmF3KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG9sZCA9IHNhZmVQYXJzZUpTT04ob2xkUmF3KTtcbiAgICAgIGlmICghb2xkKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG1pZ3JhdGVkID0gc2FuaXRpemVTdGF0ZSh7XG4gICAgICAgIC4uLkVNUFRZX1NUQVRFLFxuICAgICAgICBjdXJyZW50VXNlcjogICBvbGQuY3VycmVudFVzZXIgICB8fCBudWxsLFxuICAgICAgICBvd25lclBhaXJDb2RlOiBvbGQub3duZXJQYWlyQ29kZSB8fCBudWxsLFxuICAgICAgICBtZWRpY2F0aW9uczogICBvbGQubWVkaWNhdGlvbnMgICB8fCBbXSxcbiAgICAgICAgZG9zZUxvZ3M6ICAgICAgb2xkLmRvc2VMb2dzICAgICAgfHwgW10sXG4gICAgICAgIHNjaGVkdWxlTG9nOiAgIG9sZC5zY2hlZHVsZUxvZyAgIHx8IHt9LFxuICAgICAgICBkb2N0b3JWaXNpdHM6ICBvbGQuZG9jdG9yVmlzaXRzICB8fCBbXSxcbiAgICAgICAgc2V0dGluZ3M6ICAgICAgeyBkYXlSZXNldEhvdXI6IChvbGQuc2V0dGluZ3MgJiYgb2xkLnNldHRpbmdzLmRheVJlc2V0SG91cikgfHwgNCwgcmVtaW5kZXJUaW1lczogW10gfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKG1pZ3JhdGVkKSB7XG4gICAgICAgIGlmICghbWlncmF0ZWQuY3VycmVudFVzZXIpIG1pZ3JhdGVkLmN1cnJlbnRVc2VyID0gbG9hZEN1cnJlbnRVc2VyKCk7XG4gICAgICAgIHJldHVybiBtaWdyYXRlZDtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJb6Zmq5LiA5Yi7XSBsb2FkU3RhdGUgZXJyb3I6XCIsIGUpO1xuICB9XG4gIC8vIEZhbGxiYWNrOiBmcmVzaCBzdGF0ZSwgYnV0IHRyeSB0byByZWNvdmVyIHVzZXIgaWRlbnRpdHlcbiAgY29uc3QgdXNlciA9IGxvYWRDdXJyZW50VXNlcigpO1xuICBpZiAodXNlcikgcmV0dXJuIHsgLi4uRU1QVFlfU1RBVEUsIGN1cnJlbnRVc2VyOiB1c2VyIH07XG4gIHJldHVybiB7IC4uLkVNUFRZX1NUQVRFIH07XG59XG5cbmZ1bmN0aW9uIHNhdmVTdGF0ZShzKSB7XG4gIHRyeSB7XG4gICAgaWYgKCFzIHx8IHR5cGVvZiBzICE9PSBcIm9iamVjdFwiKSByZXR1cm47XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHMpKTtcbiAgICBpZiAocy5jdXJyZW50VXNlciAmJiBzLmN1cnJlbnRVc2VyLmlkKSB7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSArIFwiX3VzZXJcIiwgSlNPTi5zdHJpbmdpZnkocy5jdXJyZW50VXNlcikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX0tFWSArIFwiX3VzZXJcIik7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiW+mZquS4gOWIu10gc2F2ZVN0YXRlIGVycm9yOlwiLCBlKTtcbiAgfVxufVxuXG4vLyDilIDilIDilIAgNS4gTk9USUZJQ0FUSU9OUyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmFzeW5jIGZ1bmN0aW9uIHJlcXVlc3ROb3RpZigpIHtcbiAgdHJ5IHtcbiAgICBpZiAoIShcIk5vdGlmaWNhdGlvblwiIGluIHdpbmRvdykpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gPT09IFwiZ3JhbnRlZFwiKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gPT09IFwiZGVuaWVkXCIpICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgTm90aWZpY2F0aW9uLnJlcXVlc3RQZXJtaXNzaW9uKCk7XG4gICAgcmV0dXJuIHJlc3VsdCA9PT0gXCJncmFudGVkXCI7XG4gIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbn1cblxuZnVuY3Rpb24gbm90aWZ5KHRpdGxlLCBib2R5KSB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiBOb3RpZmljYXRpb24gPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICBpZiAoTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gIT09IFwiZ3JhbnRlZFwiKSByZXR1cm47XG4gICAgbmV3IE5vdGlmaWNhdGlvbih0aXRsZSwgeyBib2R5LCB0YWc6IFwicGVpWWlrZVwiLCBpY29uOiBcIi9pY29ucy9pY29uLTE5Mi5wbmdcIiB9KTtcbiAgfSBjYXRjaCB7fVxufVxuXG4vLyDilIDilIDilIAgNi4gRVJST1IgQk9VTkRBUlkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5jbGFzcyBFcnJvckJvdW5kYXJ5IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50IHtcbiAgY29uc3RydWN0b3IocHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcyk7XG4gICAgdGhpcy5zdGF0ZSA9IHsgY3Jhc2hlZDogZmFsc2UsIGVycm9yOiBudWxsIH07XG4gIH1cbiAgc3RhdGljIGdldERlcml2ZWRTdGF0ZUZyb21FcnJvcihlcnJvcikge1xuICAgIHJldHVybiB7IGNyYXNoZWQ6IHRydWUsIGVycm9yIH07XG4gIH1cbiAgY29tcG9uZW50RGlkQ2F0Y2goZXJyb3IsIGluZm8pIHtcbiAgICBjb25zb2xlLmVycm9yKFwiW+mZquS4gOWIuyBFcnJvckJvdW5kYXJ5XVwiLCBlcnJvciwgaW5mbyk7XG4gIH1cbiAgcmVuZGVyKCkge1xuICAgIGlmICh0aGlzLnN0YXRlLmNyYXNoZWQpIHtcbiAgICAgIHJldHVybiBSZWFjdC5jcmVhdGVFbGVtZW50KFwiZGl2XCIsIHtcbiAgICAgICAgc3R5bGU6IHtcbiAgICAgICAgICBkaXNwbGF5OlwiZmxleFwiLCBmbGV4RGlyZWN0aW9uOlwiY29sdW1uXCIsIGFsaWduSXRlbXM6XCJjZW50ZXJcIixcbiAgICAgICAgICBqdXN0aWZ5Q29udGVudDpcImNlbnRlclwiLCBtaW5IZWlnaHQ6XCIxMDBzdmhcIiwgcGFkZGluZzpcIjMycHhcIixcbiAgICAgICAgICB0ZXh0QWxpZ246XCJjZW50ZXJcIiwgYmFja2dyb3VuZDpcIiNGQUY3RjJcIiwgZ2FwOjE2LFxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KFwiZGl2XCIsIHtzdHlsZTp7Zm9udFNpemU6XCIycmVtXCJ9fSwgXCLwn5iVXCIpLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KFwiaDJcIiwge3N0eWxlOntmb250U2l6ZTpcIjEuMXJlbVwiLGNvbG9yOlwiIzIzMUMxMFwifX0sIFwi55m855Sf6Yyv6KqkXCIpLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KFwicFwiLCB7c3R5bGU6e2ZvbnRTaXplOlwiMC44MnJlbVwiLGNvbG9yOlwiIzk5ODg3MFwiLGxpbmVIZWlnaHQ6MS42LG1heFdpZHRoOjMwMH19LFxuICAgICAgICAgIFwi5oeJ55So56iL5byP55m855Sf5LqG5oSP5aSW6Yyv6Kqk44CC6KuL6bue5pOK5LiL5pa56YeN5paw5ZWf5YuV44CCXCJcbiAgICAgICAgKSxcbiAgICAgICAgUmVhY3QuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiLCB7XG4gICAgICAgICAgb25DbGljazogKCkgPT4gd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpLFxuICAgICAgICAgIHN0eWxlOiB7cGFkZGluZzpcIjEycHggMjRweFwiLGJhY2tncm91bmQ6XCIjQzQ3ODVBXCIsY29sb3I6XCJ3aGl0ZVwiLGJvcmRlcjpcIm5vbmVcIixib3JkZXJSYWRpdXM6MTAsZm9udFNpemU6XCIwLjlyZW1cIixjdXJzb3I6XCJwb2ludGVyXCJ9XG4gICAgICAgIH0sIFwi6YeN5paw5ZWf5YuVXCIpLFxuICAgICAgICBSZWFjdC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIsIHtcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB7IHRyeSB7IGxvY2FsU3RvcmFnZS5jbGVhcigpOyB9IGNhdGNoKGUpe30gd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpOyB9LFxuICAgICAgICAgIHN0eWxlOiB7cGFkZGluZzpcIjEwcHggMjBweFwiLGJhY2tncm91bmQ6XCIjOTk4ODcwXCIsY29sb3I6XCJ3aGl0ZVwiLGJvcmRlcjpcIm5vbmVcIixib3JkZXJSYWRpdXM6MTAsZm9udFNpemU6XCIwLjgycmVtXCIsY3Vyc29yOlwicG9pbnRlclwifVxuICAgICAgICB9LCBcIua4hemZpOizh+aWmeS4pumHjeWVn1wiKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucHJvcHMuY2hpbGRyZW47XG4gIH1cbn1cbndpbmRvdy5FcnJvckJvdW5kYXJ5ID0gRXJyb3JCb3VuZGFyeTtcblxuXG5jb25zdCBDU1MgPSBgXG5AaW1wb3J0IHVybCgnaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1Ob3RvK1NlcmlmK1RDOndnaHRANDAwOzUwMDs2MDAmZmFtaWx5PURNK01vbm86d2dodEA0MDA7NTAwJmRpc3BsYXk9c3dhcCcpO1xuXG4qLCAqOjpiZWZvcmUsICo6OmFmdGVyIHsgYm94LXNpemluZzogYm9yZGVyLWJveDsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwOyB9XG5cbjpyb290IHtcbiAgLS1jcmVhbTogICAgICAgI0Y1RjBFODtcbiAgLS13YXJtOiAgICAgICAgI0VERTZENjtcbiAgLS1wYXBlcjogICAgICAgI0ZBRjdGMjtcbiAgLS1pbms6ICAgICAgICAgIzIzMUMxMDtcbiAgLS1pbmstbGlnaHQ6ICAgIzVDNEYzQTtcbiAgLS1pbmstbXV0ZWQ6ICAgIzk5ODg3MDtcbiAgLS1yb3NlOiAgICAgICAgI0M0Nzg1QTtcbiAgLS1yb3NlLWRhcms6ICAgI0E4NjIzRjtcbiAgLS1yb3NlLWxpZ2h0OiAgI0U4QzRCMjtcbiAgLS1yb3NlLXBhbGU6ICAgI0Y1RTZERTtcbiAgLS1zYWdlOiAgICAgICAgIzZBOTQ3ODtcbiAgLS1zYWdlLWRhcms6ICAgIzU1N0E2MjtcbiAgLS1zYWdlLWxpZ2h0OiAgI0I4RDVDNDtcbiAgLS1zYWdlLXBhbGU6ICAgI0U4RjNFQztcbiAgLS1hbWJlcjogICAgICAgI0M4OTIyQTtcbiAgLS1hbWJlci1wYWxlOiAgI0Y1RThDQztcbiAgLS1ib3JkZXI6ICAgICAgcmdiYSgzNSwyOCwxNiwwLjEzKTtcbiAgLS1zaGFkb3ctc206ICAgMCAxcHggNHB4IHJnYmEoMzUsMjgsMTYsMC4wNyk7XG4gIC0tc2hhZG93OiAgICAgIDAgM3B4IDE2cHggcmdiYSgzNSwyOCwxNiwwLjEwKTtcbiAgLS1yYWRpdXM6ICAgICAgMTZweDtcbiAgLS1yYWRpdXMtc206ICAgMTBweDtcbn1cblxuaHRtbCwgYm9keSB7IGhlaWdodDogMTAwJTsgYmFja2dyb3VuZDogdmFyKC0tY3JlYW0pOyB9XG5cbmJvZHkge1xuICBmb250LWZhbWlseTogJ05vdG8gU2VyaWYgVEMnLCBzZXJpZjtcbiAgY29sb3I6IHZhcigtLWluayk7XG4gIGZvbnQtc2l6ZTogMTVweDtcbiAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gIC13ZWJraXQtZm9udC1zbW9vdGhpbmc6IGFudGlhbGlhc2VkO1xufVxuXG4uYXBwIHtcbiAgbWF4LXdpZHRoOiA0MzBweDtcbiAgbWFyZ2luOiAwIGF1dG87XG4gIG1pbi1oZWlnaHQ6IDEwMHN2aDtcbiAgZGlzcGxheTogZmxleDtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgYmFja2dyb3VuZDogdmFyKC0tcGFwZXIpO1xuICBib3gtc2hhZG93OiAwIDAgNjBweCByZ2JhKDM1LDI4LDE2LDAuMTIpO1xufVxuXG4vKiDilIDilIAgT25ib2FyZGluZyDilIDilIAgKi9cbi5vbmJvYXJkIHtcbiAgZmxleDogMTsgZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIHBhZGRpbmc6IDQ4cHggMjhweDsgZ2FwOiAzMnB4O1xuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTYwZGVnLCB2YXIoLS1wYXBlcikgNTUlLCB2YXIoLS1yb3NlLXBhbGUpKTtcbn1cbi5vbmJvYXJkLWxvZ28gaDEge1xuICBmb250LXNpemU6IDIuOHJlbTsgZm9udC13ZWlnaHQ6IDUwMDsgbGV0dGVyLXNwYWNpbmc6IDAuMWVtO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiB2YXIoLS1pbmspOyBsaW5lLWhlaWdodDogMS4xNTtcbn1cbi5vbmJvYXJkLWxvZ28gcCB7XG4gIGZvbnQtc2l6ZTogMC43MnJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IGxldHRlci1zcGFjaW5nOiAwLjI1ZW07XG4gIGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgdGV4dC1hbGlnbjogY2VudGVyOyBtYXJnaW4tdG9wOiA2cHg7XG59XG4ub25ib2FyZC1jYXJkIHtcbiAgd2lkdGg6IDEwMCU7IGJhY2tncm91bmQ6IHdoaXRlOyBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMpO1xuICBwYWRkaW5nOiAyOHB4IDI0cHg7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdyk7XG59XG4ub25ib2FyZC1jYXJkIGgyIHsgZm9udC1zaXplOiAxcmVtOyBmb250LXdlaWdodDogNTAwOyBtYXJnaW4tYm90dG9tOiAyMHB4OyBsZXR0ZXItc3BhY2luZzogMC4wNGVtOyB9XG5cbi8qIOKUgOKUgCBGb3JtIGVsZW1lbnRzIOKUgOKUgCAqL1xuaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3R5cGU9XCJudW1iZXJcIl0sIGlucHV0W3R5cGU9XCJ0aW1lXCJdLFxuaW5wdXRbdHlwZT1cImRhdGVcIl0sIHRleHRhcmVhLCBzZWxlY3Qge1xuICB3aWR0aDogMTAwJTsgcGFkZGluZzogMTFweCAxNHB4O1xuICBib3JkZXI6IDEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XG4gIGZvbnQtZmFtaWx5OiAnTm90byBTZXJpZiBUQycsIHNlcmlmOyBmb250LXNpemU6IDAuOTJyZW07XG4gIGNvbG9yOiB2YXIoLS1pbmspOyBiYWNrZ3JvdW5kOiB2YXIoLS1jcmVhbSk7XG4gIG91dGxpbmU6IG5vbmU7IHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjE4cywgYmFja2dyb3VuZCAwLjE4cztcbiAgbWFyZ2luLXRvcDogNXB4OyBkaXNwbGF5OiBibG9jaztcbn1cbmlucHV0OmZvY3VzLCB0ZXh0YXJlYTpmb2N1cywgc2VsZWN0OmZvY3VzIHtcbiAgYm9yZGVyLWNvbG9yOiB2YXIoLS1yb3NlKTsgYmFja2dyb3VuZDogd2hpdGU7XG59XG5sYWJlbCB7XG4gIGZvbnQtc2l6ZTogMC43OHJlbTsgZm9udC13ZWlnaHQ6IDUwMDtcbiAgY29sb3I6IHZhcigtLWluay1saWdodCk7IGxldHRlci1zcGFjaW5nOiAwLjA2ZW07IGRpc3BsYXk6IGJsb2NrO1xufVxuLmZpZWxkIHsgbWFyZ2luLWJvdHRvbTogMTZweDsgfVxuXG4vKiDilIDilIAgQnV0dG9ucyDilIDilIAgKi9cbi5idG4ge1xuICBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGdhcDogNnB4OyBwYWRkaW5nOiAxM3B4IDIwcHg7IGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XG4gIGZvbnQtZmFtaWx5OiAnTm90byBTZXJpZiBUQycsIHNlcmlmOyBmb250LXNpemU6IDAuOTJyZW07IGZvbnQtd2VpZ2h0OiA1MDA7XG4gIGN1cnNvcjogcG9pbnRlcjsgYm9yZGVyOiBub25lOyB0cmFuc2l0aW9uOiBhbGwgMC4xOHM7XG4gIGxldHRlci1zcGFjaW5nOiAwLjA0ZW07IHdoaXRlLXNwYWNlOiBub3dyYXA7XG59XG4uYnRuLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1yb3NlKTsgY29sb3I6IHdoaXRlOyB3aWR0aDogMTAwJTsgfVxuLmJ0bi1wcmltYXJ5OmFjdGl2ZSB7IGJhY2tncm91bmQ6IHZhcigtLXJvc2UtZGFyayk7IHRyYW5zZm9ybTogc2NhbGUoMC45OSk7IH1cbi5idG4tc2Vjb25kYXJ5IHsgYmFja2dyb3VuZDogdmFyKC0tY3JlYW0pOyBjb2xvcjogdmFyKC0taW5rKTsgYm9yZGVyOiAxLjVweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyB3aWR0aDogMTAwJTsgbWFyZ2luLXRvcDogMTBweDsgfVxuLmJ0bi1zZWNvbmRhcnk6YWN0aXZlIHsgYmFja2dyb3VuZDogdmFyKC0td2FybSk7IH1cbi5idG4tZ2hvc3QgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWluay1saWdodCk7IHBhZGRpbmc6IDlweCAxNHB4OyBmb250LXNpemU6IDAuODJyZW07IH1cbi5idG4tZ2hvc3Q6YWN0aXZlIHsgY29sb3I6IHZhcigtLXJvc2UpOyB9XG4uYnRuLWRhbmdlciB7IGJhY2tncm91bmQ6ICNGRUYyRjI7IGNvbG9yOiAjQjkxQzFDOyBib3JkZXI6IDEuNXB4IHNvbGlkICNGRUNBQ0E7IGZvbnQtc2l6ZTogMC44NXJlbTsgfVxuLmJ0bi1zbSB7IHBhZGRpbmc6IDhweCAxNHB4OyBmb250LXNpemU6IDAuODJyZW07IH1cbi5idG4taWNvbiB7XG4gIGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgcGFkZGluZzogOXB4OyBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1jcmVhbSk7IGJvcmRlcjogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTtcbiAgY29sb3I6IHZhcigtLWluay1saWdodCk7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogYWxsIDAuMTVzOyBsaW5lLWhlaWdodDogMTtcbn1cbi5idG4taWNvbjphY3RpdmUgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJtKTsgY29sb3I6IHZhcigtLWluayk7IH1cbi5idG4taWNvbiBzdmcgeyB3aWR0aDogMjBweDsgaGVpZ2h0OiAyMHB4OyB9XG5cbi8qIOKUgOKUgCBOYXYg4pSA4pSAICovXG4ubmF2IHtcbiAgZGlzcGxheTogZmxleDsgYmFja2dyb3VuZDogd2hpdGU7IGJvcmRlci10b3A6IDEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gIHBhZGRpbmc6IDZweCAwIGVudihzYWZlLWFyZWEtaW5zZXQtYm90dG9tLCA2cHgpO1xuICBwb3NpdGlvbjogc3RpY2t5OyBib3R0b206IDA7IHotaW5kZXg6IDIwO1xufVxuLm5hdi1pdGVtIHtcbiAgZmxleDogMTsgZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAzcHg7IHBhZGRpbmc6IDlweCA0cHg7IGN1cnNvcjogcG9pbnRlcjsgYm9yZGVyOiBub25lO1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IHRyYW5zaXRpb246IGNvbG9yIDAuMTVzO1xuICBmb250LWZhbWlseTogJ05vdG8gU2VyaWYgVEMnLCBzZXJpZjtcbn1cbi5uYXYtaXRlbS5hY3RpdmUgeyBjb2xvcjogdmFyKC0tcm9zZSk7IH1cbi5uYXYtaXRlbSBzdmcgeyB3aWR0aDogMjJweDsgaGVpZ2h0OiAyMnB4OyB9XG4ubmF2LWl0ZW0gc3BhbiB7IGZvbnQtc2l6ZTogMC42N3JlbTsgZm9udC13ZWlnaHQ6IDUwMDsgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTsgfVxuXG4vKiDilIDilIAgSGVhZGVyIOKUgOKUgCAqL1xuLmhlYWRlciB7XG4gIHBhZGRpbmc6IDE4cHggMThweCAxMnB4OyBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm9yZGVyLWJvdHRvbTogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTtcbiAgcG9zaXRpb246IHN0aWNreTsgdG9wOiAwOyB6LWluZGV4OiAxMDtcbn1cbi5oZWFkZXItcm93IHsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBnYXA6IDEwcHg7IH1cbi5oZWFkZXIgaDIgeyBmb250LXNpemU6IDEuMTVyZW07IGZvbnQtd2VpZ2h0OiA2MDA7IGxldHRlci1zcGFjaW5nOiAwLjA2ZW07IH1cbi5kYXRlLWNoaXAge1xuICBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMC43cmVtO1xuICBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgYmFja2dyb3VuZDogdmFyKC0tY3JlYW0pO1xuICBwYWRkaW5nOiA0cHggMTBweDsgYm9yZGVyLXJhZGl1czogMjBweDsgZmxleC1zaHJpbms6IDA7XG59XG4uaGVhZGVyLWljb25zIHsgZGlzcGxheTogZmxleDsgZ2FwOiA2cHg7IH1cblxuLyog4pSA4pSAIE1haW4g4pSA4pSAICovXG4ubWFpbiB7IGZsZXg6IDE7IG92ZXJmbG93LXk6IGF1dG87IHBhZGRpbmc6IDE4cHg7IHBhZGRpbmctYm90dG9tOiA5MHB4OyB9XG5cbi8qIOKUgOKUgCBUb2RheSBTdW1tYXJ5IOKUgOKUgCAqL1xuLnRvZGF5LWhlcm8ge1xuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCB2YXIoLS1yb3NlLXBhbGUpIDAlLCB2YXIoLS1jcmVhbSkgMTAwJSk7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cyk7IHBhZGRpbmc6IDIwcHg7XG4gIGJvcmRlcjogMS41cHggc29saWQgdmFyKC0tcm9zZS1saWdodCk7IG1hcmdpbi1ib3R0b206IDIwcHg7XG4gIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogMThweDtcbn1cbi5oZXJvLXByb2dyZXNzIHsgZmxleC1zaHJpbms6IDA7IHBvc2l0aW9uOiByZWxhdGl2ZTsgd2lkdGg6IDY4cHg7IGhlaWdodDogNjhweDsgfVxuLmhlcm8tcHJvZ3Jlc3Mgc3ZnIHsgd2lkdGg6IDY4cHg7IGhlaWdodDogNjhweDsgdHJhbnNmb3JtOiByb3RhdGUoLTkwZGVnKTsgfVxuLmhlcm8tcHJvZ3Jlc3MgLnRyYWNrIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiB2YXIoLS1yb3NlLWxpZ2h0KTsgc3Ryb2tlLXdpZHRoOiA1OyB9XG4uaGVyby1wcm9ncmVzcyAuZmlsbCAgeyBmaWxsOiBub25lOyBzdHJva2U6IHZhcigtLXJvc2UpOyBzdHJva2Utd2lkdGg6IDU7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgdHJhbnNpdGlvbjogc3Ryb2tlLWRhc2hvZmZzZXQgMC41cyBlYXNlOyB9XG4uaGVyby1jZW50ZXIge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7IGluc2V0OiAwOyBkaXNwbGF5OiBmbGV4O1xuICBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbn1cbi5oZXJvLWNlbnRlciAubnVtIHsgZm9udC1mYW1pbHk6ICdETSBNb25vJywgbW9ub3NwYWNlOyBmb250LXNpemU6IDEuMTVyZW07IGZvbnQtd2VpZ2h0OiA1MDA7IGNvbG9yOiB2YXIoLS1yb3NlKTsgbGluZS1oZWlnaHQ6IDE7IH1cbi5oZXJvLWNlbnRlciAuZGVuIHsgZm9udC1zaXplOiAwLjYycmVtOyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgfVxuLmhlcm8tdGV4dCBoMyB7IGZvbnQtc2l6ZTogMXJlbTsgZm9udC13ZWlnaHQ6IDYwMDsgY29sb3I6IHZhcigtLWluayk7IH1cbi5oZXJvLXRleHQgcCAgeyBmb250LXNpemU6IDAuOHJlbTsgY29sb3I6IHZhcigtLWluay1saWdodCk7IG1hcmdpbi10b3A6IDNweDsgbGluZS1oZWlnaHQ6IDEuNTsgfVxuXG4vKiDilIDilIAgUGVyaW9kIGdyb3VwIOKUgOKUgCAqL1xuLnBlcmlvZC1ncm91cCB7IG1hcmdpbi1ib3R0b206IDE4cHg7IH1cbi5wZXJpb2QtdGl0bGUge1xuICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDtcbiAgZm9udC1zaXplOiAwLjgycmVtOyBmb250LXdlaWdodDogNjAwOyBjb2xvcjogdmFyKC0taW5rLWxpZ2h0KTtcbiAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTsgbWFyZ2luLWJvdHRvbTogMTBweDtcbn1cbi5wZXJpb2QtdGl0bGUgLnBlcmlvZC1pY29uIHsgZm9udC1zaXplOiAxcmVtOyB9XG4ucGVyaW9kLXRpdGxlIC5wZXJpb2QtdGltZSB7XG4gIGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgZm9udC1zaXplOiAwLjdyZW07XG4gIGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyBmb250LXdlaWdodDogNDAwOyBtYXJnaW4tbGVmdDogYXV0bztcbn1cblxuLnBlcmlvZC1jYXJkIHtcbiAgYmFja2dyb3VuZDogd2hpdGU7IGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cyk7XG4gIGJvcmRlcjogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTsgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTsgdHJhbnNpdGlvbjogYm9yZGVyLWNvbG9yIDAuMnM7XG59XG4ucGVyaW9kLWNhcmQuaXMtbm93ICAgIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1yb3NlLWxpZ2h0KTsgYm94LXNoYWRvdzogMCAwIDAgM3B4IHZhcigtLXJvc2UtcGFsZSksIHZhcigtLXNoYWRvdy1zbSk7IH1cbi5wZXJpb2QtY2FyZC5pcy1kb25lICAgeyBib3JkZXItY29sb3I6IHZhcigtLXNhZ2UtbGlnaHQpOyB9XG4ucGVyaW9kLWNhcmQuaXMtbGF0ZSAgIHsgYm9yZGVyLWNvbG9yOiB2YXIoLS1hbWJlcik7IH1cblxuLnBlcmlvZC1tZWRzIHsgcGFkZGluZzogMTRweCAxNnB4IDEwcHg7IH1cbi5wZXJpb2QtbWVkLXJvdyB7XG4gIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgcGFkZGluZzogNnB4IDA7XG59XG4ucGVyaW9kLW1lZC1yb3cgKyAucGVyaW9kLW1lZC1yb3cgeyBib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tYm9yZGVyKTsgfVxuLnBlcmlvZC1tZWQtbmFtZSB7IGZvbnQtc2l6ZTogMC45MnJlbTsgZm9udC13ZWlnaHQ6IDUwMDsgY29sb3I6IHZhcigtLWluayk7IH1cbi5wZXJpb2QtbWVkLWRvc2UgeyBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMC43OHJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IH1cbi5wZXJpb2QtbWVkLWNoZWNrIHsgZm9udC1zaXplOiAxcmVtOyB9XG5cbi5wZXJpb2QtZm9vdGVyIHtcbiAgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICBwYWRkaW5nOiAxMHB4IDE2cHg7IGJhY2tncm91bmQ6IHZhcigtLWNyZWFtKTtcbiAgYm9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG59XG4ucGVyaW9kLWZvb3Rlci5kb25lICB7IGJhY2tncm91bmQ6IHZhcigtLXNhZ2UtcGFsZSk7IH1cbi5wZXJpb2QtZm9vdGVyLmxhdGUgIHsgYmFja2dyb3VuZDogdmFyKC0tYW1iZXItcGFsZSk7IH1cblxuLnBlcmlvZC1mb290ZXItbGFiZWwgeyBmb250LXNpemU6IDAuOHJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IH1cbi5wZXJpb2QtZm9vdGVyLmRvbmUgLnBlcmlvZC1mb290ZXItbGFiZWwgeyBjb2xvcjogdmFyKC0tc2FnZS1kYXJrKTsgZm9udC13ZWlnaHQ6IDUwMDsgfVxuLnBlcmlvZC1mb290ZXIubGF0ZSAucGVyaW9kLWZvb3Rlci1sYWJlbCB7IGNvbG9yOiB2YXIoLS1hbWJlcik7IH1cblxuLmJ0bi10YWtlLXBlcmlvZCB7XG4gIHBhZGRpbmc6IDhweCAxOHB4OyBib3JkZXItcmFkaXVzOiA4cHg7XG4gIGJhY2tncm91bmQ6IHZhcigtLXJvc2UpOyBjb2xvcjogd2hpdGU7IGJvcmRlcjogbm9uZTtcbiAgZm9udC1mYW1pbHk6ICdOb3RvIFNlcmlmIFRDJywgc2VyaWY7IGZvbnQtc2l6ZTogMC44NXJlbTsgZm9udC13ZWlnaHQ6IDUwMDtcbiAgY3Vyc29yOiBwb2ludGVyOyB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMTVzO1xufVxuLmJ0bi10YWtlLXBlcmlvZDphY3RpdmUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1yb3NlLWRhcmspOyB9XG4uYnRuLXVuZG8ge1xuICBwYWRkaW5nOiA1cHggMTJweDsgYm9yZGVyLXJhZGl1czogNnB4O1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7XG4gIGZvbnQtZmFtaWx5OiAnTm90byBTZXJpZiBUQycsIHNlcmlmOyBmb250LXNpemU6IDAuNzVyZW07XG4gIGN1cnNvcjogcG9pbnRlcjtcbn1cblxuLyog4pSA4pSAIEludmVudG9yeSBjYXJkIOKUgOKUgCAqL1xuLmludmVudG9yeS1jYXJkIHsgYmFja2dyb3VuZDogd2hpdGU7IGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cyk7IGJvcmRlcjogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTsgbWFyZ2luLWJvdHRvbTogMTZweDsgb3ZlcmZsb3c6IGhpZGRlbjsgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTsgfVxuLmludmVudG9yeS1jYXJkIC5jYXJkLWhlYWRlciB7IHBhZGRpbmc6IDEzcHggMTZweCAxMHB4OyBib3JkZXItYm90dG9tOiAxLjVweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IH1cbi5pbnZlbnRvcnktY2FyZCAuY2FyZC1oZWFkZXIgaDQgeyBmb250LXNpemU6IDAuODJyZW07IGZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiB2YXIoLS1pbmstbGlnaHQpOyBsZXR0ZXItc3BhY2luZzogMC4wOGVtOyB9XG4uaW52ZW50b3J5LWNhcmQgLmNhcmQtYm9keSB7IHBhZGRpbmc6IDRweCAwOyB9XG5cbi5pbnYtcm93IHtcbiAgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgcGFkZGluZzogMTJweCAxNnB4O1xuICBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYm9yZGVyKTsgZ2FwOiAxMnB4O1xufVxuLmludi1yb3c6bGFzdC1jaGlsZCB7IGJvcmRlci1ib3R0b206IG5vbmU7IH1cbi5pbnYtZG90IHsgd2lkdGg6IDhweDsgaGVpZ2h0OiA4cHg7IGJvcmRlci1yYWRpdXM6IDUwJTsgYmFja2dyb3VuZDogdmFyKC0tc2FnZSk7IGZsZXgtc2hyaW5rOiAwOyB9XG4uaW52LWRvdC5sb3cgeyBiYWNrZ3JvdW5kOiB2YXIoLS1yb3NlKTsgfVxuLmludi1pbmZvIHsgZmxleDogMTsgfVxuLmludi1uYW1lIHsgZm9udC1zaXplOiAwLjkycmVtOyBmb250LXdlaWdodDogNTAwOyB9XG4uaW52LXN1YiAgeyBmb250LXNpemU6IDAuNzJyZW07IGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IG1hcmdpbi10b3A6IDJweDsgfVxuLmludi1maW5pc2ggeyB0ZXh0LWFsaWduOiByaWdodDsgfVxuLmludi1kYXlzIHsgZm9udC1mYW1pbHk6ICdETSBNb25vJywgbW9ub3NwYWNlOyBmb250LXNpemU6IDAuODJyZW07IGNvbG9yOiB2YXIoLS1yb3NlKTsgZm9udC13ZWlnaHQ6IDUwMDsgfVxuLmludi1kYXRlIHsgZm9udC1zaXplOiAwLjY4cmVtOyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgbWFyZ2luLXRvcDogMnB4OyB9XG5cbi8qIOKUgOKUgCBNZWRpY2F0aW9uIGxpc3Qg4pSA4pSAICovXG4ubWVkLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTsgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzKTtcbiAgYm9yZGVyOiAxLjVweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyBwYWRkaW5nOiAxOHB4O1xuICBtYXJnaW4tYm90dG9tOiAxNHB4OyBwb3NpdGlvbjogcmVsYXRpdmU7IG92ZXJmbG93OiBoaWRkZW47XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XG59XG4ubWVkLWNhcmQ6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICcnOyBwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IDA7IHRvcDogMDsgYm90dG9tOiAwO1xuICB3aWR0aDogNHB4OyBib3JkZXItcmFkaXVzOiA0cHggMCAwIDRweDsgYmFja2dyb3VuZDogdmFyKC0tcm9zZS1saWdodCk7XG59XG4ubWVkLWNhcmQuYWN0aXZlOjpiZWZvcmUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1zYWdlKTsgfVxuLm1lZC1jYXJkLnBhdXNlZDo6YmVmb3JlIHsgYmFja2dyb3VuZDogdmFyKC0taW5rLW11dGVkKTsgfVxuXG4ubWVkLWNhcmQtdG9wIHsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGZsZXgtc3RhcnQ7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogMTBweDsgfVxuLm1lZC1jYXJkLW5hbWUgeyBmb250LXNpemU6IDFyZW07IGZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiB2YXIoLS1pbmspOyB9XG4uc3RhdHVzLXRhZyB7XG4gIGZvbnQtc2l6ZTogMC42NXJlbTsgZm9udC1mYW1pbHk6ICdETSBNb25vJywgbW9ub3NwYWNlO1xuICBwYWRkaW5nOiAzcHggOXB4OyBib3JkZXItcmFkaXVzOiAyMHB4OyBsZXR0ZXItc3BhY2luZzogMC4wNmVtOyBmbGV4LXNocmluazogMDsgbWFyZ2luLWxlZnQ6IDhweDsgZm9udC13ZWlnaHQ6IDUwMDtcbn1cbi50YWctYWN0aXZlIHsgYmFja2dyb3VuZDogdmFyKC0tc2FnZS1wYWxlKTsgY29sb3I6IHZhcigtLXNhZ2UtZGFyayk7IH1cbi50YWctcGF1c2VkIHsgYmFja2dyb3VuZDogdmFyKC0tY3JlYW0pOyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgfVxuXG4ubWVkLXBlcmlvZC10YWdzIHsgZGlzcGxheTogZmxleDsgZmxleC13cmFwOiB3cmFwOyBnYXA6IDVweDsgbWFyZ2luLWJvdHRvbTogMTJweDsgfVxuLm1lZC1wZXJpb2QtdGFnIHtcbiAgZm9udC1zaXplOiAwLjcycmVtOyBiYWNrZ3JvdW5kOiB2YXIoLS1jcmVhbSk7IGJvcmRlcjogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTtcbiAgYm9yZGVyLXJhZGl1czogNnB4OyBwYWRkaW5nOiAzcHggOXB4OyBjb2xvcjogdmFyKC0taW5rLWxpZ2h0KTsgZm9udC13ZWlnaHQ6IDUwMDtcbn1cblxuLm1lZC1zdGF0cyB7IGRpc3BsYXk6IGZsZXg7IGdhcDogMjBweDsgfVxuLm1lZC1zdGF0IC52YWwgeyBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMS4zcmVtOyBjb2xvcjogdmFyKC0tcm9zZSk7IGxpbmUtaGVpZ2h0OiAxOyBmb250LXdlaWdodDogNTAwOyB9XG4ubWVkLXN0YXQgLmxibCB7IGZvbnQtc2l6ZTogMC42NXJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IG1hcmdpbi10b3A6IDJweDsgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTsgfVxuXG4ucHJvZ3Jlc3Mtd3JhcCB7IG1hcmdpbi10b3A6IDEycHg7IGJhY2tncm91bmQ6IHZhcigtLWNyZWFtKTsgYm9yZGVyLXJhZGl1czogNHB4OyBoZWlnaHQ6IDVweDsgb3ZlcmZsb3c6IGhpZGRlbjsgfVxuLnByb2dyZXNzLWZpbGwgeyBoZWlnaHQ6IDEwMCU7IGJhY2tncm91bmQ6IHZhcigtLXJvc2UpOyBib3JkZXItcmFkaXVzOiA0cHg7IHRyYW5zaXRpb246IHdpZHRoIDAuNHM7IH1cblxuLmVzdGltYXRlLXJvdyB7XG4gIG1hcmdpbi10b3A6IDEwcHg7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4O1xuICBmb250LXNpemU6IDAuNzhyZW07IGNvbG9yOiB2YXIoLS1pbmstbGlnaHQpO1xufVxuLmVzdGltYXRlLXJvdyAuZGF5cyB7IGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgY29sb3I6IHZhcigtLXJvc2UpOyBmb250LXdlaWdodDogNTAwOyB9XG5cbi5tZWQtZm9vdGVyIHsgZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7IG1hcmdpbi10b3A6IDEycHg7IHBhZGRpbmctdG9wOiAxMnB4OyBib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tYm9yZGVyKTsgfVxuXG4vKiDilIDilIAgVmlzaXQgdGltZWxpbmUg4pSA4pSAICovXG4udGltZWxpbmUgeyBwb3NpdGlvbjogcmVsYXRpdmU7IHBhZGRpbmctbGVmdDogMjJweDsgfVxuLnRpbWVsaW5lOjpiZWZvcmUgeyBjb250ZW50OiAnJzsgcG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiA3cHg7IHRvcDogOHB4OyBib3R0b206IDhweDsgd2lkdGg6IDEuNXB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1ib3JkZXIpOyB9XG4udmlzaXQtaXRlbSB7IHBvc2l0aW9uOiByZWxhdGl2ZTsgbWFyZ2luLWJvdHRvbTogMjJweDsgfVxuLnZpc2l0LWl0ZW06OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICcnOyBwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IC0xOXB4OyB0b3A6IDhweDtcbiAgd2lkdGg6IDEwcHg7IGhlaWdodDogMTBweDsgYm9yZGVyLXJhZGl1czogNTAlO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1yb3NlKTsgYm9yZGVyOiAycHggc29saWQgdmFyKC0tcGFwZXIpOyBib3gtc2hhZG93OiAwIDAgMCAycHggdmFyKC0tcm9zZS1saWdodCk7XG59XG4udmlzaXQtY2FyZCB7IGJhY2tncm91bmQ6IHdoaXRlOyBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMpOyBib3JkZXI6IDEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IG92ZXJmbG93OiBoaWRkZW47IGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7IH1cbi52aXNpdC1kYXRlLWJhciB7IGJhY2tncm91bmQ6IHZhcigtLXJvc2UtcGFsZSk7IHBhZGRpbmc6IDEwcHggMTZweDsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyB9XG4udmlzaXQtZGF0ZSB7IGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgZm9udC1zaXplOiAwLjhyZW07IGNvbG9yOiB2YXIoLS1yb3NlKTsgZm9udC13ZWlnaHQ6IDUwMDsgbGV0dGVyLXNwYWNpbmc6IDAuMDZlbTsgfVxuLnZpc2l0LWhvc3BpdGFsIHsgZm9udC1zaXplOiAwLjc1cmVtOyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgfVxuLnZpc2l0LWJvZHkgeyBwYWRkaW5nOiAxNHB4IDE2cHg7IH1cbi52aXNpdC1ub3RlIHsgZm9udC1zaXplOiAwLjg1cmVtOyBjb2xvcjogdmFyKC0taW5rLWxpZ2h0KTsgbWFyZ2luLWJvdHRvbTogMTJweDsgbGluZS1oZWlnaHQ6IDEuNjsgZm9udC1zdHlsZTogaXRhbGljOyB9XG4uY2hhbmdlLWxpc3QgeyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBnYXA6IDZweDsgfVxuLmNoYW5nZS1jaGlwIHsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IHBhZGRpbmc6IDhweCAxMnB4OyBib3JkZXItcmFkaXVzOiA4cHg7IGZvbnQtc2l6ZTogMC44MnJlbTsgZm9udC13ZWlnaHQ6IDUwMDsgfVxuLmNoaXAtY29udGludWUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1zYWdlLXBhbGUpOyBjb2xvcjogdmFyKC0tc2FnZS1kYXJrKTsgfVxuLmNoaXAtc3RvcCAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1jcmVhbSk7IGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyB9XG4uY2hpcC1uZXcgICAgICB7IGJhY2tncm91bmQ6IHZhcigtLWFtYmVyLXBhbGUpOyBjb2xvcjogdmFyKC0tYW1iZXIpOyB9XG4uY2hpcC1sYWJlbCB7IGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgZm9udC1zaXplOiAwLjY1cmVtOyBwYWRkaW5nOiAycHggN3B4OyBib3JkZXItcmFkaXVzOiA0cHg7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC4wNyk7IH1cblxuLyog4pSA4pSAIE1vZGFsIOKUgOKUgCAqL1xuLm1vZGFsLW92ZXJsYXkge1xuICBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBiYWNrZ3JvdW5kOiByZ2JhKDM1LDI4LDE2LDAuNDUpO1xuICB6LWluZGV4OiAxMDA7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBmbGV4LWVuZDtcbiAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDNweCk7XG59XG4ubW9kYWwge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wYXBlcik7IGJvcmRlci1yYWRpdXM6IDIycHggMjJweCAwIDA7XG4gIHdpZHRoOiAxMDAlOyBtYXgtd2lkdGg6IDQzMHB4OyBtYXJnaW46IDAgYXV0bztcbiAgLyogVXNlIGR2aCBzbyBpT1MgU2FmYXJpIHRvb2xiYXIgaXMgZXhjbHVkZWQgZnJvbSBoZWlnaHQgY2FsYyAqL1xuICBtYXgtaGVpZ2h0OiA5MmR2aDtcbiAgLyogRmFsbGJhY2sgZm9yIG9sZGVyIGJyb3dzZXJzICovXG4gIG1heC1oZWlnaHQ6IG1pbig5MmR2aCwgOTJ2aCk7XG4gIGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGFuaW1hdGlvbjogc2xpZGVVcCAwLjI2cyBjdWJpYy1iZXppZXIoLjMyLC43MiwwLDEpO1xuICBvdmVyZmxvdzogaGlkZGVuOyAvKiBjaGlsZHJlbiBoYW5kbGUgc2Nyb2xsICovXG59XG4ubW9kYWwtc2Nyb2xsIHtcbiAgb3ZlcmZsb3cteTogYXV0bztcbiAgLXdlYmtpdC1vdmVyZmxvdy1zY3JvbGxpbmc6IHRvdWNoO1xuICBmbGV4OiAxO1xuICBwYWRkaW5nOiAwIDI0cHg7XG4gIC8qIEJvdHRvbTogZW5vdWdoIGZvciBpUGhvbmUgaG9tZSBpbmRpY2F0b3IgKyBidXR0b24gKi9cbiAgcGFkZGluZy1ib3R0b206IGNhbGMoMzJweCArIGVudihzYWZlLWFyZWEtaW5zZXQtYm90dG9tLCAyMHB4KSk7XG59XG4ubW9kYWwtdG9wIHtcbiAgcGFkZGluZzogMjRweCAyNHB4IDA7XG4gIGZsZXgtc2hyaW5rOiAwO1xufVxuQGtleWZyYW1lcyBzbGlkZVVwIHsgZnJvbSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSg1MHB4KTsgb3BhY2l0eTogMDsgfSB0byB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsgb3BhY2l0eTogMTsgfSB9XG4ubW9kYWwtaGFuZGxlIHsgd2lkdGg6IDM2cHg7IGhlaWdodDogNHB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1ib3JkZXIpOyBib3JkZXItcmFkaXVzOiAycHg7IG1hcmdpbjogMCBhdXRvIDIycHg7IH1cbi5tb2RhbCBoMyB7IGZvbnQtc2l6ZTogMS4wNXJlbTsgZm9udC13ZWlnaHQ6IDYwMDsgbGV0dGVyLXNwYWNpbmc6IDAuMDVlbTsgbWFyZ2luLWJvdHRvbTogMjBweDsgfVxuXG4vKiDilIDilIAgTWlzYyDilIDilIAgKi9cbi50b2FzdCB7XG4gIHBvc2l0aW9uOiBmaXhlZDsgdG9wOiAxOHB4OyBsZWZ0OiA1MCU7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgtNTAlKTtcbiAgYmFja2dyb3VuZDogdmFyKC0taW5rKTsgY29sb3I6IHdoaXRlOyBwYWRkaW5nOiAxMXB4IDIycHg7IGJvcmRlci1yYWRpdXM6IDIycHg7XG4gIGZvbnQtc2l6ZTogMC44NXJlbTsgZm9udC13ZWlnaHQ6IDUwMDsgei1pbmRleDogMjAwO1xuICBhbmltYXRpb246IHRvYXN0SW4gMC4ycyBlYXNlOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3cpO1xufVxuQGtleWZyYW1lcyB0b2FzdEluIHsgZnJvbSB7IG9wYWNpdHk6IDA7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgtNTAlKSB0cmFuc2xhdGVZKC02cHgpOyB9IHRvIHsgb3BhY2l0eTogMTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC01MCUpIHRyYW5zbGF0ZVkoMCk7IH0gfVxuXG4udmlld2VyLWJhbm5lciB7IGJhY2tncm91bmQ6IHZhcigtLWFtYmVyLXBhbGUpOyBib3JkZXItYm90dG9tOiAxLjVweCBzb2xpZCAjREZDMDcwOyBwYWRkaW5nOiA5cHggMThweDsgZm9udC1zaXplOiAwLjc1cmVtOyBjb2xvcjogdmFyKC0tYW1iZXIpOyBsZXR0ZXItc3BhY2luZzogMC4wN2VtOyB0ZXh0LWFsaWduOiBjZW50ZXI7IGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgZm9udC13ZWlnaHQ6IDUwMDsgfVxuLm5vdGlmLWJhbm5lciB7IGJhY2tncm91bmQ6IHZhcigtLXNhZ2UtcGFsZSk7IGJvcmRlci1ib3R0b206IDEuNXB4IHNvbGlkIHZhcigtLXNhZ2UtbGlnaHQpOyBwYWRkaW5nOiAxMHB4IDE2cHg7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgZ2FwOiAxMHB4OyBmb250LXNpemU6IDAuOHJlbTsgZm9udC13ZWlnaHQ6IDUwMDsgY29sb3I6IHZhcigtLXNhZ2UtZGFyayk7IH1cbi5ub3RpZi1iYW5uZXIgYnV0dG9uIHsgYmFja2dyb3VuZDogdmFyKC0tc2FnZSk7IGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA3cHg7IHBhZGRpbmc6IDZweCAxNHB4OyBmb250LXNpemU6IDAuNzhyZW07IGZvbnQtd2VpZ2h0OiA1MDA7IGN1cnNvcjogcG9pbnRlcjsgZm9udC1mYW1pbHk6ICdOb3RvIFNlcmlmIFRDJywgc2VyaWY7IH1cblxuLnNlY3Rpb24tdGl0bGUgeyBmb250LXNpemU6IDAuNzJyZW07IGZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyBsZXR0ZXItc3BhY2luZzogMC4xNGVtOyB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlOyBtYXJnaW46IDIycHggMCAxMHB4OyBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IH1cbi5zZWN0aW9uLXRpcCB7IGZvbnQtc2l6ZTogMC43OHJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IG1hcmdpbi1ib3R0b206IDE2cHg7IGxpbmUtaGVpZ2h0OiAxLjU1OyB9XG5cbi5lbXB0eS1zdGF0ZSB7IHRleHQtYWxpZ246IGNlbnRlcjsgcGFkZGluZzogNDhweCAyMHB4OyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgfVxuLmVtcHR5LXN0YXRlIC5pY29uIHsgZm9udC1zaXplOiAyLjhyZW07IG1hcmdpbi1ib3R0b206IDE0cHg7IH1cbi5lbXB0eS1zdGF0ZSBwIHsgZm9udC1zaXplOiAwLjlyZW07IH1cblxuLmZhYiB7XG4gIHBvc2l0aW9uOiBmaXhlZDsgYm90dG9tOiA4MnB4OyByaWdodDogMThweDsgd2lkdGg6IDU0cHg7IGhlaWdodDogNTRweDtcbiAgYm9yZGVyLXJhZGl1czogNTAlOyBiYWNrZ3JvdW5kOiB2YXIoLS1yb3NlKTsgY29sb3I6IHdoaXRlOyBib3JkZXI6IG5vbmU7XG4gIGZvbnQtc2l6ZTogMS41cmVtOyBjdXJzb3I6IHBvaW50ZXI7IGJveC1zaGFkb3c6IDAgNHB4IDE4cHggcmdiYSgxOTYsMTIwLDkwLDAuNDUpO1xuICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgdHJhbnNpdGlvbjogYWxsIDAuMThzOyB6LWluZGV4OiA1MDtcbn1cbi5mYWI6YWN0aXZlIHsgYmFja2dyb3VuZDogdmFyKC0tcm9zZS1kYXJrKTsgdHJhbnNmb3JtOiBzY2FsZSgwLjk1KTsgfVxuXG4uZGl2aWRlciB7IGJvcmRlcjogbm9uZTsgYm9yZGVyLXRvcDogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTsgbWFyZ2luOiAxNnB4IDA7IH1cblxuLnBhaXItY29kZS1kaXNwbGF5IHsgYmFja2dyb3VuZDogdmFyKC0tY3JlYW0pOyBib3JkZXItcmFkaXVzOiAxMnB4OyBwYWRkaW5nOiAxOHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IG1hcmdpbjogMTZweCAwOyBib3JkZXI6IDEuNXB4IGRhc2hlZCB2YXIoLS1yb3NlLWxpZ2h0KTsgfVxuLnBhaXItY29kZS1kaXNwbGF5IC5jb2RlIHsgZm9udC1mYW1pbHk6ICdETSBNb25vJywgbW9ub3NwYWNlOyBmb250LXNpemU6IDIuOHJlbTsgY29sb3I6IHZhcigtLXJvc2UpOyBsZXR0ZXItc3BhY2luZzogMC4zZW07IGZvbnQtd2VpZ2h0OiA1MDA7IH1cbi5wYWlyLWNvZGUtZGlzcGxheSBzbWFsbCB7IGRpc3BsYXk6IGJsb2NrOyBmb250LXNpemU6IDAuNzJyZW07IGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyBtYXJnaW4tdG9wOiA1cHg7IH1cblxuLnBhaXItaW5mbyB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogMTBweDsgcGFkZGluZzogMTJweCAxNHB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1zYWdlLXBhbGUpOyBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pOyBib3JkZXI6IDEuNXB4IHNvbGlkIHZhcigtLXNhZ2UtbGlnaHQpOyBtYXJnaW4tYm90dG9tOiAxNHB4OyBmb250LXNpemU6IDAuODNyZW07IGNvbG9yOiB2YXIoLS1zYWdlLWRhcmspOyBmb250LXdlaWdodDogNTAwOyB9XG5cbi8qIFZpc2l0IGFkZCDigJMgY2hlY2tib3ggc3R5bGUgKi9cbi5tZWQtY2hlY2tib3gtcm93IHtcbiAgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICBwYWRkaW5nOiAxM3B4IDA7IGJvcmRlci1ib3R0b206IDEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IGN1cnNvcjogcG9pbnRlcjtcbn1cbi5tZWQtY2hlY2tib3gtcm93Omxhc3QtY2hpbGQgeyBib3JkZXItYm90dG9tOiBub25lOyB9XG4ubWVkLWNoZWNrYm94LWxhYmVsIHsgZm9udC1zaXplOiAwLjkycmVtOyBmb250LXdlaWdodDogNTAwOyBjb2xvcjogdmFyKC0taW5rKTsgfVxuLm1lZC1jaGVja2JveC1zdWIgeyBmb250LXNpemU6IDAuNzJyZW07IGNvbG9yOiB2YXIoLS1pbmstbXV0ZWQpOyBtYXJnaW4tdG9wOiAycHg7IGZvbnQtZmFtaWx5OiAnRE0gTW9ubycsIG1vbm9zcGFjZTsgfVxuLmNiLWJveCB7XG4gIHdpZHRoOiAyMnB4OyBoZWlnaHQ6IDIycHg7IGJvcmRlci1yYWRpdXM6IDZweDsgYm9yZGVyOiAycHggc29saWQgdmFyKC0tYm9yZGVyKTtcbiAgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGJhY2tncm91bmQ6IHZhcigtLWNyZWFtKTsgZmxleC1zaHJpbms6IDA7IHRyYW5zaXRpb246IGFsbCAwLjE1cztcbn1cbi5jYi1ib3guY2hlY2tlZCB7IGJhY2tncm91bmQ6IHZhcigtLXNhZ2UpOyBib3JkZXItY29sb3I6IHZhcigtLXNhZ2UpOyB9XG4uY2ItY2hlY2sgeyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMC44NXJlbTsgZm9udC13ZWlnaHQ6IDcwMDsgfVxuXG4vKiBQZXJpb2Qgc2VsZWN0b3IgKi9cbi5wZXJpb2Qtc2VsZWN0b3IgeyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBnYXA6IDZweDsgfVxuLnBlcmlvZC1vcHRpb24ge1xuICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XG4gIHBhZGRpbmc6IDEwcHggMTRweDsgYm9yZGVyLXJhZGl1czogMTBweDsgYm9yZGVyOiAxLjVweCBzb2xpZCB2YXIoLS1ib3JkZXIpO1xuICBjdXJzb3I6IHBvaW50ZXI7IGJhY2tncm91bmQ6IHZhcigtLWNyZWFtKTsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICB1c2VyLXNlbGVjdDogbm9uZTtcbn1cbi5wZXJpb2Qtb3B0aW9uLnNlbGVjdGVkIHsgYmFja2dyb3VuZDogdmFyKC0tcm9zZS1wYWxlKTsgYm9yZGVyLWNvbG9yOiB2YXIoLS1yb3NlLWxpZ2h0KTsgfVxuLnBlcmlvZC1vcHRpb24taWNvbiB7IGZvbnQtc2l6ZTogMXJlbTsgfVxuLnBlcmlvZC1vcHRpb24tbGFiZWwgeyBmb250LXNpemU6IDAuODhyZW07IGZvbnQtd2VpZ2h0OiA1MDA7IGZsZXg6IDE7IH1cbi5wZXJpb2Qtb3B0aW9uLXRpbWUgeyBmb250LWZhbWlseTogJ0RNIE1vbm8nLCBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMC43MnJlbTsgY29sb3I6IHZhcigtLWluay1tdXRlZCk7IH1cbi5wZXJpb2QtZG9zZS1yb3cgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgbWFyZ2luLXRvcDogNnB4OyBwYWRkaW5nOiAwIDE0cHggMTBweDsgfVxuLnBlcmlvZC1kb3NlLXJvdyBpbnB1dCB7IHdpZHRoOiA3MnB4OyBtYXJnaW4tdG9wOiAwOyB9XG4ucGVyaW9kLWRvc2Utcm93IGlucHV0W3R5cGU9XCJ0aW1lXCJdIHsgZmxleDogMTsgd2lkdGg6IGF1dG87IH1cblxuLyogU2V0dGluZ3MgKi9cbi5zZXR0aW5ncy1yb3cgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IHBhZGRpbmc6IDE0cHggMDsgYm9yZGVyLWJvdHRvbTogMS41cHggc29saWQgdmFyKC0tYm9yZGVyKTsgfVxuLnNldHRpbmdzLXJvdzpsYXN0LWNoaWxkIHsgYm9yZGVyLWJvdHRvbTogbm9uZTsgfVxuLnNldHRpbmdzLWxhYmVsIHsgZm9udC1zaXplOiAwLjkycmVtOyBmb250LXdlaWdodDogNTAwOyB9XG4uc2V0dGluZ3Mtc3ViIHsgZm9udC1zaXplOiAwLjc1cmVtOyBjb2xvcjogdmFyKC0taW5rLW11dGVkKTsgbWFyZ2luLXRvcDogMnB4OyB9XG5gO1xuXG5cbi8vIOKUgOKUgOKUgCBJY29ucyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmNvbnN0IEljbyA9IHtcbiAgdG9kYXk6ICAgIDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIxLjhcIj48cmVjdCB4PVwiM1wiIHk9XCI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgcng9XCIyXCIvPjxwYXRoIGQ9XCJNMTYgMnY0TTggMnY0TTMgMTBoMThcIi8+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxNVwiIHI9XCIxLjhcIiBmaWxsPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlPVwibm9uZVwiLz48L3N2Zz4sXG4gIG1lZHM6ICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMS44XCI+PHJlY3QgeD1cIjNcIiB5PVwiM1wiIHdpZHRoPVwiOFwiIGhlaWdodD1cIjhcIiByeD1cIjEuNVwiLz48cmVjdCB4PVwiMTNcIiB5PVwiM1wiIHdpZHRoPVwiOFwiIGhlaWdodD1cIjhcIiByeD1cIjEuNVwiLz48cmVjdCB4PVwiM1wiIHk9XCIxM1wiIHdpZHRoPVwiOFwiIGhlaWdodD1cIjhcIiByeD1cIjEuNVwiLz48cmVjdCB4PVwiMTNcIiB5PVwiMTNcIiB3aWR0aD1cIjhcIiBoZWlnaHQ9XCI4XCIgcng9XCIxLjVcIi8+PC9zdmc+LFxuICB2aXNpdHM6ICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjEuOFwiPjxwYXRoIGQ9XCJNOSA1SDdhMiAyIDAgMCAwLTIgMnYxMmEyIDIgMCAwIDAgMiAyaDEwYTIgMiAwIDAgMCAyLTJWN2EyIDIgMCAwIDAtMi0yaC0yXCIvPjxyZWN0IHg9XCI5XCIgeT1cIjNcIiB3aWR0aD1cIjZcIiBoZWlnaHQ9XCI0XCIgcng9XCIxXCIvPjxwYXRoIGQ9XCJNOSAxMmg2TTkgMTZoNFwiLz48L3N2Zz4sXG4gIHBsdXM6ICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMi4yXCI+PHBhdGggZD1cIk0xMiA1djE0TTUgMTJoMTRcIi8+PC9zdmc+LFxuICBjaGVjazogICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjIuOFwiPjxwYXRoIGQ9XCJNNSAxM2w0IDRMMTkgN1wiLz48L3N2Zz4sXG4gIHg6ICAgICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMi4yXCI+PHBhdGggZD1cIk0xOCA2TDYgMThNNiA2bDEyIDEyXCIvPjwvc3ZnPixcbiAgdXNlcjogICAgIDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIxLjhcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjhcIiByPVwiNFwiLz48cGF0aCBkPVwiTTQgMjBjMC00IDMuNi03IDgtN3M4IDMgOCA3XCIvPjwvc3ZnPixcbiAgc2V0dGluZ3M6IDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIxLjhcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIi8+PHBhdGggZD1cIk0xOS40IDE1YTEuNjUgMS42NSAwIDAgMCAuMzMgMS44MmwuMDYuMDZhMiAyIDAgMCAxLTIuODMgMi44M2wtLjA2LS4wNmExLjY1IDEuNjUgMCAwIDAtMS44Mi0uMzMgMS42NSAxLjY1IDAgMCAwLTEgMS41MVYyMWEyIDIgMCAwIDEtNCAwdi0uMDlBMS42NSAxLjY1IDAgMCAwIDkgMTkuNGExLjY1IDEuNjUgMCAwIDAtMS44Mi4zM2wtLjA2LjA2YTIgMiAwIDAgMS0yLjgzLTIuODNsLjA2LS4wNkExLjY1IDEuNjUgMCAwIDAgNC42OCAxNWExLjY1IDEuNjUgMCAwIDAtMS41MS0xSDNhMiAyIDAgMCAxIDAtNGguMDlBMS42NSAxLjY1IDAgMCAwIDQuNiA5YTEuNjUgMS42NSAwIDAgMC0uMzMtMS44MmwtLjA2LS4wNmEyIDIgMCAwIDEgMi44My0yLjgzbC4wNi4wNkExLjY1IDEuNjUgMCAwIDAgOSA0LjY4YTEuNjUgMS42NSAwIDAgMCAxLTEuNTFWM2EyIDIgMCAwIDEgNCAwdi4wOWExLjY1IDEuNjUgMCAwIDAgMSAxLjUxIDEuNjUgMS42NSAwIDAgMCAxLjgyLS4zM2wuMDYtLjA2YTIgMiAwIDAgMSAyLjgzIDIuODNsLS4wNi4wNkExLjY1IDEuNjUgMCAwIDAgMTkuNCA5YTEuNjUgMS42NSAwIDAgMCAxLjUxIDFIMjFhMiAyIDAgMCAxIDAgNGgtLjA5YTEuNjUgMS42NSAwIDAgMC0xLjUxIDF6XCIvPjwvc3ZnPixcbiAgYmVsbDogICAgIDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIxLjhcIj48cGF0aCBkPVwiTTE4IDhBNiA2IDAgMCAwIDYgOGMwIDctMyA5LTMgOWgxOHMtMy0yLTMtOVwiLz48cGF0aCBkPVwiTTEzLjczIDIxYTIgMiAwIDAgMS0zLjQ2IDBcIi8+PC9zdmc+LFxufTtcblxuLy8g4pSA4pSA4pSAIEFwcCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbndpbmRvdy5BcHAgPSBmdW5jdGlvbiBBcHAoKSB7XG4gIGNvbnN0IFtzdGF0ZSwgc2V0U3RhdGVdID0gdXNlU3RhdGUoKCkgPT4gbG9hZFN0YXRlKCkgfHwgRU1QVFlfU1RBVEUpO1xuICBjb25zdCBbdGFiLCAgIHNldFRhYl0gICA9IHVzZVN0YXRlKFwidG9kYXlcIik7XG4gIGNvbnN0IFttb2RhbCwgc2V0TW9kYWxdID0gdXNlU3RhdGUobnVsbCk7XG4gIGNvbnN0IFt0b2FzdCwgc2V0VG9hc3RdID0gdXNlU3RhdGUobnVsbCk7XG4gIGNvbnN0IFtub3RpZk9rLCBzZXROb3RpZk9rXSA9IHVzZVN0YXRlKCgpID0+IHR5cGVvZiBOb3RpZmljYXRpb24gIT09IFwidW5kZWZpbmVkXCIgJiYgTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gPT09IFwiZ3JhbnRlZFwiKTtcbiAgY29uc3QgW25vdywgc2V0Tm93XSA9IHVzZVN0YXRlKCgpID0+IG5ldyBEYXRlKCkpO1xuICBjb25zdCBmaXJlZFJlZiA9IHVzZVJlZih7fSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHsgc2F2ZVN0YXRlKHN0YXRlKTsgfSwgW3N0YXRlXSk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7IGNvbnN0IHQgPSBzZXRJbnRlcnZhbCgoKSA9PiBzZXROb3cobmV3IERhdGUoKSksIDMwXzAwMCk7IHJldHVybiAoKSA9PiBjbGVhckludGVydmFsKHQpOyB9LCBbXSk7XG5cbiAgLy8g4pSA4pSAIFJlbWluZGVyIGVuZ2luZSDilIDilIBcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoIW5vdGlmT2spIHJldHVybjtcbiAgICBjb25zdCBjaGVjayA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGRhdGUgPSBnZXRMb2dpY2FsRGF0ZSgoc3RhdGUuc2V0dGluZ3MgJiYgc3RhdGUuc2V0dGluZ3MuZGF5UmVzZXRIb3VyKSB8fCAgNCk7XG4gICAgICBjb25zdCBub3dNID0gbm93LmdldEhvdXJzKCkgKiA2MCArIG5vdy5nZXRNaW51dGVzKCk7XG5cbiAgICAgIC8vIOKUgOKUgCBQZXItbWVkaWNhdGlvbiBwZXJpb2QgcmVtaW5kZXJzIOKUgOKUgFxuICAgICAgc3RhdGUubWVkaWNhdGlvbnMuZmlsdGVyKG0gPT4gbS5zdGF0dXMgPT09IFwiYWN0aXZlXCIpLmZvckVhY2gobWVkID0+IHtcbiAgICAgICAgKG1lZC5zY2hlZHVsZXMgfHwgW10pLmZvckVhY2goc2NoZWQgPT4ge1xuICAgICAgICAgIGNvbnN0IGtleSAgPSBkb3NlS2V5KGRhdGUsIG1lZC5pZCwgc2NoZWQucGVyaW9kSWQpO1xuICAgICAgICAgIGNvbnN0IGxvZyAgPSBzdGF0ZS5zY2hlZHVsZUxvZ1trZXldO1xuICAgICAgICAgIGlmIChsb2cpIHJldHVybjtcbiAgICAgICAgICBjb25zdCB0ICAgID0gdG9NaW5zKHBlcmlvZFRpbWUoc2NoZWQpKTtcbiAgICAgICAgICBjb25zdCBkaWZmID0gbm93TSAtIHQ7XG4gICAgICAgICAgaWYgKGRpZmYgPj0gMCAmJiBkaWZmIDwgMiAmJiAhZmlyZWRSZWYuY3VycmVudFtrZXkrXCJfZHVlXCJdKSB7XG4gICAgICAgICAgICBmaXJlZFJlZi5jdXJyZW50W2tleStcIl9kdWVcIl0gPSB0cnVlO1xuICAgICAgICAgICAgbm90aWZ5KFwi6Zmq5LiA5Yi7772c5pyN6Jel5o+Q6YaSXCIsIGDnj77lnKjmmK8keyhQRVJJT0RfTUFQW3NjaGVkLnBlcmlvZElkXSAmJiBQRVJJT0RfTUFQW3NjaGVkLnBlcmlvZElkXS5sYWJlbCl955So6Jel5pmC6ZaT77yM6KiY5b6X5ZCDICR7bWVkLm5hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkaWZmID49IDkwICYmICFmaXJlZFJlZi5jdXJyZW50W2tleStcIl9sYXRlXCJdKSB7XG4gICAgICAgICAgICBmaXJlZFJlZi5jdXJyZW50W2tleStcIl9sYXRlXCJdID0gdHJ1ZTtcbiAgICAgICAgICAgIG5vdGlmeShcIumZquS4gOWIu++9nOmChOaykuWQg+iXpVwiLCBgJHttZWQubmFtZX0gJHsoUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0gJiYgUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0ubGFiZWwpfeeahOWKkemHj+i2hemBjiA5MCDliIbpkJjmnKroqJjpjIRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIOKUgOKUgCBDdXN0b20gcmVtaW5kZXIgdGltZXMgKHNldHRpbmdzKSDilIDilIBcbiAgICAgICgoc3RhdGUuc2V0dGluZ3MgJiYgc3RhdGUuc2V0dGluZ3MucmVtaW5kZXJUaW1lcykgfHwgW10pLmZvckVhY2gocnQgPT4ge1xuICAgICAgICBjb25zdCBmaXJlS2V5ID0gXCJyZW1pbmRlcl9cIiArIGRhdGUgKyBcIl9cIiArIHJ0O1xuICAgICAgICBjb25zdCBkaWZmID0gbm93TSAtIHRvTWlucyhydCk7XG4gICAgICAgIGlmIChkaWZmID49IDAgJiYgZGlmZiA8IDIgJiYgIWZpcmVkUmVmLmN1cnJlbnRbZmlyZUtleV0pIHtcbiAgICAgICAgICBmaXJlZFJlZi5jdXJyZW50W2ZpcmVLZXldID0gdHJ1ZTtcbiAgICAgICAgICBub3RpZnkoXCLpmarkuIDliLvvvZzoqbLlkIPol6XkuoZcIiwgXCLoqJjlvpfmjInmmYLmnI3ol6XvvIznhafpoaflpb3oh6rlt7Eg8J+SilwiKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfTtcbiAgICBjaGVjaygpO1xuICAgIGNvbnN0IHQgPSBzZXRJbnRlcnZhbChjaGVjaywgNjBfMDAwKTtcbiAgICByZXR1cm4gKCkgPT4gY2xlYXJJbnRlcnZhbCh0KTtcbiAgfSwgW25vdGlmT2ssIHN0YXRlLm1lZGljYXRpb25zLCBzdGF0ZS5zY2hlZHVsZUxvZywgc3RhdGUuc2V0dGluZ3MsIG5vd10pO1xuXG4gIGNvbnN0IHNob3dUb2FzdCA9IHVzZUNhbGxiYWNrKChtc2cpID0+IHtcbiAgICBzZXRUb2FzdChtc2cpOyBzZXRUaW1lb3V0KCgpID0+IHNldFRvYXN0KG51bGwpLCAyNDAwKTtcbiAgfSwgW10pO1xuXG4gIGNvbnN0IHVwZGF0ZSA9IHVzZUNhbGxiYWNrKChmbikgPT4ge1xuICAgIHNldFN0YXRlKHByZXYgPT4ge1xuICAgICAgY29uc3QgbmV4dCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocHJldikpOyBmbihuZXh0KTsgcmV0dXJuIG5leHQ7XG4gICAgfSk7XG4gIH0sIFtdKTtcblxuICBjb25zdCBpc1ZpZXdlciA9IChzdGF0ZS5jdXJyZW50VXNlciAmJiBzdGF0ZS5jdXJyZW50VXNlci5yb2xlKSA9PT0gXCJ2aWV3ZXJcIjtcbiAgY29uc3QgZGF5UmVzZXRIb3VyID0gKHN0YXRlLnNldHRpbmdzICYmIHN0YXRlLnNldHRpbmdzLmRheVJlc2V0SG91cikgfHwgIDQ7XG4gIGNvbnN0IGxvZ2ljYWxEYXRlID0gZ2V0TG9naWNhbERhdGUoZGF5UmVzZXRIb3VyKTtcbiAgY29uc3QgYWN0aXZlTWVkcyA9IHN0YXRlLm1lZGljYXRpb25zLmZpbHRlcihtID0+IG0uc3RhdHVzID09PSBcImFjdGl2ZVwiKTtcblxuICBpZiAoIXN0YXRlLmN1cnJlbnRVc2VyKSByZXR1cm4gPE9uYm9hcmRTY3JlZW4gdXBkYXRlPXt1cGRhdGV9IC8+O1xuXG4gIGFzeW5jIGZ1bmN0aW9uIGFza05vdGlmKCkge1xuICAgIGNvbnN0IG9rID0gYXdhaXQgcmVxdWVzdE5vdGlmKCk7XG4gICAgc2V0Tm90aWZPayhvayk7XG4gICAgc2hvd1RvYXN0KG9rID8gXCLinJMg5o+Q6YaS5bey6ZaL5ZWfXCIgOiBcIueAj+imveWZqOaLkue1leS6humAmuefpeasiumZkFwiKTtcbiAgfVxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJhcHBcIj5cbiAgICAgIDxzdHlsZT57Q1NTfTwvc3R5bGU+XG4gICAgICB7dG9hc3QgJiYgPGRpdiBjbGFzc05hbWU9XCJ0b2FzdFwiPnt0b2FzdH08L2Rpdj59XG4gICAgICB7aXNWaWV3ZXIgJiYgPGRpdiBjbGFzc05hbWU9XCJ2aWV3ZXItYmFubmVyXCI+8J+RgCDmqqLoppbmqKHlvI8g4oCUIOS9oOWPquiDvemWseiugO+8jOeEoeazleS/ruaUuTwvZGl2Pn1cbiAgICAgIHtcIk5vdGlmaWNhdGlvblwiIGluIHdpbmRvdyAmJiAhbm90aWZPayAmJiAhaXNWaWV3ZXIgJiYgTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gIT09IFwiZGVuaWVkXCIgJiYgKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm5vdGlmLWJhbm5lclwiPlxuICAgICAgICAgIDxzcGFuPntJY28uYmVsbH0g6ZaL5ZWf5o+Q6YaS77yM5Yiw5pmC6ZaT6Ieq5YuV6YCa55+lPC9zcGFuPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17YXNrTm90aWZ9PumWi+WVnzwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICl9XG5cbiAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSwgZGlzcGxheTogXCJmbGV4XCIsIGZsZXhEaXJlY3Rpb246IFwiY29sdW1uXCIsIG92ZXJmbG93OiBcImhpZGRlblwiIH19PlxuICAgICAgICB7dGFiID09PSBcInRvZGF5XCIgICYmIDxUb2RheVBhZ2UgIHN0YXRlPXtzdGF0ZX0gdXBkYXRlPXt1cGRhdGV9IGlzVmlld2VyPXtpc1ZpZXdlcn0gc2hvd1RvYXN0PXtzaG93VG9hc3R9IHNldE1vZGFsPXtzZXRNb2RhbH0gbG9naWNhbERhdGU9e2xvZ2ljYWxEYXRlfSBub3c9e25vd30gLz59XG4gICAgICAgIHt0YWIgPT09IFwibWVkc1wiICAgJiYgPE1lZHNQYWdlICAgc3RhdGU9e3N0YXRlfSB1cGRhdGU9e3VwZGF0ZX0gaXNWaWV3ZXI9e2lzVmlld2VyfSBzaG93VG9hc3Q9e3Nob3dUb2FzdH0gc2V0TW9kYWw9e3NldE1vZGFsfSBsb2dpY2FsRGF0ZT17bG9naWNhbERhdGV9IC8+fVxuICAgICAgICB7dGFiID09PSBcInZpc2l0c1wiICYmIDxWaXNpdHNQYWdlIHN0YXRlPXtzdGF0ZX0gdXBkYXRlPXt1cGRhdGV9IGlzVmlld2VyPXtpc1ZpZXdlcn0gc2hvd1RvYXN0PXtzaG93VG9hc3R9IHNldE1vZGFsPXtzZXRNb2RhbH0gLz59XG4gICAgICA8L2Rpdj5cblxuICAgICAgPG5hdiBjbGFzc05hbWU9XCJuYXZcIj5cbiAgICAgICAge1t7aWQ6XCJ0b2RheVwiLGxhYmVsOlwi5LuK5pel5LiA5Yi7XCIsaWNvbjpJY28udG9kYXl9LHtpZDpcIm1lZHNcIixsYWJlbDpcIuiXpeeJqea4heWWrlwiLGljb246SWNvLm1lZHN9LHtpZDpcInZpc2l0c1wiLGxhYmVsOlwi55yL6Ki657SA6YyEXCIsaWNvbjpJY28udmlzaXRzfV0ubWFwKGl0ZW09PihcbiAgICAgICAgICA8YnV0dG9uIGtleT17aXRlbS5pZH0gY2xhc3NOYW1lPXtgbmF2LWl0ZW0gJHt0YWI9PT1pdGVtLmlkP1wiYWN0aXZlXCI6XCJcIn1gfSBvbkNsaWNrPXsoKT0+c2V0VGFiKGl0ZW0uaWQpfT5cbiAgICAgICAgICAgIHtpdGVtLmljb259PHNwYW4+e2l0ZW0ubGFiZWx9PC9zcGFuPlxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICApKX1cbiAgICAgIDwvbmF2PlxuXG4gICAgICB7bW9kYWwgPT09IFwiYWRkTWVkXCIgJiYgIWlzVmlld2VyICYmIChcbiAgICAgICAgPEFkZE1lZE1vZGFsIG9uQ2xvc2U9eygpPT5zZXRNb2RhbChudWxsKX0gb25TYXZlPXttZWQ9PntcbiAgICAgICAgICB1cGRhdGUocz0+eyBzLm1lZGljYXRpb25zLnB1c2goey4uLm1lZCxpZDp1aWQoKSxzdGF0dXM6XCJhY3RpdmVcIixyZW1haW5pbmdDb3VudDptZWQudG90YWxDb3VudCxjcmVhdGVkQXQ6bmV3IERhdGUoKS50b0lTT1N0cmluZygpfSk7IH0pO1xuICAgICAgICAgIHNob3dUb2FzdChcIuKckyDlt7LmlrDlop7ol6XnialcIik7IHNldE1vZGFsKG51bGwpO1xuICAgICAgICB9fS8+XG4gICAgICApfVxuICAgICAge21vZGFsID09PSBcImFkZFZpc2l0XCIgJiYgIWlzVmlld2VyICYmIChcbiAgICAgICAgPEFkZFZpc2l0TW9kYWwgbWVkaWNhdGlvbnM9e2FjdGl2ZU1lZHN9IGFsbE1lZHM9e3N0YXRlLm1lZGljYXRpb25zfSBvbkNsb3NlPXsoKT0+c2V0TW9kYWwobnVsbCl9XG4gICAgICAgICAgb25TYXZlPXt2aXNpdD0+e1xuICAgICAgICAgICAgdXBkYXRlKHM9PntcbiAgICAgICAgICAgICAgcy5kb2N0b3JWaXNpdHMudW5zaGlmdCh7Li4udmlzaXQsaWQ6dWlkKCl9KTtcbiAgICAgICAgICAgICAgLy8gTWFyayBhbGwgYWN0aXZlIG1lZHMgYXMgcGF1c2VkIHVubGVzcyBpbiBjb250aW51ZWRJZHMgb3IgbmV3SWRzXG4gICAgICAgICAgICAgIGNvbnN0IGNvbnRpbnVlZCA9IG5ldyBTZXQodmlzaXQuY29udGludWVkSWRzKTtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SWRzICAgID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgICAvLyBBZGQgbmV3IG1lZHNcbiAgICAgICAgICAgICAgKHZpc2l0Lm5ld01lZHN8fFtdKS5mb3JFYWNoKG5tPT57XG4gICAgICAgICAgICAgICAgY29uc3QgaWQgPSB1aWQoKTtcbiAgICAgICAgICAgICAgICBuZXdJZHMuYWRkKGlkKTtcbiAgICAgICAgICAgICAgICBzLm1lZGljYXRpb25zLnB1c2goe2lkLCBuYW1lOm5tLm5hbWUsIHNjaGVkdWxlczpubS5zY2hlZHVsZXMsIHRvdGFsQ291bnQ6bm0udG90YWxDb3VudCwgcmVtYWluaW5nQ291bnQ6bm0udG90YWxDb3VudCwgc3RhdHVzOlwiYWN0aXZlXCIsIGNyZWF0ZWRBdDp2aXNpdC5kYXRlfSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAvLyBTdG9wIHVuY2hlY2tlZCBhY3RpdmUgbWVkc1xuICAgICAgICAgICAgICBzLm1lZGljYXRpb25zLmZvckVhY2gobT0+e1xuICAgICAgICAgICAgICAgIGlmKG0uc3RhdHVzPT09XCJhY3RpdmVcIiAmJiAhY29udGludWVkLmhhcyhtLmlkKSAmJiAhbmV3SWRzLmhhcyhtLmlkKSkgbS5zdGF0dXM9XCJwYXVzZWRcIjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNob3dUb2FzdChcIuKckyDnnIvoqLrntIDpjITlt7LlhLLlrZhcIik7IHNldE1vZGFsKG51bGwpO1xuICAgICAgICAgIH19XG4gICAgICAgIC8+XG4gICAgICApfVxuICAgICAge21vZGFsID09PSBcInNldHRpbmdzXCIgJiYgKFxuICAgICAgICA8U2V0dGluZ3NNb2RhbCBzdGF0ZT17c3RhdGV9IHVwZGF0ZT17dXBkYXRlfSBvbkNsb3NlPXsoKT0+c2V0TW9kYWwobnVsbCl9IHNob3dUb2FzdD17c2hvd1RvYXN0fSBub3RpZk9rPXtub3RpZk9rfSBhc2tOb3RpZj17YXNrTm90aWZ9IC8+XG4gICAgICApfVxuICAgICAge21vZGFsID09PSBcInByb2ZpbGVcIiAmJiAoXG4gICAgICAgIDxQcm9maWxlTW9kYWwgc3RhdGU9e3N0YXRlfSB1cGRhdGU9e3VwZGF0ZX0gb25DbG9zZT17KCk9PnNldE1vZGFsKG51bGwpfSBzaG93VG9hc3Q9e3Nob3dUb2FzdH0gLz5cbiAgICAgICl9XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8vIOKUgOKUgOKUgCBUb2RheSBwYWdlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuZnVuY3Rpb24gVG9kYXlQYWdlKHsgc3RhdGUsIHVwZGF0ZSwgaXNWaWV3ZXIsIHNob3dUb2FzdCwgc2V0TW9kYWwsIGxvZ2ljYWxEYXRlLCBub3cgfSkge1xuICBjb25zdCBhY3RpdmVNZWRzID0gc3RhdGUubWVkaWNhdGlvbnMuZmlsdGVyKG0gPT4gbS5zdGF0dXMgPT09IFwiYWN0aXZlXCIpO1xuICBjb25zdCBkYXlSZXNldEhvdXIgPSAoc3RhdGUuc2V0dGluZ3MgJiYgc3RhdGUuc2V0dGluZ3MuZGF5UmVzZXRIb3VyKSB8fCAgNDtcbiAgY29uc3Qgbm93TWlucyA9IG5vdy5nZXRIb3VycygpICogNjAgKyBub3cuZ2V0TWludXRlcygpO1xuXG4gIC8vIEJ1aWxkIHBlcmlvZCBncm91cHM6IHsgcGVyaW9kSWQsIGxhYmVsLCBpY29uLCB0aW1lLCBtZWRzW10gfVxuICBjb25zdCBwZXJpb2RHcm91cE1hcCA9IHt9O1xuICBhY3RpdmVNZWRzLmZvckVhY2gobWVkID0+IHtcbiAgICAobWVkLnNjaGVkdWxlcyB8fCBbXSkuZm9yRWFjaChzY2hlZCA9PiB7XG4gICAgICBjb25zdCBwaWQgPSBzY2hlZC5wZXJpb2RJZDtcbiAgICAgIGlmICghcGVyaW9kR3JvdXBNYXBbcGlkXSkge1xuICAgICAgICBwZXJpb2RHcm91cE1hcFtwaWRdID0ge1xuICAgICAgICAgIHBlcmlvZElkOiBwaWQsXG4gICAgICAgICAgbGFiZWw6ICAgIChQRVJJT0RfTUFQW3BpZF0gJiYgUEVSSU9EX01BUFtwaWRdLmxhYmVsKSB8fCBwaWQsXG4gICAgICAgICAgaWNvbjogICAgIChQRVJJT0RfTUFQW3BpZF0gJiYgUEVSSU9EX01BUFtwaWRdLmljb24pICB8fCBcIuKPsFwiLFxuICAgICAgICAgIHRpbWU6ICAgICBwZXJpb2RUaW1lKHNjaGVkKSxcbiAgICAgICAgICBtZWRzOiAgICAgW10sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBwZXJpb2RHcm91cE1hcFtwaWRdLm1lZHMucHVzaCh7IG1lZCwgc2NoZWQsIGtleTogZG9zZUtleShsb2dpY2FsRGF0ZSwgbWVkLmlkLCBwaWQpIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBPYmplY3QudmFsdWVzKHBlcmlvZEdyb3VwTWFwKS5zb3J0KChhLCBiKSA9PiB0b01pbnMoYS50aW1lKSAtIHRvTWlucyhiLnRpbWUpKTtcbiAgY29uc3QgdG90YWxHcm91cHMgPSBncm91cHMubGVuZ3RoO1xuICBjb25zdCBkb25lR3JvdXBzICA9IGdyb3Vwcy5maWx0ZXIoZyA9PiBnLm1lZHMuZXZlcnkoKHsga2V5IH0pID0+ICEhc3RhdGUuc2NoZWR1bGVMb2dba2V5XT8udGFrZW5BdCkpLmxlbmd0aDtcbiAgY29uc3QgcGN0ID0gdG90YWxHcm91cHMgPiAwID8gTWF0aC5yb3VuZCgoZG9uZUdyb3VwcyAvIHRvdGFsR3JvdXBzKSAqIDEwMCkgOiAwO1xuXG4gIGNvbnN0IENJUkMgPSAyICogTWF0aC5QSSAqIDI2OyAvLyByPTI2XG5cbiAgZnVuY3Rpb24gbWFya1BlcmlvZFRha2VuKGdyb3VwKSB7XG4gICAgaWYgKGlzVmlld2VyKSByZXR1cm47XG4gICAgY29uc3QgdGFrZW5BdCA9IG5vd0hITU0oKTtcbiAgICB1cGRhdGUocyA9PiB7XG4gICAgICBncm91cC5tZWRzLmZvckVhY2goKHsga2V5LCBzY2hlZCwgbWVkIH0pID0+IHtcbiAgICAgICAgcy5zY2hlZHVsZUxvZ1trZXldID0geyB0YWtlbkF0IH07XG4gICAgICAgIGNvbnN0IG0gPSBzLm1lZGljYXRpb25zLmZpbmQobSA9PiBtLmlkID09PSBtZWQuaWQpO1xuICAgICAgICBpZiAobSkgbS5yZW1haW5pbmdDb3VudCA9IE1hdGgubWF4KDAsIChtLnJlbWFpbmluZ0NvdW50IHx8IDApIC0gc2NoZWQuZG9zZSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBzaG93VG9hc3QoYOKckyAke2dyb3VwLmxhYmVsfSDlt7LlrozmiJBgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVuZG9QZXJpb2QoZ3JvdXApIHtcbiAgICBpZiAoaXNWaWV3ZXIpIHJldHVybjtcbiAgICB1cGRhdGUocyA9PiB7XG4gICAgICBncm91cC5tZWRzLmZvckVhY2goKHsga2V5LCBzY2hlZCwgbWVkIH0pID0+IHtcbiAgICAgICAgaWYgKHMuc2NoZWR1bGVMb2dba2V5XT8udGFrZW5BdCkge1xuICAgICAgICAgIGNvbnN0IG0gPSBzLm1lZGljYXRpb25zLmZpbmQobSA9PiBtLmlkID09PSBtZWQuaWQpO1xuICAgICAgICAgIGlmIChtKSBtLnJlbWFpbmluZ0NvdW50ID0gTWF0aC5taW4obS50b3RhbENvdW50LCAobS5yZW1haW5pbmdDb3VudCB8fCAwKSArIHNjaGVkLmRvc2UpO1xuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSBzLnNjaGVkdWxlTG9nW2tleV07XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBzaG93VG9hc3QoXCLlt7LmkqTpirdcIik7XG4gIH1cblxuICByZXR1cm4gKFxuICAgIDw+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlclwiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlci1yb3dcIj5cbiAgICAgICAgICA8aDI+5LuK5pel5LiA5Yi7PC9oMj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlci1pY29uc1wiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZGF0ZS1jaGlwXCI+e2xvZ2ljYWxEYXRlfTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuLWljb25cIiBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJzZXR0aW5nc1wiKX0+e0ljby5zZXR0aW5nc308L2J1dHRvbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuLWljb25cIiBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJwcm9maWxlXCIpfT57SWNvLnVzZXJ9PC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1haW5cIj5cbiAgICAgICAgey8qIEhlcm8gcHJvZ3Jlc3MgcmluZyAqL31cbiAgICAgICAge3RvdGFsR3JvdXBzID4gMCAmJiAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0b2RheS1oZXJvXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlcm8tcHJvZ3Jlc3NcIj5cbiAgICAgICAgICAgICAgPHN2Zz5cbiAgICAgICAgICAgICAgICA8Y2lyY2xlIGNsYXNzTmFtZT1cInRyYWNrXCIgY3g9XCIzNFwiIGN5PVwiMzRcIiByPVwiMjZcIi8+XG4gICAgICAgICAgICAgICAgPGNpcmNsZSBjbGFzc05hbWU9XCJmaWxsXCIgIGN4PVwiMzRcIiBjeT1cIjM0XCIgcj1cIjI2XCJcbiAgICAgICAgICAgICAgICAgIHN0cm9rZURhc2hhcnJheT17Q0lSQ31cbiAgICAgICAgICAgICAgICAgIHN0cm9rZURhc2hvZmZzZXQ9e0NJUkMgLSAoQ0lSQyAqIHBjdCAvIDEwMCl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9zdmc+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaGVyby1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm51bVwiPntkb25lR3JvdXBzfTwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVuXCI+LyB7dG90YWxHcm91cHN9PC9kaXY+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlcm8tdGV4dFwiPlxuICAgICAgICAgICAgICA8aDM+XG4gICAgICAgICAgICAgICAge3BjdCA9PT0gMTAwID8gXCLku4rlpKnlhajpg6jlrozmiJAg8J+Mv1wiXG4gICAgICAgICAgICAgICAgICA6IGRvbmVHcm91cHMgPT09IDAgPyBcIuS7iuWkqemChOaykuaciee0gOmMhFwiXG4gICAgICAgICAgICAgICAgICA6IGDlt7LlrozmiJAgJHtwY3R9JWB9XG4gICAgICAgICAgICAgIDwvaDM+XG4gICAgICAgICAgICAgIDxwPlxuICAgICAgICAgICAgICAgIHtwY3QgPT09IDEwMCA/IFwi6Kyd6Kyd5L2g6KqN55yf54Wn6aGn6Ieq5bexXCJcbiAgICAgICAgICAgICAgICAgIDogYOmChOaciSAke3RvdGFsR3JvdXBzIC0gZG9uZUdyb3Vwc30g5YCL5pmC5q615b6F5pyN6JelYH1cbiAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICl9XG5cbiAgICAgICAge2dyb3Vwcy5sZW5ndGggPT09IDAgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJlbXB0eS1zdGF0ZVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpY29uXCI+4pyoPC9kaXY+XG4gICAgICAgICAgICA8cD7pgoTmspLmnInoqK3lrprol6XnianmmYLnqIs8L3A+XG4gICAgICAgICAgICB7IWlzVmlld2VyICYmIChcbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXByaW1hcnlcIiBzdHlsZT17e21hcmdpblRvcDoxNixkaXNwbGF5OlwiaW5saW5lLWZsZXhcIn19IG9uQ2xpY2s9eygpPT5zZXRNb2RhbChcImFkZE1lZFwiKX0+5paw5aKe6Jel54mpPC9idXR0b24+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuICAgICAgICAgIGdyb3Vwcy5tYXAoZ3JvdXAgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWxsRG9uZSAgPSBncm91cC5tZWRzLmV2ZXJ5KCh7a2V5fSkgPT4gISFzdGF0ZS5zY2hlZHVsZUxvZ1trZXldPy50YWtlbkF0KTtcbiAgICAgICAgICAgIGNvbnN0IGFueURvbmUgID0gZ3JvdXAubWVkcy5zb21lKCh7a2V5fSkgID0+ICEhc3RhdGUuc2NoZWR1bGVMb2dba2V5XT8udGFrZW5BdCk7XG4gICAgICAgICAgICBjb25zdCB0TWlucyAgICA9IHRvTWlucyhncm91cC50aW1lKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTGF0ZSAgID0gIWFsbERvbmUgJiYgbm93TWlucyAtIHRNaW5zID4gMzA7XG4gICAgICAgICAgICBjb25zdCBpc05vdyAgICA9ICFhbGxEb25lICYmIG5vd01pbnMgLSB0TWlucyA+PSAwICYmIG5vd01pbnMgLSB0TWlucyA8PSAzMDtcblxuICAgICAgICAgICAgbGV0IGNhcmRDbGFzcyA9IFwicGVyaW9kLWNhcmRcIjtcbiAgICAgICAgICAgIGlmIChhbGxEb25lKSBjYXJkQ2xhc3MgKz0gXCIgaXMtZG9uZVwiO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNOb3cpICBjYXJkQ2xhc3MgKz0gXCIgaXMtbm93XCI7XG4gICAgICAgICAgICBlbHNlIGlmIChpc0xhdGUpIGNhcmRDbGFzcyArPSBcIiBpcy1sYXRlXCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGZpcnN0VGFrZW5BdCA9IGdyb3VwLm1lZHMubWFwKCh7a2V5fSk9PnN0YXRlLnNjaGVkdWxlTG9nW2tleV0/LnRha2VuQXQpLmZpbHRlcihCb29sZWFuKVswXTtcblxuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgPGRpdiBrZXk9e2dyb3VwLnBlcmlvZElkfSBjbGFzc05hbWU9XCJwZXJpb2QtZ3JvdXBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInBlcmlvZC10aXRsZVwiPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicGVyaW9kLWljb25cIj57Z3JvdXAuaWNvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICA8c3Bhbj57Z3JvdXAubGFiZWx9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicGVyaW9kLXRpbWVcIj57Z3JvdXAudGltZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e2NhcmRDbGFzc30+XG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInBlcmlvZC1tZWRzXCI+XG4gICAgICAgICAgICAgICAgICAgIHtncm91cC5tZWRzLm1hcCgoe21lZCwgc2NoZWQsIGtleX0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsb2cgPSBzdGF0ZS5zY2hlZHVsZUxvZ1trZXldO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17a2V5fSBjbGFzc05hbWU9XCJwZXJpb2QtbWVkLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGVyaW9kLW1lZC1uYW1lXCI+e21lZC5uYW1lfTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGVyaW9kLW1lZC1kb3NlXCI+e3NjaGVkLmRvc2V9IOmhhjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwZXJpb2QtbWVkLWNoZWNrXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyhsb2cgJiYgbG9nLnRha2VuQXQpID8gXCLinIVcIiA6IFwi4peLXCJ9XG4gICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgcGVyaW9kLWZvb3RlciAke2FsbERvbmU/XCJkb25lXCI6aXNMYXRlP1wibGF0ZVwiOlwiXCJ9YH0+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGVyaW9kLWZvb3Rlci1sYWJlbFwiPlxuICAgICAgICAgICAgICAgICAgICAgIHthbGxEb25lID8gYOKckyDlt7LmnI3ol6UgJHtmaXJzdFRha2VuQXQgfHwgXCJcIn1gIDogaXNMYXRlID8gYOKaoCDlt7LotoXpgY4gJHtub3dNaW5zIC0gdE1pbnN9IOWIhumQmGAgOiBpc05vdyA/IFwi4o+wIOePvuWcqOacjeiXpeaZgumWk1wiIDogXCJcIn1cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIHshaXNWaWV3ZXIgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgIGFsbERvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgID8gPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4tdW5kb1wiIG9uQ2xpY2s9eygpPT51bmRvUGVyaW9kKGdyb3VwKX0+5pKk6Yq3PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICA6IDxidXR0b24gY2xhc3NOYW1lPVwiYnRuLXRha2UtcGVyaW9kXCIgb25DbGljaz17KCk9Pm1hcmtQZXJpb2RUYWtlbihncm91cCl9PuW3suacjeeUqDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApfVxuXG4gICAgICA8L2Rpdj5cbiAgICA8Lz5cbiAgKTtcbn1cblxuLy8g4pSA4pSA4pSAIE1lZHMgcGFnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIE1lZHNQYWdlKHsgc3RhdGUsIHVwZGF0ZSwgaXNWaWV3ZXIsIHNob3dUb2FzdCwgc2V0TW9kYWwsIGxvZ2ljYWxEYXRlIH0pIHtcbiAgY29uc3QgYWN0aXZlID0gc3RhdGUubWVkaWNhdGlvbnMuZmlsdGVyKG0gPT4gbS5zdGF0dXMgPT09IFwiYWN0aXZlXCIpO1xuICBjb25zdCBwYXVzZWQgPSBzdGF0ZS5tZWRpY2F0aW9ucy5maWx0ZXIobSA9PiBtLnN0YXR1cyA9PT0gXCJwYXVzZWRcIik7XG5cbiAgZnVuY3Rpb24gdG9nZ2xlKGlkKSB7XG4gICAgaWYgKGlzVmlld2VyKSByZXR1cm47XG4gICAgdXBkYXRlKHMgPT4geyBjb25zdCBtPXMubWVkaWNhdGlvbnMuZmluZChtPT5tLmlkPT09aWQpOyBpZihtKSBtLnN0YXR1cz1tLnN0YXR1cz09PVwiYWN0aXZlXCI/XCJwYXVzZWRcIjpcImFjdGl2ZVwiOyB9KTtcbiAgICBzaG93VG9hc3QoXCLni4DmhYvlt7Lmm7TmlrBcIik7XG4gIH1cblxuICByZXR1cm4gKFxuICAgIDw+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlclwiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlci1yb3dcIj5cbiAgICAgICAgICA8aDI+6Jel54mp5riF5ZauPC9oMj5cbiAgICAgICAgICB7IWlzVmlld2VyICYmIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuLWljb25cIiBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJhZGRNZWRcIil9PntJY28ucGx1c308L2J1dHRvbj59XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1haW5cIj5cbiAgICAgICAge3N0YXRlLm1lZGljYXRpb25zLmxlbmd0aD09PTAgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJlbXB0eS1zdGF0ZVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpY29uXCI+4pyoPC9kaXY+XG4gICAgICAgICAgICA8cD7pgoTmspLmnInol6XnianntIDpjIQ8L3A+XG4gICAgICAgICAgICB7IWlzVmlld2VyICYmIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1wcmltYXJ5XCIgc3R5bGU9e3ttYXJnaW5Ub3A6MTYsZGlzcGxheTpcImlubGluZS1mbGV4XCJ9fSBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJhZGRNZWRcIil9PuaWsOWinuiXpeeJqTwvYnV0dG9uPn1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKSA6IDw+XG4gICAgICAgICAge2FjdGl2ZS5sZW5ndGg+MCAmJiA8PjxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi10aXRsZVwiPuacjeeUqOS4rTwvZGl2PnthY3RpdmUubWFwKG09PjxNZWRDYXJkIGtleT17bS5pZH0gbWVkPXttfSBpc1ZpZXdlcj17aXNWaWV3ZXJ9IG9uVG9nZ2xlPXt0b2dnbGV9Lz4pfTwvPn1cbiAgICAgICAgICB7cGF1c2VkLmxlbmd0aD4wICYmIDw+PGRpdiBjbGFzc05hbWU9XCJzZWN0aW9uLXRpdGxlXCI+5bey5YGc6JelPC9kaXY+e3BhdXNlZC5tYXAobT0+PE1lZENhcmQga2V5PXttLmlkfSBtZWQ9e219IGlzVmlld2VyPXtpc1ZpZXdlcn0gb25Ub2dnbGU9e3RvZ2dsZX0vPil9PC8+fVxuICAgICAgICA8Lz59XG4gICAgICA8L2Rpdj5cbiAgICAgIHshaXNWaWV3ZXIgJiYgPGJ1dHRvbiBjbGFzc05hbWU9XCJmYWJcIiBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJhZGRNZWRcIil9Pu+8izwvYnV0dG9uPn1cbiAgICA8Lz5cbiAgKTtcbn1cblxuZnVuY3Rpb24gTWVkQ2FyZCh7IG1lZCwgaXNWaWV3ZXIsIG9uVG9nZ2xlIH0pIHtcbiAgY29uc3QgcGN0ID0gbWVkLnRvdGFsQ291bnQgPiAwID8gTWF0aC5yb3VuZChtZWQucmVtYWluaW5nQ291bnQgLyBtZWQudG90YWxDb3VudCAqIDEwMCkgOiAwO1xuICBjb25zdCBkYWlseURvc2UgPSAobWVkLnNjaGVkdWxlc3x8W10pLnJlZHVjZSgocyxzYyk9PnMrc2MuZG9zZSwwKTtcbiAgY29uc3QgZXN0ID0gZXN0aW1hdGVGaW5pc2hEYXRlKG1lZC5yZW1haW5pbmdDb3VudCwgZGFpbHlEb3NlKTtcbiAgY29uc3QgbG93ID0gZXN0ICYmIGVzdC5kYXlzIDwgNztcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPXtgbWVkLWNhcmQgJHttZWQuc3RhdHVzfWB9PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJtZWQtY2FyZC10b3BcIj5cbiAgICAgICAgPGRpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1lZC1jYXJkLW5hbWVcIj57bWVkLm5hbWV9PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9e2BzdGF0dXMtdGFnICR7bWVkLnN0YXR1cz09PVwiYWN0aXZlXCI/XCJ0YWctYWN0aXZlXCI6XCJ0YWctcGF1c2VkXCJ9YH0+XG4gICAgICAgICAge21lZC5zdGF0dXM9PT1cImFjdGl2ZVwiP1wi5pyN55So5LitXCI6XCLlt7LlgZzol6VcIn1cbiAgICAgICAgPC9zcGFuPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLXBlcmlvZC10YWdzXCI+XG4gICAgICAgIHsobWVkLnNjaGVkdWxlc3x8W10pLm1hcCgoc2NoZWQsaSkgPT4gKFxuICAgICAgICAgIDxzcGFuIGtleT17aX0gY2xhc3NOYW1lPVwibWVkLXBlcmlvZC10YWdcIj5cbiAgICAgICAgICAgIHsoUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0gJiYgUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0uaWNvbil9IHsoUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0gJiYgUEVSSU9EX01BUFtzY2hlZC5wZXJpb2RJZF0ubGFiZWwpfSDDlyB7c2NoZWQuZG9zZX0g6aGGXG4gICAgICAgICAgPC9zcGFuPlxuICAgICAgICApKX1cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1lZC1zdGF0c1wiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1lZC1zdGF0XCI+PGRpdiBjbGFzc05hbWU9XCJ2YWxcIj57bWVkLnJlbWFpbmluZ0NvdW50fTwvZGl2PjxkaXYgY2xhc3NOYW1lPVwibGJsXCI+5Ymp6aSY6aGGPC9kaXY+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLXN0YXRcIj48ZGl2IGNsYXNzTmFtZT1cInZhbFwiPnttZWQudG90YWxDb3VudH08L2Rpdj48ZGl2IGNsYXNzTmFtZT1cImxibFwiPue4vemhhuaVuDwvZGl2PjwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1lZC1zdGF0XCI+PGRpdiBjbGFzc05hbWU9XCJ2YWxcIj57ZGFpbHlEb3NlfTwvZGl2PjxkaXYgY2xhc3NOYW1lPVwibGJsXCI+5q+P5pel6aGGPC9kaXY+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLXN0YXRcIj48ZGl2IGNsYXNzTmFtZT1cInZhbFwiPntwY3R9JTwvZGl2PjxkaXYgY2xhc3NOYW1lPVwibGJsXCI+5Ymp6aSY546HPC9kaXY+PC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJwcm9ncmVzcy13cmFwXCI+PGRpdiBjbGFzc05hbWU9XCJwcm9ncmVzcy1maWxsXCIgc3R5bGU9e3t3aWR0aDpgJHtwY3R9JWAsIGJhY2tncm91bmQ6IGxvdz9cInZhcigtLXJvc2UpXCI6XCJ2YXIoLS1zYWdlKVwifX0vPjwvZGl2PlxuXG4gICAgICB7ZXN0ICYmIChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJlc3RpbWF0ZS1yb3dcIj5cbiAgICAgICAgICA8c3Bhbj7pgoTlj6/ku6XlkIM8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZGF5c1wiIHN0eWxlPXt7Y29sb3I6IGxvdz9cInZhcigtLXJvc2UpXCI6XCJ2YXIoLS1zYWdlKVwifX0+e2VzdC5kYXlzfSDlpKk8L3NwYW4+XG4gICAgICAgICAgPHNwYW4+772c6aCQ5LywIHtlc3QuZGF0ZX0g5ZCD5a6MPC9zcGFuPlxuICAgICAgICAgIHtsb3cgJiYgPHNwYW4gc3R5bGU9e3tjb2xvcjpcInZhcigtLXJvc2UpXCIsZm9udFNpemU6XCIwLjcycmVtXCIsbWFyZ2luTGVmdDo0fX0+4pqgIOW/q+imgeS4jeWkoOS6hjwvc3Bhbj59XG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cblxuICAgICAgeyFpc1ZpZXdlciAmJiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLWZvb3RlclwiPlxuICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zbSBidG4tZ2hvc3RcIiBvbkNsaWNrPXsoKT0+b25Ub2dnbGUobWVkLmlkKX0+XG4gICAgICAgICAgICB7bWVkLnN0YXR1cz09PVwiYWN0aXZlXCI/XCLmmqvlgZzmraTol6VcIjpcIuaBouW+qeacjeeUqFwifVxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICl9XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8vIOKUgOKUgOKUgCBWaXNpdHMgcGFnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIFZpc2l0c1BhZ2UoeyBzdGF0ZSwgdXBkYXRlLCBpc1ZpZXdlciwgc2hvd1RvYXN0LCBzZXRNb2RhbCB9KSB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5zdGF0ZS5kb2N0b3JWaXNpdHNdLnNvcnQoKGEsYik9PmIuZGF0ZS5sb2NhbGVDb21wYXJlKGEuZGF0ZSkpO1xuICBmdW5jdGlvbiBnZXRNZWROYW1lKGlkKSB7IHJldHVybiBzdGF0ZS5tZWRpY2F0aW9ucy5maW5kKG09Pm0uaWQ9PT1pZCk/Lm5hbWUgfHwgXCLigJRcIjsgfVxuXG4gIHJldHVybiAoXG4gICAgPD5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaGVhZGVyXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaGVhZGVyLXJvd1wiPlxuICAgICAgICAgIDxoMj7nnIvoqLrntIDpjIQ8L2gyPlxuICAgICAgICAgIHshaXNWaWV3ZXIgJiYgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4taWNvblwiIG9uQ2xpY2s9eygpPT5zZXRNb2RhbChcImFkZFZpc2l0XCIpfT57SWNvLnBsdXN9PC9idXR0b24+fVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJtYWluXCI+XG4gICAgICAgIHtzb3J0ZWQubGVuZ3RoPT09MCA/IChcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImVtcHR5LXN0YXRlXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImljb25cIj7wn5OLPC9kaXY+XG4gICAgICAgICAgICA8cD7pgoTmspLmnInnnIvoqLrntIDpjIQ8L3A+XG4gICAgICAgICAgICB7IWlzVmlld2VyICYmIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1wcmltYXJ5XCIgc3R5bGU9e3ttYXJnaW5Ub3A6MTYsZGlzcGxheTpcImlubGluZS1mbGV4XCJ9fSBvbkNsaWNrPXsoKT0+c2V0TW9kYWwoXCJhZGRWaXNpdFwiKX0+5paw5aKe55yL6Ki6PC9idXR0b24+fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGltZWxpbmVcIj5cbiAgICAgICAgICAgIHtzb3J0ZWQubWFwKHZpc2l0PT4oXG4gICAgICAgICAgICAgIDxkaXYga2V5PXt2aXNpdC5pZH0gY2xhc3NOYW1lPVwidmlzaXQtaXRlbVwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidmlzaXQtY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ2aXNpdC1kYXRlLWJhclwiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ2aXNpdC1kYXRlXCI+e3Zpc2l0LmRhdGV9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ2aXNpdC1ob3NwaXRhbFwiPnt2aXNpdC5ob3NwaXRhbHx8dmlzaXQuZG9jdG9yfHxcIlwifTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ2aXNpdC1ib2R5XCI+XG4gICAgICAgICAgICAgICAgICAgIHt2aXNpdC5ub3RlICYmIDxwIGNsYXNzTmFtZT1cInZpc2l0LW5vdGVcIj7jgIx7dmlzaXQubm90ZX3jgI08L3A+fVxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImNoYW5nZS1saXN0XCI+XG4gICAgICAgICAgICAgICAgICAgICAgeyh2aXNpdC5jb250aW51ZWRJZHN8fFtdKS5tYXAoaWQ9PihcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYga2V5PXtpZH0gY2xhc3NOYW1lPVwiY2hhbmdlLWNoaXAgY2hpcC1jb250aW51ZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJjaGlwLWxhYmVsXCI+57m857qMPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICA8c3Bhbj7ihpcge2dldE1lZE5hbWUoaWQpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICAgICAgICAgIHsodmlzaXQuc3RvcHBlZElkc3x8W10pLm1hcChpZD0+KFxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBrZXk9e2lkfSBjbGFzc05hbWU9XCJjaGFuZ2UtY2hpcCBjaGlwLXN0b3BcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiY2hpcC1sYWJlbFwiPuWBnOiXpTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4+4pyVIHtnZXRNZWROYW1lKGlkKX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICApKX1cbiAgICAgICAgICAgICAgICAgICAgICB7KHZpc2l0Lm5ld01lZHN8fFtdKS5tYXAoKG5tLGkpPT4oXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17aX0gY2xhc3NOYW1lPVwiY2hhbmdlLWNoaXAgY2hpcC1uZXdcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiY2hpcC1sYWJlbFwiPuaWsOiXpTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4+4pymIHtubS5uYW1lfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICkpfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApfVxuICAgICAgPC9kaXY+XG4gICAgICB7IWlzVmlld2VyICYmIDxidXR0b24gY2xhc3NOYW1lPVwiZmFiXCIgb25DbGljaz17KCk9PnNldE1vZGFsKFwiYWRkVmlzaXRcIil9Pu+8izwvYnV0dG9uPn1cbiAgICA8Lz5cbiAgKTtcbn1cblxuLy8g4pSA4pSA4pSAIFBlcmlvZCBzZWxlY3RvciBjb21wb25lbnQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5mdW5jdGlvbiBQZXJpb2RTZWxlY3Rvcih7IHNlbGVjdGVkLCBvbkNoYW5nZSB9KSB7XG4gIC8vIHNlbGVjdGVkOiBbeyBwZXJpb2RJZCwgY3VzdG9tVGltZT8sIGRvc2UgfV1cbiAgY29uc3QgaXNTZWxlY3RlZCA9IChwaWQpID0+IHNlbGVjdGVkLnNvbWUocyA9PiBzLnBlcmlvZElkID09PSBwaWQpO1xuXG4gIGZ1bmN0aW9uIHRvZ2dsZShwaWQpIHtcbiAgICBpZiAoaXNTZWxlY3RlZChwaWQpKSB7XG4gICAgICBvbkNoYW5nZShzZWxlY3RlZC5maWx0ZXIocyA9PiBzLnBlcmlvZElkICE9PSBwaWQpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVmYXVsdFQgPSAoUEVSSU9EX01BUFtwaWRdICYmIFBFUklPRF9NQVBbcGlkXS5kZWZhdWx0VGltZSkgfHwgXCIwODowMFwiO1xuICAgICAgb25DaGFuZ2UoWy4uLnNlbGVjdGVkLCB7IHBlcmlvZElkOiBwaWQsIGN1c3RvbVRpbWU6IHBpZCA9PT0gXCJjdXN0b21cIiA/IGRlZmF1bHRUIDogbnVsbCwgZG9zZTogMSB9XSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU2NoZWQocGlkLCBwYXRjaCkge1xuICAgIG9uQ2hhbmdlKHNlbGVjdGVkLm1hcChzID0+IHMucGVyaW9kSWQgPT09IHBpZCA/IHsgLi4ucywgLi4ucGF0Y2ggfSA6IHMpKTtcbiAgfVxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJwZXJpb2Qtc2VsZWN0b3JcIj5cbiAgICAgIHtQRVJJT0RTLm1hcChwID0+IHtcbiAgICAgICAgY29uc3Qgc2VsICA9IGlzU2VsZWN0ZWQocC5pZCk7XG4gICAgICAgIGNvbnN0IHNjaGVkID0gc2VsZWN0ZWQuZmluZChzID0+IHMucGVyaW9kSWQgPT09IHAuaWQpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIDxkaXYga2V5PXtwLmlkfT5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgcGVyaW9kLW9wdGlvbiAke3NlbCA/IFwic2VsZWN0ZWRcIiA6IFwiXCJ9YH0gb25DbGljaz17KCkgPT4gdG9nZ2xlKHAuaWQpfT5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicGVyaW9kLW9wdGlvbi1pY29uXCI+e3AuaWNvbn08L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInBlcmlvZC1vcHRpb24tbGFiZWxcIj57cC5sYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgIHshc2VsICYmIDxzcGFuIGNsYXNzTmFtZT1cInBlcmlvZC1vcHRpb24tdGltZVwiPntwLmRlZmF1bHRUaW1lfTwvc3Bhbj59XG4gICAgICAgICAgICAgIHtzZWwgJiYgPHNwYW4gc3R5bGU9e3tjb2xvcjpcInZhcigtLXJvc2UpXCIsZm9udFNpemU6XCIwLjg1cmVtXCIsZm9udFdlaWdodDo3MDB9fT7inJM8L3NwYW4+fVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICB7c2VsICYmIChcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwZXJpb2QtZG9zZS1yb3dcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT17e2ZvbnRTaXplOlwiMC43OHJlbVwiLGNvbG9yOlwidmFyKC0taW5rLW11dGVkKVwiLHdoaXRlU3BhY2U6XCJub3dyYXBcIn19Puavj+asoTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIG1pbj17MC41fSBzdGVwPXswLjV9IHZhbHVlPXtzY2hlZC5kb3NlfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e2UgPT4gdXBkYXRlU2NoZWQocC5pZCwgeyBkb3NlOiBOdW1iZXIoZS50YXJnZXQudmFsdWUpIH0pfVxuICAgICAgICAgICAgICAgICAgc3R5bGU9e3t3aWR0aDo3Mn19IC8+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3tmb250U2l6ZTpcIjAuNzhyZW1cIixjb2xvcjpcInZhcigtLWluay1tdXRlZClcIn19Pumhhjwvc3Bhbj5cbiAgICAgICAgICAgICAgICB7cC5pZCA9PT0gXCJjdXN0b21cIiAmJiAoXG4gICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRpbWVcIiB2YWx1ZT17c2NoZWQuY3VzdG9tVGltZSB8fCBwLmRlZmF1bHRUaW1lfVxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17ZSA9PiB1cGRhdGVTY2hlZChwLmlkLCB7IGN1c3RvbVRpbWU6IGUudGFyZ2V0LnZhbHVlIH0pfSAvPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKTtcbiAgICAgIH0pfVxuICAgIDwvZGl2PlxuICApO1xufVxuXG4vLyDilIDilIDilIAgQWRkIE1lZCBNb2RhbCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIEFkZE1lZE1vZGFsKHsgb25DbG9zZSwgb25TYXZlIH0pIHtcbiAgY29uc3QgW25hbWUsICAgICAgc2V0TmFtZV0gICAgICA9IHVzZVN0YXRlKFwiXCIpO1xuICBjb25zdCBbdG90YWwsICAgICBzZXRUb3RhbF0gICAgID0gdXNlU3RhdGUoMzApO1xuICBjb25zdCBbc2NoZWR1bGVzLCBzZXRTY2hlZHVsZXNdID0gdXNlU3RhdGUoW10pO1xuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJtb2RhbC1vdmVybGF5XCIgb25DbGljaz17ZT0+ZS50YXJnZXQ9PT1lLmN1cnJlbnRUYXJnZXQmJm9uQ2xvc2UoKX0+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1vZGFsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWwtdG9wXCI+PGRpdiBjbGFzc05hbWU9XCJtb2RhbC1oYW5kbGVcIi8+PGgzPuaWsOWinuiXpeeJqTwvaDM+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWwtc2Nyb2xsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICA8bGFiZWw+6Jel54mp5ZCN56ixPC9sYWJlbD5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiB2YWx1ZT17bmFtZX0gb25DaGFuZ2U9e2U9PnNldE5hbWUoZS50YXJnZXQudmFsdWUpfSBwbGFjZWhvbGRlcj1cIuS+i++8mkVzY2l0YWxvcHJhbSAxMG1nXCIgYXV0b0ZvY3VzLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICA8bGFiZWw+5Yid5aeL57i96aGG5pW4PC9sYWJlbD5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIG1pbj17MX0gdmFsdWU9e3RvdGFsfSBvbkNoYW5nZT17ZT0+c2V0VG90YWwoZS50YXJnZXQudmFsdWUpfS8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkXCI+XG4gICAgICAgICAgPGxhYmVsIHN0eWxlPXt7bWFyZ2luQm90dG9tOjEwfX0+5pyN55So5pmC5q6177yI5Y+v6KSH6YG477yJPC9sYWJlbD5cbiAgICAgICAgICA8UGVyaW9kU2VsZWN0b3Igc2VsZWN0ZWQ9e3NjaGVkdWxlc30gb25DaGFuZ2U9e3NldFNjaGVkdWxlc30vPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXByaW1hcnlcIiBzdHlsZT17e21hcmdpblRvcDo4fX1cbiAgICAgICAgICBvbkNsaWNrPXsoKT0+eyBpZighbmFtZS50cmltKCl8fHNjaGVkdWxlcy5sZW5ndGg9PT0wKSByZXR1cm47IG9uU2F2ZSh7bmFtZTpuYW1lLnRyaW0oKSxzY2hlZHVsZXMsdG90YWxDb3VudDpOdW1iZXIodG90YWwpfSk7IH19PlxuICAgICAgICAgIOWEsuWtmOiXpeeJqVxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLWdob3N0XCIgb25DbGljaz17b25DbG9zZX0+5Y+W5raIPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8vIOKUgOKUgOKUgCBBZGQgVmlzaXQgTW9kYWwg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5mdW5jdGlvbiBBZGRWaXNpdE1vZGFsKHsgbWVkaWNhdGlvbnMsIGFsbE1lZHMsIG9uQ2xvc2UsIG9uU2F2ZSB9KSB7XG4gIGNvbnN0IHRvZGF5U3RyID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsMTApO1xuICBjb25zdCBbZGF0ZSwgICAgIHNldERhdGVdICAgICA9IHVzZVN0YXRlKHRvZGF5U3RyKTtcbiAgY29uc3QgW2hvc3BpdGFsLCBzZXRIb3NwaXRhbF0gPSB1c2VTdGF0ZShcIlwiKTtcbiAgY29uc3QgW2RvY3RvciwgICBzZXREb2N0b3JdICAgPSB1c2VTdGF0ZShcIlwiKTtcbiAgY29uc3QgW25vdGUsICAgICBzZXROb3RlXSAgICAgPSB1c2VTdGF0ZShcIlwiKTtcbiAgLy8gY29udGludWVkSWRzOiBzZXQgb2YgbWVkIGlkcyB0aGUgdXNlciBjaGVja3MgYXMgXCJzdGlsbCB0YWtpbmdcIlxuICBjb25zdCBbY29udGludWVkSWRzLCBzZXRDb250aW51ZWRJZHNdID0gdXNlU3RhdGUobmV3IFNldChtZWRpY2F0aW9ucy5tYXAobT0+bS5pZCkpKTtcbiAgY29uc3QgW25ld01lZHMsIHNldE5ld01lZHNdID0gdXNlU3RhdGUoW10pO1xuXG4gIGZ1bmN0aW9uIHRvZ2dsZUNvbnRpbnVlKGlkKSB7XG4gICAgc2V0Q29udGludWVkSWRzKHByZXYgPT4ge1xuICAgICAgY29uc3QgcyA9IG5ldyBTZXQocHJldik7XG4gICAgICBzLmhhcyhpZCkgPyBzLmRlbGV0ZShpZCkgOiBzLmFkZChpZCk7XG4gICAgICByZXR1cm4gcztcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZE5ld01lZCgpIHtcbiAgICBzZXROZXdNZWRzKHByZXYgPT4gWy4uLnByZXYsIHsgX2tleTogdWlkKCksIG5hbWU6XCJcIiwgc2NoZWR1bGVzOltdLCB0b3RhbENvdW50OjMwIH1dKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU5ld01lZChrZXksIHBhdGNoKSB7XG4gICAgc2V0TmV3TWVkcyhwcmV2ID0+IHByZXYubWFwKG0gPT4gbS5fa2V5PT09a2V5ID8gey4uLm0sLi4ucGF0Y2h9IDogbSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlTmV3TWVkKGtleSkge1xuICAgIHNldE5ld01lZHMocHJldiA9PiBwcmV2LmZpbHRlcihtID0+IG0uX2tleSE9PWtleSkpO1xuICB9XG5cbiAgLy8gQ29tcHV0ZSB3aGljaCB3aWxsIGJlIHN0b3BwZWQgPSBhY3RpdmUgbWVkcyBOT1QgaW4gY29udGludWVkSWRzXG4gIGNvbnN0IHN0b3BwZWRJZHMgPSBtZWRpY2F0aW9ucy5maWx0ZXIobSA9PiAhY29udGludWVkSWRzLmhhcyhtLmlkKSkubWFwKG09Pm0uaWQpO1xuXG4gIGZ1bmN0aW9uIHNhdmUoKSB7XG4gICAgb25TYXZlKHtcbiAgICAgIGRhdGUsIGhvc3BpdGFsLCBkb2N0b3IsIG5vdGUsXG4gICAgICBjb250aW51ZWRJZHM6IFsuLi5jb250aW51ZWRJZHNdLFxuICAgICAgc3RvcHBlZElkcyxcbiAgICAgIG5ld01lZHM6IG5ld01lZHMuZmlsdGVyKG09Pm0ubmFtZS50cmltKCkpLm1hcCgoe19rZXksLi4ubX0pPT5tKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJtb2RhbC1vdmVybGF5XCIgb25DbGljaz17ZT0+ZS50YXJnZXQ9PT1lLmN1cnJlbnRUYXJnZXQmJm9uQ2xvc2UoKX0+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1vZGFsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWwtdG9wXCI+PGRpdiBjbGFzc05hbWU9XCJtb2RhbC1oYW5kbGVcIi8+PGgzPuaWsOWinueci+iouue0gOmMhDwvaDM+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWwtc2Nyb2xsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICA8bGFiZWw+55yL6Ki65pel5pyfPC9sYWJlbD5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImRhdGVcIiB2YWx1ZT17ZGF0ZX0gb25DaGFuZ2U9e2U9PnNldERhdGUoZS50YXJnZXQudmFsdWUpfS8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkXCI+XG4gICAgICAgICAgPGxhYmVsPumGq+mZou+8iOmBuOWhq++8iTwvbGFiZWw+XG4gICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgdmFsdWU9e2hvc3BpdGFsfSBvbkNoYW5nZT17ZT0+c2V0SG9zcGl0YWwoZS50YXJnZXQudmFsdWUpfSBwbGFjZWhvbGRlcj1cIumGq+mZouWQjeeosVwiLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICA8bGFiZWw+6Yar5bir77yI6YG45aGr77yJPC9sYWJlbD5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiB2YWx1ZT17ZG9jdG9yfSBvbkNoYW5nZT17ZT0+c2V0RG9jdG9yKGUudGFyZ2V0LnZhbHVlKX0gcGxhY2Vob2xkZXI9XCLphqvluKvlp5PlkI1cIi8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkXCI+XG4gICAgICAgICAgPGxhYmVsPuWCmeiou++8iOmBuOWhq++8iTwvbGFiZWw+XG4gICAgICAgICAgPHRleHRhcmVhIHJvd3M9ezJ9IHZhbHVlPXtub3RlfSBvbkNoYW5nZT17ZT0+c2V0Tm90ZShlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPVwi6YCZ5qyh6Yar5bir6Kqq5LqG5LuA6bq84oCmXCIgc3R5bGU9e3tyZXNpemU6XCJub25lXCJ9fS8+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxociBjbGFzc05hbWU9XCJkaXZpZGVyXCIvPlxuXG4gICAgICAgIHttZWRpY2F0aW9ucy5sZW5ndGggPiAwID8gKFxuICAgICAgICAgIDw+XG4gICAgICAgICAgICA8bGFiZWwgc3R5bGU9e3ttYXJnaW5Cb3R0b206MTAsZGlzcGxheTpcImJsb2NrXCJ9fT7pgJnmrKHlm57oqLrnubznuozmnI3nlKjlk6rkupvol6XvvJ88L2xhYmVsPlxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwic2VjdGlvbi10aXBcIj7li77pgbjnmoQgPSDnubznuozmnI3nlKjjgILmspLli77pgbjnmoTol6XvvIzlhLLlrZjlvozoh6rli5XlgZzol6XjgII8L3A+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7YmFja2dyb3VuZDpcIndoaXRlXCIsYm9yZGVyUmFkaXVzOjEyLGJvcmRlcjpcIjEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIixwYWRkaW5nOlwiMCAxNnB4XCIsbWFyZ2luQm90dG9tOjE2fX0+XG4gICAgICAgICAgICAgIHttZWRpY2F0aW9ucy5tYXAobWVkID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGVja2VkID0gY29udGludWVkSWRzLmhhcyhtZWQuaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhaWx5RG9zZSA9IChtZWQuc2NoZWR1bGVzfHxbXSkucmVkdWNlKChzLHNjKT0+cytzYy5kb3NlLDApO1xuICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICA8ZGl2IGtleT17bWVkLmlkfSBjbGFzc05hbWU9XCJtZWQtY2hlY2tib3gtcm93XCIgb25DbGljaz17KCk9PnRvZ2dsZUNvbnRpbnVlKG1lZC5pZCl9PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLWNoZWNrYm94LWxhYmVsXCI+e21lZC5uYW1lfTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWVkLWNoZWNrYm94LXN1YlwiPuavj+aXpSB7ZGFpbHlEb3NlfSDpoYYgwrcg5YmpIHttZWQucmVtYWluaW5nQ291bnR9IOmhhjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e2BjYi1ib3ggJHtjaGVja2VkP1wiY2hlY2tlZFwiOlwiXCJ9YH0+XG4gICAgICAgICAgICAgICAgICAgICAge2NoZWNrZWQgJiYgPHNwYW4gY2xhc3NOYW1lPVwiY2ItY2hlY2tcIj7inJM8L3NwYW4+fVxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICB7c3RvcHBlZElkcy5sZW5ndGggPiAwICYmIChcbiAgICAgICAgICAgICAgPHAgc3R5bGU9e3tmb250U2l6ZTpcIjAuNzVyZW1cIixjb2xvcjpcInZhcigtLXJvc2UpXCIsbWFyZ2luQm90dG9tOjE2fX0+XG4gICAgICAgICAgICAgICAg4pqgIOS7peS4i+iXpeeJqeWwh+iHquWLleWBnOiXpe+8mntzdG9wcGVkSWRzLm1hcChpZD0+bWVkaWNhdGlvbnMuZmluZChtPT5tLmlkPT09aWQpPy5uYW1lKS5qb2luKFwi44CBXCIpfVxuICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvPlxuICAgICAgICApIDogKFxuICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInNlY3Rpb24tdGlwXCI+55uu5YmN5rKS5pyJ5pyN55So5Lit6Jel54mp44CCPC9wPlxuICAgICAgICApfVxuXG4gICAgICAgIDxociBjbGFzc05hbWU9XCJkaXZpZGVyXCIvPlxuICAgICAgICA8bGFiZWwgc3R5bGU9e3ttYXJnaW5Cb3R0b206MTAsZGlzcGxheTpcImJsb2NrXCJ9fT7pgJnmrKHplovkuobmlrDol6XvvJ88L2xhYmVsPlxuXG4gICAgICAgIHtuZXdNZWRzLm1hcChubSA9PiAoXG4gICAgICAgICAgPGRpdiBrZXk9e25tLl9rZXl9IHN0eWxlPXt7YmFja2dyb3VuZDpcIndoaXRlXCIsYm9yZGVyOlwiMS41cHggc29saWQgdmFyKC0tYm9yZGVyKVwiLGJvcmRlclJhZGl1czoxMixwYWRkaW5nOlwiMTRweCAxNnB4XCIsbWFyZ2luQm90dG9tOjEwfX0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7ZGlzcGxheTpcImZsZXhcIixhbGlnbkl0ZW1zOlwiY2VudGVyXCIsanVzdGlmeUNvbnRlbnQ6XCJzcGFjZS1iZXR3ZWVuXCIsbWFyZ2luQm90dG9tOjEwfX0+XG4gICAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7Zm9udFdlaWdodDo2MDAsZm9udFNpemU6XCIwLjg1cmVtXCIsY29sb3I6XCJ2YXIoLS1pbmstbGlnaHQpXCJ9fT7mlrDol6U8L3NwYW4+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuLWljb25cIiBvbkNsaWNrPXsoKT0+cmVtb3ZlTmV3TWVkKG5tLl9rZXkpfT57SWNvLnh9PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICAgICAgPGxhYmVsPuiXpeeJqeWQjeeosTwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIHZhbHVlPXtubS5uYW1lfSBvbkNoYW5nZT17ZT0+dXBkYXRlTmV3TWVkKG5tLl9rZXkse25hbWU6ZS50YXJnZXQudmFsdWV9KX0gcGxhY2Vob2xkZXI9XCLol6XlkI1cIi8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICAgICAgPGxhYmVsPue4vemhhuaVuDwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgbWluPXsxfSB2YWx1ZT17bm0udG90YWxDb3VudH0gb25DaGFuZ2U9e2U9PnVwZGF0ZU5ld01lZChubS5fa2V5LHt0b3RhbENvdW50Ok51bWJlcihlLnRhcmdldC52YWx1ZSl9KX0vPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT17e21hcmdpbkJvdHRvbTo4fX0+5pyN55So5pmC5q61PC9sYWJlbD5cbiAgICAgICAgICAgICAgPFBlcmlvZFNlbGVjdG9yIHNlbGVjdGVkPXtubS5zY2hlZHVsZXN8fFtdfSBvbkNoYW5nZT17c2NoZWRzPT51cGRhdGVOZXdNZWQobm0uX2tleSx7c2NoZWR1bGVzOnNjaGVkc30pfS8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKSl9XG5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXNlY29uZGFyeVwiIHN0eWxlPXt7bWFyZ2luVG9wOjB9fSBvbkNsaWNrPXthZGROZXdNZWR9Pu+8iyDmlrDlop7kuIDnrYbmlrDol6U8L2J1dHRvbj5cblxuICAgICAgICA8aHIgY2xhc3NOYW1lPVwiZGl2aWRlclwiLz5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXByaW1hcnlcIiBvbkNsaWNrPXtzYXZlfT7lhLLlrZjnnIvoqLrntIDpjIQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLWdob3N0XCIgb25DbGljaz17b25DbG9zZX0+5Y+W5raIPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8vIOKUgOKUgOKUgCBTZXR0aW5ncyBNb2RhbCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIFNldHRpbmdzTW9kYWwoeyBzdGF0ZSwgdXBkYXRlLCBvbkNsb3NlLCBzaG93VG9hc3QsIG5vdGlmT2ssIGFza05vdGlmIH0pIHtcbiAgY29uc3QgaHIgPSAoc3RhdGUuc2V0dGluZ3MgJiYgc3RhdGUuc2V0dGluZ3MuZGF5UmVzZXRIb3VyKSB8fCAgNDtcbiAgY29uc3QgcmVtaW5kZXJUaW1lcyA9IChzdGF0ZS5zZXR0aW5ncyAmJiBzdGF0ZS5zZXR0aW5ncy5yZW1pbmRlclRpbWVzKSB8fCBbXTtcblxuICBmdW5jdGlvbiBhZGRSZW1pbmRlclRpbWUoKSB7XG4gICAgY29uc3QgdCA9IFwiMDg6MDBcIjtcbiAgICB1cGRhdGUocyA9PiB7IHMuc2V0dGluZ3MucmVtaW5kZXJUaW1lcyA9IFsuLi4ocy5zZXR0aW5ncy5yZW1pbmRlclRpbWVzfHxbXSksIHRdOyB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVJlbWluZGVyVGltZShpZHgsIHZhbCkge1xuICAgIHVwZGF0ZShzID0+IHtcbiAgICAgIGNvbnN0IGFyciA9IFsuLi4ocy5zZXR0aW5ncy5yZW1pbmRlclRpbWVzfHxbXSldO1xuICAgICAgYXJyW2lkeF0gPSB2YWw7XG4gICAgICBzLnNldHRpbmdzLnJlbWluZGVyVGltZXMgPSBhcnI7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVSZW1pbmRlclRpbWUoaWR4KSB7XG4gICAgdXBkYXRlKHMgPT4ge1xuICAgICAgcy5zZXR0aW5ncy5yZW1pbmRlclRpbWVzID0gKHMuc2V0dGluZ3MucmVtaW5kZXJUaW1lc3x8W10pLmZpbHRlcigoXyxpKSA9PiBpICE9PSBpZHgpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cIm1vZGFsLW92ZXJsYXlcIiBvbkNsaWNrPXtlPT5lLnRhcmdldD09PWUuY3VycmVudFRhcmdldCYmb25DbG9zZSgpfT5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWxcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtb2RhbC10b3BcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1vZGFsLWhhbmRsZVwiLz5cbiAgICAgICAgICA8aDM+6Kit5a6aPC9oMz5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWwtc2Nyb2xsXCI+XG5cbiAgICAgICAgICB7Lyog4pSA4pSAIOmAmuefpeaPkOmGkiDilIDilIAgKi99XG4gICAgICAgICAgPGRpdiBzdHlsZT17e21hcmdpbkJvdHRvbToyMH19PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT17e2ZvbnRTaXplOlwiMC43NXJlbVwiLGZvbnRXZWlnaHQ6NjAwLGNvbG9yOlwidmFyKC0taW5rLW11dGVkKVwiLGxldHRlclNwYWNpbmc6XCIwLjEyZW1cIix0ZXh0VHJhbnNmb3JtOlwidXBwZXJjYXNlXCIsZm9udEZhbWlseTpcIidETSBNb25vJyxtb25vc3BhY2VcIixtYXJnaW5Cb3R0b206MTB9fT7mnI3ol6Xmj5DphpLpgJrnn6U8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3tiYWNrZ3JvdW5kOlwid2hpdGVcIixib3JkZXJSYWRpdXM6MTIsYm9yZGVyOlwiMS41cHggc29saWQgdmFyKC0tYm9yZGVyKVwiLHBhZGRpbmc6XCIwIDE2cHhcIixtYXJnaW5Cb3R0b206MTB9fT5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1yb3dcIj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1sYWJlbFwiPuaOqOaSremAmuefpTwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1zdWJcIj5cbiAgICAgICAgICAgICAgICAgICAge3R5cGVvZiBOb3RpZmljYXRpb24gPT09IFwidW5kZWZpbmVkXCIgPyBcIuatpOijnee9ruS4jeaUr+aPtOmAmuefpVwiXG4gICAgICAgICAgICAgICAgICAgICAgOiBOb3RpZmljYXRpb24ucGVybWlzc2lvbiA9PT0gXCJkZW5pZWRcIiA/IFwi4pqgIOW3suiiq+WwgemOlu+8jOiri+iHs+eAj+imveWZqOioreWumuaJi+WLlemWi+WVn1wiXG4gICAgICAgICAgICAgICAgICAgICAgOiBub3RpZk9rID8gXCLlt7LplovllZ9cIiA6IFwi5bCa5pyq6ZaL5ZWfXCJ9XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICB7bm90aWZPa1xuICAgICAgICAgICAgICAgICAgPyA8c3BhbiBzdHlsZT17e2ZvbnRTaXplOlwiMS4zcmVtXCJ9fT7inIU8L3NwYW4+XG4gICAgICAgICAgICAgICAgICA6ICh0eXBlb2YgTm90aWZpY2F0aW9uICE9PSBcInVuZGVmaW5lZFwiICYmIE5vdGlmaWNhdGlvbi5wZXJtaXNzaW9uICE9PSBcImRlbmllZFwiKSAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXNtXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7YmFja2dyb3VuZDpcInZhcigtLXNhZ2UpXCIsY29sb3I6XCJ3aGl0ZVwiLGJvcmRlcjpcIm5vbmVcIixmbGV4U2hyaW5rOjB9fVxuICAgICAgICAgICAgICAgICAgICAgICAgb25DbGljaz17YXNrTm90aWZ9PumWi+WVnzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICB7LyogUmVtaW5kZXIgdGltZXMgbGlzdCAqL31cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3tmb250U2l6ZTpcIjAuNzhyZW1cIixjb2xvcjpcInZhcigtLWluay1saWdodClcIixtYXJnaW5Cb3R0b206OCxmb250V2VpZ2h0OjUwMH19Puavj+aXpeaPkOmGkuaZgumWkzwvZGl2PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT17e2ZvbnRTaXplOlwiMC43MnJlbVwiLGNvbG9yOlwidmFyKC0taW5rLW11dGVkKVwiLG1hcmdpbkJvdHRvbToxMCxsaW5lSGVpZ2h0OjEuNX19PlxuICAgICAgICAgICAgICDliLDmmYLplpPoh6rli5Xmjqjmkq3jgIzpmarkuIDliLvvvZzoqbLlkIPol6XkuobjgI3vvIzlj6/oqK3lrprlpJrntYTjgIJcbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAge3JlbWluZGVyVGltZXMubWFwKCh0LCBpZHgpID0+IChcbiAgICAgICAgICAgICAgPGRpdiBrZXk9e2lkeH0gc3R5bGU9e3tkaXNwbGF5OlwiZmxleFwiLGFsaWduSXRlbXM6XCJjZW50ZXJcIixnYXA6OCxtYXJnaW5Cb3R0b206OH19PlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGltZVwiIHZhbHVlPXt0fSBzdHlsZT17e2ZsZXg6MSxtYXJnaW5Ub3A6MH19XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17ZT0+dXBkYXRlUmVtaW5kZXJUaW1lKGlkeCwgZS50YXJnZXQudmFsdWUpfS8+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4taWNvblwiIG9uQ2xpY2s9eygpPT5yZW1vdmVSZW1pbmRlclRpbWUoaWR4KX1cbiAgICAgICAgICAgICAgICAgIHN0eWxlPXt7ZmxleFNocmluazowfX0+XG4gICAgICAgICAgICAgICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMi4yXCIgc3R5bGU9e3t3aWR0aDoxOCxoZWlnaHQ6MTh9fT48cGF0aCBkPVwiTTE4IDZMNiAxOE02IDZsMTIgMTJcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBidG4tc2Vjb25kYXJ5XCIgc3R5bGU9e3ttYXJnaW5Ub3A6NH19XG4gICAgICAgICAgICAgIG9uQ2xpY2s9e2FkZFJlbWluZGVyVGltZX0+77yLIOaWsOWinuaPkOmGkuaZgumWkzwvYnV0dG9uPlxuXG4gICAgICAgICAgICB7cmVtaW5kZXJUaW1lcy5sZW5ndGggPiAwICYmICFub3RpZk9rICYmIChcbiAgICAgICAgICAgICAgPHAgc3R5bGU9e3tmb250U2l6ZTpcIjAuNzJyZW1cIixjb2xvcjpcInZhcigtLXJvc2UpXCIsbWFyZ2luVG9wOjEwLGxpbmVIZWlnaHQ6MS41fX0+XG4gICAgICAgICAgICAgICAg4pqgIOiri+WFiOmWi+WVn+aOqOaSremAmuefpe+8jOaPkOmGkuaJjeiDveato+W4uOmBi+S9nOOAglxuICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgey8qIOKUgOKUgCDml6XliIfpu54g4pSA4pSAICovfVxuICAgICAgICAgIDxkaXYgc3R5bGU9e3ttYXJnaW5Cb3R0b206MjB9fT5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3tmb250U2l6ZTpcIjAuNzVyZW1cIixmb250V2VpZ2h0OjYwMCxjb2xvcjpcInZhcigtLWluay1tdXRlZClcIixsZXR0ZXJTcGFjaW5nOlwiMC4xMmVtXCIsdGV4dFRyYW5zZm9ybTpcInVwcGVyY2FzZVwiLGZvbnRGYW1pbHk6XCInRE0gTW9ubycsbW9ub3NwYWNlXCIsbWFyZ2luQm90dG9tOjEwfX0+5pel5pyf6Kit5a6aPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXt7YmFja2dyb3VuZDpcIndoaXRlXCIsYm9yZGVyUmFkaXVzOjEyLGJvcmRlcjpcIjEuNXB4IHNvbGlkIHZhcigtLWJvcmRlcilcIixwYWRkaW5nOlwiMCAxNnB4XCJ9fT5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1yb3dcIj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1sYWJlbFwiPuaPm+aXpeaZgumWkzwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZXR0aW5ncy1zdWJcIj7lub7pu57ku6XliY3ku43nrpfliY3kuIDlpKnvvIjpoJDoqK0gNDowMO+8iTwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgbWluPXswfSBtYXg9ezExfSB2YWx1ZT17aHJ9XG4gICAgICAgICAgICAgICAgICBzdHlsZT17e3dpZHRoOjY0LG1hcmdpblRvcDowLHRleHRBbGlnbjpcImNlbnRlclwiLGZsZXhTaHJpbms6MH19XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17ZT0+dXBkYXRlKHM9PntzLnNldHRpbmdzLmRheVJlc2V0SG91cj1OdW1iZXIoZS50YXJnZXQudmFsdWUpO30pfS8+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBidG4tc2Vjb25kYXJ5XCIgc3R5bGU9e3ttYXJnaW5Ub3A6MH19IG9uQ2xpY2s9e29uQ2xvc2V9PumXnOmWiTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICApO1xufVxuXG5cbi8vIOKUgOKUgOKUgCBQcm9maWxlIE1vZGFsIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuZnVuY3Rpb24gUHJvZmlsZU1vZGFsKHsgc3RhdGUsIHVwZGF0ZSwgb25DbG9zZSwgc2hvd1RvYXN0IH0pIHtcbiAgY29uc3QgdSA9IHN0YXRlLmN1cnJlbnRVc2VyO1xuXG4gIGZ1bmN0aW9uIGxvZ291dCgpIHsgdXBkYXRlKHM9PntzLmN1cnJlbnRVc2VyPW51bGw7fSk7IG9uQ2xvc2UoKTsgfVxuICBmdW5jdGlvbiByZXNldEFsbCgpIHtcbiAgICBpZighd2luZG93LmNvbmZpcm0oXCLimqDvuI8g56K65a6a5riF6Zmk5omA5pyJ6LOH5paZ77yf5q2k5pON5L2c54Sh5rOV6YKE5Y6f44CCXCIpKSByZXR1cm47XG4gICAgW1NUT1JBR0VfS0VZLCBTVE9SQUdFX0tFWStcIl91c2VyXCIsIFwicGVpWWlrZV92MlwiLCBcInBlaVlpa2VfdjFcIl0uZm9yRWFjaChrPT5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrKSk7XG4gICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cIm1vZGFsLW92ZXJsYXlcIiBvbkNsaWNrPXtlPT5lLnRhcmdldD09PWUuY3VycmVudFRhcmdldCYmb25DbG9zZSgpfT5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwibW9kYWxcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtb2RhbC10b3BcIj48ZGl2IGNsYXNzTmFtZT1cIm1vZGFsLWhhbmRsZVwiLz48aDM+5biz6JmfPC9oMz48L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtb2RhbC1zY3JvbGxcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwYWlyLWluZm9cIj5cbiAgICAgICAgICA8c3Bhbj7wn5GkPC9zcGFuPlxuICAgICAgICAgIDxzcGFuPnt1Lm5hbWV9IMK3IHt1LnJvbGU9PT1cInVzZXJcIj9cIueUqOiXpeiAhVwiOlwi6Zmq5Ly06ICF77yI5qqi6KaW77yJXCJ9PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAge3Uucm9sZT09PVwidXNlclwiICYmIChcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInBhaXItY29kZS1kaXNwbGF5XCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImNvZGVcIj57dS5wYWlyQ29kZX08L2Rpdj5cbiAgICAgICAgICAgIDxzbWFsbD7miorpgJnntYTpgoDoq4vnorzliIbkuqvntabkvaDnmoTpmarkvLTogIU8L3NtYWxsPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApfVxuICAgICAgICA8aHIgY2xhc3NOYW1lPVwiZGl2aWRlclwiLz5cbiAgICAgICAgPHAgc3R5bGU9e3tmb250U2l6ZTpcIjAuNzhyZW1cIixjb2xvcjpcInZhcigtLWluay1tdXRlZClcIixtYXJnaW5Cb3R0b206MTYsbGluZUhlaWdodDoxLjd9fT5cbiAgICAgICAgICB7c3RhdGUubWVkaWNhdGlvbnMubGVuZ3RofSDnqK7ol6Xniakgwrcge09iamVjdC5rZXlzKHN0YXRlLnNjaGVkdWxlTG9nfHx7fSkubGVuZ3RofSDnrYbmnI3ol6XntIDpjIQgwrcge3N0YXRlLmRvY3RvclZpc2l0cy5sZW5ndGh9IOethueci+iouue0gOmMhFxuICAgICAgICA8L3A+XG4gICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBzdHlsZT17e21hcmdpbkJvdHRvbTo4LG1hcmdpblRvcDowfX0gb25DbGljaz17bG9nb3V0fT7nmbvlh7rluLPomZ/vvIjkv53nlZnmiYDmnInos4fmlpnvvIk8L2J1dHRvbj5cbiAgICAgICAgPGRpdiBzdHlsZT17e2JhY2tncm91bmQ6XCJ2YXIoLS1hbWJlci1wYWxlKVwiLGJvcmRlcjpcIjEuNXB4IHNvbGlkICNERkMwNzBcIixib3JkZXJSYWRpdXM6MTAscGFkZGluZzpcIjEwcHggMTRweFwiLG1hcmdpbkJvdHRvbToxNCxmb250U2l6ZTpcIjAuNzVyZW1cIixjb2xvcjpcInZhcigtLWFtYmVyKVwiLGxpbmVIZWlnaHQ6MS42fX0+XG4gICAgICAgICAg4pqgIOeZu+WHuiDiiaAg5riF6Zmk6LOH5paZ44CC55m75Ye65Y+q5piv5o+b5Lq655m75YWl77yM5omA5pyJ57SA6YyE5LuN54S25L+d55WZ44CCXG4gICAgICAgIDwvZGl2PlxuICAgICAgICB7dS5yb2xlPT09XCJ1c2VyXCIgJiYgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLWRhbmdlciBidG4tc21cIiBvbkNsaWNrPXtyZXNldEFsbH0+5riF6Zmk5omA5pyJ6LOH5paZ77yI54Sh5rOV6YKE5Y6f77yJPC9idXR0b24+fVxuICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBidG4tZ2hvc3RcIiBzdHlsZT17e21hcmdpblRvcDoxMCx3aWR0aDpcIjEwMCVcIn19IG9uQ2xpY2s9e29uQ2xvc2V9PuWPlua2iDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICApO1xufVxuXG4vLyDilIDilIDilIAgT25ib2FyZGluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmZ1bmN0aW9uIE9uYm9hcmRTY3JlZW4oeyB1cGRhdGUgfSkge1xuICBjb25zdCBbc3RlcCwgc2V0U3RlcF0gPSB1c2VTdGF0ZShcImNob29zZVwiKTtcbiAgY29uc3QgW25hbWUsIHNldE5hbWVdID0gdXNlU3RhdGUoXCJcIik7XG4gIGNvbnN0IFtwYWlyQ29kZV0gPSB1c2VTdGF0ZSgoKT0+U3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMCkpLnBhZFN0YXJ0KDQsXCIwXCIpKTtcbiAgY29uc3QgW2pvaW5Db2RlLCBzZXRKb2luQ29kZV0gPSB1c2VTdGF0ZShcIlwiKTtcbiAgY29uc3QgW2pvaW5FcnJvciwgc2V0Sm9pbkVycm9yXSA9IHVzZVN0YXRlKFwiXCIpO1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVVzZXIoKSB7XG4gICAgaWYoIW5hbWUudHJpbSgpKSByZXR1cm47XG4gICAgdXBkYXRlKHM9Pnsgcy5jdXJyZW50VXNlcj17aWQ6dWlkKCksbmFtZTpuYW1lLnRyaW0oKSxyb2xlOlwidXNlclwiLHBhaXJDb2RlfTsgcy5vd25lclBhaXJDb2RlPXBhaXJDb2RlOyB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGpvaW5Bc1ZpZXdlcigpIHtcbiAgICBpZighbmFtZS50cmltKCkpIHJldHVybjtcbiAgICBpZihqb2luQ29kZS5sZW5ndGghPT00KXsgc2V0Sm9pbkVycm9yKFwi6KuL6Ly45YWl5a6M5pW05Zub5L2N5pW46YKA6KuL56K8XCIpOyByZXR1cm47IH1cbiAgICBjb25zdCBleGlzdGluZyA9IGxvYWRTdGF0ZSgpO1xuICAgIGlmKChleGlzdGluZyAmJiBleGlzdGluZy5vd25lclBhaXJDb2RlKSAmJiBqb2luQ29kZSE9PWV4aXN0aW5nLm93bmVyUGFpckNvZGUpeyBzZXRKb2luRXJyb3IoXCLpgoDoq4vnorzkuI3mraPnorrvvIzoq4vlho3norroqo1cIik7IHJldHVybjsgfVxuICAgIHVwZGF0ZShzPT57IHMuY3VycmVudFVzZXI9e2lkOnVpZCgpLG5hbWU6bmFtZS50cmltKCkscm9sZTpcInZpZXdlclwiLHBhaXJDb2RlOmpvaW5Db2RlfTsgfSk7XG4gIH1cblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwiYXBwXCI+XG4gICAgICA8c3R5bGU+e0NTU308L3N0eWxlPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJvbmJvYXJkXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwib25ib2FyZC1sb2dvXCI+XG4gICAgICAgICAgPGgxPumZquS4gOWIuzwvaDE+XG4gICAgICAgICAgPHA+U0hBUkVEIE1FRElDQVRJT04gTE9HPC9wPlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICB7c3RlcD09PVwiY2hvb3NlXCIgJiYgKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwib25ib2FyZC1jYXJkXCI+XG4gICAgICAgICAgICA8aDI+5q2h6L+OIOKAlCDoq4vpgbjmk4fkvaDnmoTouqvku708L2gyPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXByaW1hcnlcIiBvbkNsaWNrPXsoKT0+c2V0U3RlcChcImNyZWF0ZVVzZXJcIil9PuaIkeaYr+eUqOiXpeiAhe+8iOacrOS6uu+8iTwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uQ2xpY2s9eygpPT5zZXRTdGVwKFwiam9pblZpZXdlclwiKX0+5oiR5piv6Zmq5Ly06ICF77yI6ZyA6KaB6YKA6KuL56K877yJPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICl9XG5cbiAgICAgICAge3N0ZXA9PT1cImNyZWF0ZVVzZXJcIiAmJiAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJvbmJvYXJkLWNhcmRcIj5cbiAgICAgICAgICAgIDxoMj7lu7rnq4vnlKjol6XntIDpjIQ8L2gyPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmaWVsZFwiPlxuICAgICAgICAgICAgICA8bGFiZWw+5L2g55qE5ZCN5a2XPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgdmFsdWU9e25hbWV9IG9uQ2hhbmdlPXtlPT5zZXROYW1lKGUudGFyZ2V0LnZhbHVlKX0gcGxhY2Vob2xkZXI9XCLoq4vovLjlhaXlkI3lrZdcIiBhdXRvRm9jdXMvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInBhaXItY29kZS1kaXNwbGF5XCI+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiY29kZVwiPntwYWlyQ29kZX08L2Rpdj5cbiAgICAgICAgICAgICAgPHNtYWxsPuaKiumAmee1hOmCgOiri+eivOWIhuS6q+e1puS9oOeahOmZquS8tOiAhTwvc21hbGw+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1wcmltYXJ5XCIgc3R5bGU9e3ttYXJnaW5Ub3A6OH19IG9uQ2xpY2s9e2NyZWF0ZVVzZXJ9PumWi+Wni+iomOmMhDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLWdob3N0XCIgb25DbGljaz17KCk9PnNldFN0ZXAoXCJjaG9vc2VcIil9PuKGkCDov5Tlm548L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cblxuICAgICAgICB7c3RlcD09PVwiam9pblZpZXdlclwiICYmIChcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm9uYm9hcmQtY2FyZFwiPlxuICAgICAgICAgICAgPGgyPuWKoOWFpemZquS8tDwvaDI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkXCI+XG4gICAgICAgICAgICAgIDxsYWJlbD7kvaDnmoTlkI3lrZc8L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiB2YWx1ZT17bmFtZX0gb25DaGFuZ2U9e2U9PnNldE5hbWUoZS50YXJnZXQudmFsdWUpfSBwbGFjZWhvbGRlcj1cIuiri+i8uOWFpeWQjeWtl1wiIGF1dG9Gb2N1cy8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmllbGRcIj5cbiAgICAgICAgICAgICAgPGxhYmVsPueUqOiXpeiAheeahOWbm+S9jeaVuOmCgOiri+eivDwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIG1heExlbmd0aD17NH0gdmFsdWU9e2pvaW5Db2RlfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtlPT57c2V0Sm9pbkNvZGUoZS50YXJnZXQudmFsdWUucmVwbGFjZSgvXFxEL2csXCJcIikpO3NldEpvaW5FcnJvcihcIlwiKTt9fVxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiMDAwMFwiXG4gICAgICAgICAgICAgICAgc3R5bGU9e3t0ZXh0QWxpZ246XCJjZW50ZXJcIixmb250U2l6ZTpcIjEuOHJlbVwiLGxldHRlclNwYWNpbmc6XCIwLjRlbVwiLGZvbnRGYW1pbHk6XCInRE0gTW9ubycsbW9ub3NwYWNlXCJ9fS8+XG4gICAgICAgICAgICAgIHtqb2luRXJyb3IgJiYgPHAgc3R5bGU9e3tjb2xvcjpcInZhcigtLXJvc2UpXCIsZm9udFNpemU6XCIwLjc1cmVtXCIsbWFyZ2luVG9wOjZ9fT57am9pbkVycm9yfTwvcD59XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxwIHN0eWxlPXt7Zm9udFNpemU6XCIwLjc1cmVtXCIsY29sb3I6XCJ2YXIoLS1pbmstbXV0ZWQpXCIsbWFyZ2luQm90dG9tOjEyLGxpbmVIZWlnaHQ6MS42fX0+6Zmq5Ly06ICF5Y+q6IO96Zax6K6A77yM54Sh5rOV5L+u5pS55Lu75L2V57SA6YyE44CCPC9wPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXByaW1hcnlcIiBvbkNsaWNrPXtqb2luQXNWaWV3ZXJ9PuS7pemZquS8tOiAhei6q+S7veWKoOWFpTwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLWdob3N0XCIgb25DbGljaz17KCk9PnNldFN0ZXAoXCJjaG9vc2VcIil9PuKGkCDov5Tlm548L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cblxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbiJdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7QUFDQTtBQUNBOztBQUVBO0FBQ0EsTUFBTUEsV0FBVyxHQUFHLFlBQVk7QUFFaEMsTUFBTUMsT0FBTyxHQUFHLENBQ2Q7RUFBRUMsRUFBRSxFQUFFLGtCQUFrQjtFQUFFQyxLQUFLLEVBQUUsS0FBSztFQUFJQyxXQUFXLEVBQUUsT0FBTztFQUFFQyxJQUFJLEVBQUU7QUFBSyxDQUFDLEVBQzVFO0VBQUVILEVBQUUsRUFBRSxpQkFBaUI7RUFBR0MsS0FBSyxFQUFFLEtBQUs7RUFBSUMsV0FBVyxFQUFFLE9BQU87RUFBRUMsSUFBSSxFQUFFO0FBQUssQ0FBQyxFQUM1RTtFQUFFSCxFQUFFLEVBQUUsY0FBYztFQUFNQyxLQUFLLEVBQUUsS0FBSztFQUFJQyxXQUFXLEVBQUUsT0FBTztFQUFFQyxJQUFJLEVBQUU7QUFBSyxDQUFDLEVBQzVFO0VBQUVILEVBQUUsRUFBRSxhQUFhO0VBQU9DLEtBQUssRUFBRSxLQUFLO0VBQUlDLFdBQVcsRUFBRSxPQUFPO0VBQUVDLElBQUksRUFBRTtBQUFLLENBQUMsRUFDNUU7RUFBRUgsRUFBRSxFQUFFLGVBQWU7RUFBS0MsS0FBSyxFQUFFLEtBQUs7RUFBSUMsV0FBVyxFQUFFLE9BQU87RUFBRUMsSUFBSSxFQUFFO0FBQUssQ0FBQyxFQUM1RTtFQUFFSCxFQUFFLEVBQUUsY0FBYztFQUFNQyxLQUFLLEVBQUUsS0FBSztFQUFJQyxXQUFXLEVBQUUsT0FBTztFQUFFQyxJQUFJLEVBQUU7QUFBSyxDQUFDLEVBQzVFO0VBQUVILEVBQUUsRUFBRSxTQUFTO0VBQVdDLEtBQUssRUFBRSxJQUFJO0VBQU1DLFdBQVcsRUFBRSxPQUFPO0VBQUVDLElBQUksRUFBRTtBQUFLLENB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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7O0FBR0Q7QUFDQSxNQUFNQyxHQUFHLEdBQUc7RUFDVkMsS0FBSyxFQUFLLElBQUFDLFdBQUEsQ0FBQUMsSUFBQTtJQUFLQyxPQUFPLEVBQUMsV0FBVztJQUFDQyxJQUFJLEVBQUMsTUFBTTtJQUFDQyxNQUFNLEVBQUMsY0FBYztJQUFDQyxXQUFXLEVBQUMsS0FBSztJQUFBVCxRQUFBLEdBQUMsSUFBQUksV0FBQSxDQUFBTSxHQUFBO01BQU1DLENBQUMsRUFBQyxHQUFHO01BQUNDLENBQUMsRUFBQyxHQUFHO01BQUNDLEtBQUssRUFBQyxJQUFJO01BQUNDLE1BQU0sRUFBQyxJQUFJO01BQUNDLEVBQUUsRUFBQztJQUFHLENBQUMsQ0FBQyxNQUFBWCxXQUFBLENBQUFNLEdBQUE7TUFBTXpILENBQUMsRUFBQztJQUF1QixDQUFDLENBQUMsTUFBQW1ILFdBQUEsQ0FBQU0sR0FBQTtNQUFRTSxFQUFFLEVBQUMsSUFBSTtNQUFDQyxFQUFFLEVBQUMsSUFBSTtNQUFDQyxDQUFDLEVBQUMsS0FBSztNQUFDWCxJQUFJLEVBQUMsY0FBYztNQUFDQyxNQUFNLEVBQUM7SUFBTSxDQUFDLENBQUM7RUFBQSxDQUFLLENBQUM7RUFDbFBXLElBQUksRUFBTSxJQUFBZixXQUFBLENBQUFDLElBQUE7SUFBS0MsT0FBTyxFQUFDLFdBQVc7SUFBQ0MsSUFBSSxFQUFDLE1BQU07SUFBQ0MsTUFBTSxFQUFDLGNBQWM7SUFBQ0MsV0FBVyxFQUFDLEtBQUs7SUFBQVQsUUFBQSxHQUFDLElBQUFJLFdBQUEsQ0FBQU0sR0FBQTtNQUFNQyxDQUFDLEVBQUMsR0FBRztNQUFDQyxDQUFDLEVBQUMsR0FBRztNQUFDQyxLQUFLLEVBQUMsR0FBRztNQUFDQyxNQUFNLEVBQUMsR0FBRztNQUFDQyxFQUFFLEVBQUM7SUFBSyxDQUFDLENBQUMsTUFBQVgsV0FBQSxDQUFBTSxHQUFBO01BQU1DLENBQUMsRUFBQyxJQUFJO01BQUNDLENBQUMsRUFBQyxHQUFHO01BQUNDLEtBQUssRUFBQyxHQUFHO01BQUNDLE1BQU0sRUFBQyxHQUFHO01BQUNDLEVBQUUsRUFBQztJQUFLLENBQUMsQ0FBQyxNQUFBWCxXQUFBLENBQUFNLEdBQUE7TUFBTUMsQ0FBQyxFQUFDLEdBQUc7TUFBQ0MsQ0FBQyxFQUFDLElBQUk7TUFBQ0MsS0FBSyxFQUFDLEdBQUc7TUFBQ0MsTUFBTSxFQUFDLEdBQUc7TUFBQ0MsRUFBRSxFQUFDO0lBQUssQ0FBQyxDQUFDLE1BQUFYLFdBQUEsQ0FBQU0sR0FBQTtNQUFNQyxDQUFDLEVBQUMsSUFBSTtNQUFDQyxDQUFDLEVBQUMsSUFBSTtNQUFDQyxLQUFLLEVBQUMsR0FBRztNQUFDQyxNQUFNLEVBQUMsR0FBRztNQUFDQyxFQUFFLEVBQUM7SUFBSyxDQUFDLENB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