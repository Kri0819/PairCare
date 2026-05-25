"use strict";
console.log('[PairCare] start v7');
// ═══════════════════════════════════════════════════════════════════════════════
// 陪一刻 v6 — Pair-Centered Architecture
// Data: user + pair + medications + doseLogs, all keyed by pairId
// Flow: ONBOARD → ROLE_SELECT → CREATE_PAIR / JOIN_PAIR → HOME
// UI components (TodayPage, MedsPage, VisitsPage, modals) reused unchanged
// ═══════════════════════════════════════════════════════════════════════════════


var _jsxRuntime = {
  jsx:      React.createElement,
  jsxs:     React.createElement,
  Fragment: React.Fragment
};

// ── Supabase Auth Client ─────────────────────────────────────────────────────
var SUPABASE_URL  = "https://xqjhbobskdgqaopenuos.supabase.co";
var SUPABASE_ANON = "sb_publishable_hFQFX2jLmi8c3X9n0SnRdw_O6IPv9st";
var _sbClient = null;

function getSupabase() {
  if (_sbClient) return _sbClient;
  try {
    var sb = window.supabase || (window.supabase_js && window.supabase_js.createClient ? window.supabase_js : null);
    var createFn = sb && (sb.createClient || (sb.default && sb.default.createClient));
    if (!createFn) { console.warn('[PairCare] Supabase CDN not ready'); return null; }
    _sbClient = createFn(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true,
        storage:            window.localStorage,
        storageKey:         'peiYike_sb_session',
        flowType:           'pkce',
      }
    });
    console.log('[PairCare] Supabase client ready');
  } catch(e) { console.error('[PairCare] Supabase init:', e); }
  return _sbClient;
}

// ─── 1. CONSTANTS ────────────────────────────────────────────────────────────
var STORAGE_KEY = "peiYike_v6";

var PERIODS = [
  { id: "breakfast_before", label: "早餐前",   defaultTime: "07:30", icon: "🌅" },
  { id: "breakfast_after",  label: "早餐後",   defaultTime: "08:00", icon: "🍳" },
  { id: "lunch_before",     label: "午餐前",   defaultTime: "11:30", icon: "☀️" },
  { id: "lunch_after",      label: "午餐後",   defaultTime: "12:30", icon: "🥗" },
  { id: "dinner_before",    label: "晚餐前",   defaultTime: "17:30", icon: "🌇" },
  { id: "dinner_after",     label: "晚餐後",   defaultTime: "18:30", icon: "🍜" },
  { id: "bedtime",          label: "睡前",     defaultTime: "22:00", icon: "🌙" },
  { id: "custom",           label: "自訂時間", defaultTime: "09:00", icon: "⏰" },
];
var PERIOD_MAP = {};
PERIODS.forEach(function(p){ PERIOD_MAP[p.id] = p; });

// ─── 2. EMPTY STATE ──────────────────────────────────────────────────────────
// user  : who is using this device right now
// pair  : the care relationship (shared between patient + caregiver)
// All medications, scheduleLog, doseLogs, doctorVisits are pair-scoped
var EMPTY_STATE = {
  user:        null,   // { id, name, role:"patient"|"caregiver", pairId }
  pair:        null,   // { id, patientId, caregiverId, inviteCode, locked, createdAt }
  medications: [],
  scheduleLog: {},
  doseLogs:    [],
  doctorVisits:[],
  settings:    { dayResetHour: 4, reminderTimes: [] },
};

// ─── 3. HELPERS ──────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function inviteCode() {
  // 6-char uppercase alphanumeric, easy to type
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function getLogicalDate(h) {
  try {
    var hour = Number(h) || 4;
    var now = new Date();
    if (now.getHours() < hour) {
      var d = new Date(now); d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    return now.toISOString().slice(0, 10);
  } catch(e) { return new Date().toISOString().slice(0, 10); }
}
function nowHHMM() {
  try { return new Date().toTimeString().slice(0, 5); } catch(e) { return "00:00"; }
}
function periodTime(sched) {
  if (!sched) return "08:00";
  if (sched.periodId === "custom" && sched.customTime) return sched.customTime;
  return (PERIOD_MAP[sched.periodId] ? PERIOD_MAP[sched.periodId].defaultTime : "08:00") || "08:00";
}
function toMins(hhmm) {
  try { var p = (hhmm||"00:00").split(":").map(Number); return (p[0]||0)*60+(p[1]||0); }
  catch(e) { return 0; }
}
function doseKey(dateStr, medId, periodId) {
  return String(dateStr)+"|"+String(medId)+"|"+String(periodId);
}
function estimateFinishDate(remaining, dailyDose) {
  try {
    if (!dailyDose || dailyDose <= 0 || !remaining || remaining <= 0) return null;
    var days = Math.floor(remaining / dailyDose);
    if (!isFinite(days) || days < 0) return null;
    var d = new Date(); d.setDate(d.getDate() + days);
    return { days: days, date: d.toLocaleDateString("zh-TW", { month:"numeric", day:"numeric" }) };
  } catch(e) { return null; }
}

// ─── 4. STORAGE ──────────────────────────────────────────────────────────────
function safeJSON(raw) {
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function sanitizeMed(m) {
  if (!m || typeof m !== "object") return null;
  return {
    id:             m.id             || uid(),
    pairId:         m.pairId         || null,
    name:           String(m.name    || "未知藥物"),
    status:         ["active","paused","completed"].includes(m.status) ? m.status : "active",
    totalCount:     Number(m.totalCount)     || 0,
    remainingCount: Number(m.remainingCount) || 0,
    createdAt:      m.createdAt      || new Date().toISOString(),
    schedules:      Array.isArray(m.schedules) ? m.schedules.filter(Boolean)
                    : [{ periodId:"breakfast_after", customTime:null, dose: Number(m.dosePerTime)||1 }],
  };
}

function sanitizeState(s) {
  if (!s || typeof s !== "object") return null;
  var rawPair = s.pair && typeof s.pair === "object" ? s.pair : null;
  var rawUser = s.user && typeof s.user === "object" ? s.user : null;
  return {
    user: rawUser ? {
      id:     rawUser.id     || uid(),
      name:   String(rawUser.name || ""),
      role:   ["patient","caregiver"].includes(rawUser.role) ? rawUser.role : "patient",
      pairId: rawUser.pairId || (rawPair && rawPair.id) || null,
    } : null,
    pair: rawPair ? {
      id:          rawPair.id          || uid(),
      patientId:   rawPair.patientId   || null,
      caregiverId: rawPair.caregiverId || null,
      inviteCode:  rawPair.inviteCode  || inviteCode(),
      locked:      !!rawPair.locked,
      createdAt:   rawPair.createdAt   || new Date().toISOString(),
    } : null,
    medications:  Array.isArray(s.medications)  ? s.medications.map(sanitizeMed).filter(Boolean) : [],
    scheduleLog: (function() {
      var raw = s.scheduleLog && typeof s.scheduleLog === "object" ? s.scheduleLog : {};
      // Migration: old entries were { takenAt: "HH:MM" } — upgrade to full format
      var out = {};
      Object.keys(raw).forEach(function(k) {
        var entry = raw[k];
        if (!entry || typeof entry !== "object") return;
        // If takenAt is already ISO (length > 8), keep as-is
        // If takenAt is "HH:MM" (legacy), convert to partial record
        var ta = entry.takenAt || "";
        if (ta && ta.length <= 5) {
          // Legacy HH:MM — keep displayTime, takenAt becomes null (no full ISO available)
          out[k] = { takenAt: null, displayTime: ta, periodId: entry.periodId || null, medicationId: entry.medicationId || null };
        } else {
          out[k] = {
            takenAt:      entry.takenAt      || null,
            displayTime:  entry.displayTime  || (entry.takenAt ? entry.takenAt.slice(11,16) : null),
            periodId:     entry.periodId     || null,
            medicationId: entry.medicationId || null,
          };
        }
      });
      return out;
    })(),
    doseLogs:     Array.isArray(s.doseLogs)     ? s.doseLogs     : [],
    doctorVisits: Array.isArray(s.doctorVisits) ? s.doctorVisits : [],
    settings: {
      dayResetHour:  Number(s.settings && s.settings.dayResetHour)  || 4,
      reminderTimes: Array.isArray(s.settings && s.settings.reminderTimes)
                     ? s.settings.reminderTimes : [],
    },
  };
}

function saveUser(user) {
  try {
    if (user && user.id) localStorage.setItem(STORAGE_KEY+"_user", JSON.stringify(user));
    else                  localStorage.removeItem(STORAGE_KEY+"_user");
  } catch(e) {}
}
function loadSavedUser() {
  try { var u = safeJSON(localStorage.getItem(STORAGE_KEY+"_user")); return (u && u.id) ? u : null; }
  catch(e) { return null; }
}

function loadState() {
  console.log('[PairCare] loadState called');
  try {
    // Always try to get user from backup key first
    var savedUser = loadSavedUser();
    console.log('[PairCare] savedUser:', savedUser && savedUser.name);

    // Try v6 full state
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = safeJSON(raw);
      var clean  = sanitizeState(parsed);
      if (clean) {
        // User in full state takes priority; fall back to _user key
        if (!clean.user && savedUser) clean.user = savedUser;
        console.log('[PairCare] loaded from v6, user:', clean.user && clean.user.name);
        return clean;
      }
    }

    // Migrate from v3
    var oldRaw = localStorage.getItem("peiYike_v3");
    if (oldRaw) {
      var old = safeJSON(oldRaw);
      if (old) {
        var meds = Array.isArray(old.medications)
          ? old.medications.map(sanitizeMed).filter(Boolean) : [];
        var migrated = Object.assign({}, EMPTY_STATE, {
          medications:  meds,
          scheduleLog:  old.scheduleLog  || {},
          doseLogs:     old.doseLogs     || [],
          doctorVisits: old.doctorVisits || [],
          settings: { dayResetHour: (old.settings && old.settings.dayResetHour) || 4, reminderTimes: [] },
        });
        migrated.user = savedUser;
        console.log('[PairCare] migrated from v3, user:', migrated.user && migrated.user.name);
        return migrated;
      }
    }

    // Fresh start — but still try to recover user
    var fresh = Object.assign({}, EMPTY_STATE, { user: savedUser });
    console.log('[PairCare] fresh state, user:', fresh.user && fresh.user.name);
    return fresh;
  } catch(e) {
    console.error('[PairCare] loadState error:', e);
    return Object.assign({}, EMPTY_STATE, { user: loadSavedUser() });
  }
}

function saveState(s) {
  try {
    if (!s || typeof s !== "object") return;
    var serialized = JSON.stringify(s);
    localStorage.setItem(STORAGE_KEY, serialized);
    // Always write user to backup key — this is the persistence lifeline
    saveUser(s.user);
    console.log('[PairCare] saved, user:', s.user && s.user.name, 'pair:', s.pair && s.pair.id);
  } catch(e) { console.warn('[PairCare] saveState error:', e); }
}

// ─── 5. NOTIFICATIONS ────────────────────────────────────────────────────────
function requestNotif() {
  try {
    if (!("Notification" in window)) return Promise.resolve(false);
    if (Notification.permission === "granted") return Promise.resolve(true);
    if (Notification.permission === "denied")  return Promise.resolve(false);
    return Notification.requestPermission().then(function(r){ return r === "granted"; });
  } catch(e) { return Promise.resolve(false); }
}
function notify(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body:body, tag:"peiYike", icon:"/icons/icon-192.png" });
  } catch(e) {}
}

// ─── 6. ERROR BOUNDARY ───────────────────────────────────────────────────────
function ErrorBoundary(props) {
  React.Component.call(this, props);
  this.state = { crashed: false, error: null };
}
ErrorBoundary.prototype = Object.create(React.Component.prototype);
ErrorBoundary.prototype.constructor = ErrorBoundary;
ErrorBoundary.getDerivedStateFromError = function(error) {
  return { crashed: true, error: error };
};
ErrorBoundary.prototype.componentDidCatch = function(error, info) {
  console.error('[\u964c\u4e00\u523b ErrorBoundary]', error, info);
};
ErrorBoundary.prototype.render = function() {
  if (this.state.crashed) {
    return React.createElement('div', {
      style: { display:'flex', flexDirection:'column', alignItems:'center',
               justifyContent:'center', minHeight:'100svh', padding:'32px',
               textAlign:'center', background:'#FAF7F2', gap:16 }
    },
      React.createElement('h2', { style:{fontSize:'1.1rem',color:'#231C10'} }, '\u767c\u751f\u932f\u8aa4'),
      React.createElement('p', { style:{fontSize:'0.82rem',color:'#998870',lineHeight:1.6,maxWidth:300} },
        '\u61c9\u7528\u7a0b\u5f0f\u767c\u751f\u932f\u8aa4\uff0c\u8acb\u91cd\u65b0\u555f\u52d5\u3002'),
      React.createElement('button', {
        onClick: function() { window.location.reload(); },
        style: { padding:'12px 24px',background:'#C4785A',color:'white',border:'none',borderRadius:10,fontSize:'0.9rem',cursor:'pointer',marginTop:8 }
      }, '\u91cd\u65b0\u555f\u52d5'),
      React.createElement('button', {
        onClick: function() { try{localStorage.clear();}catch(e){} window.location.reload(); },
        style: { padding:'10px 20px',background:'#998870',color:'white',border:'none',borderRadius:10,fontSize:'0.82rem',cursor:'pointer',marginTop:4 }
      }, '\u6e05\u9664\u8cc7\u6599\u4e26\u91cd\u555f')
    );
  }
  return this.props.children;
};
window.ErrorBoundary = ErrorBoundary;
var CSS = `
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
var Ico = {
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



// ─── 7. APP ROOT (Pair-Centered Flow) ────────────────────────────────────────
//
// Flow: LOGIN → ROLE_SELECT → CREATE_PAIR | JOIN_PAIR → HOME
// screen is derived from state — no separate router needed

window.App = function App() {
  // Load from localStorage synchronously on first render
  var _useState = useState(function() {
    try {
      var loaded = loadState();
      if (loaded && typeof loaded === "object") return loaded;
    } catch(e) { console.error('[PairCare] init error:', e); }
    return Object.assign({}, EMPTY_STATE);
  });
  var state    = _useState[0];
  var setState = _useState[1];

  // isHydrated: blocks routing until Supabase session check completes
  var _hydratedState = useState(false);
  var isHydrated    = _hydratedState[0];
  var setIsHydrated = _hydratedState[1];

  // sbAuthUser: the raw Supabase auth user object (null = logged out)
  var _sbState  = useState(null);
  var sbAuthUser    = _sbState[0];
  var setSbAuthUser = _sbState[1];

  var _tabState = useState("today");
  var tab    = _tabState[0];
  var setTab = _tabState[1];

  var _modalState = useState(null);
  var modal    = _modalState[0];
  var setModal = _modalState[1];

  var _toastState = useState(null);
  var toast    = _toastState[0];
  var setToast = _toastState[1];

  var _notifState = useState(function(){
    try { return typeof Notification !== "undefined" && Notification.permission === "granted"; }
    catch(e){ return false; }
  });
  var notifOk    = _notifState[0];
  var setNotifOk = _notifState[1];

  var _nowState = useState(function(){ return new Date(); });
  var now    = _nowState[0];
  var setNow = _nowState[1];

  var firedRef     = useRef({});
  var lastSavedRef = useRef(null);

  // ── Supabase session restore on mount ────────────────────────────────────────
  useEffect(function() {
    var sb = getSupabase();
    if (!sb) {
      // Supabase not available — fall back to localStorage-only mode
      console.warn('[PairCare] No Supabase, using localStorage only');
      setIsHydrated(true);
      return;
    }

    // 1. Check existing session (handles iOS PWA reload)
    sb.auth.getSession().then(function(result) {
      var session = result && result.data && result.data.session;
      if (session && session.user) {
        console.log('[PairCare] Restored session for:', session.user.email);
        setSbAuthUser(session.user);
        // Merge Supabase user identity into app state
        setState(function(prev) {
          var next = JSON.parse(JSON.stringify(prev));
          if (!next.user) {
            // Build user from Supabase session + any saved local profile
            var saved = loadSavedUser();
            next.user = {
              id:     session.user.id,
              name:   (saved && saved.name) || session.user.email.split('@')[0],
              role:   (saved && saved.role) || null,
              pairId: (saved && saved.pairId) || null,
              email:  session.user.email,
            };
          } else {
            // Update id/email to match Supabase
            next.user.id    = session.user.id;
            next.user.email = session.user.email;
          }
          return next;
        });
      } else {
        console.log('[PairCare] No active session');
      }
      setIsHydrated(true);
    }).catch(function(e) {
      console.error('[PairCare] getSession error:', e);
      setIsHydrated(true);
    });

    // 2. Listen for auth changes (login, logout, token refresh)
    var sub = sb.auth.onAuthStateChange(function(event, session) {
      console.log('[PairCare] auth event:', event);
      if (event === 'SIGNED_IN' && session && session.user) {
        setSbAuthUser(session.user);
        setState(function(prev) {
          var next = JSON.parse(JSON.stringify(prev));
          if (!next.user) {
            var saved = loadSavedUser();
            next.user = {
              id:     session.user.id,
              name:   (saved && saved.name) || session.user.email.split('@')[0],
              role:   (saved && saved.role) || null,
              pairId: (saved && saved.pairId) || null,
              email:  session.user.email,
            };
          } else {
            next.user.id    = session.user.id;
            next.user.email = session.user.email;
          }
          return next;
        });
      } else if (event === 'SIGNED_OUT') {
        setSbAuthUser(null);
        setState(function(prev) {
          var next = JSON.parse(JSON.stringify(prev));
          next.user = null;
          return next;
        });
      } else if (event === 'TOKEN_REFRESHED' && session && session.user) {
        setSbAuthUser(session.user);
      }
    });

    return function() {
      if (sub && sub.data && sub.data.subscription) {
        sub.data.subscription.unsubscribe();
      }
    };
  }, []); // run once on mount

  // Persist state on every change (after hydration)
  useEffect(function() {
    if (!isHydrated) return;
    var serialized = JSON.stringify(state);
    if (serialized !== lastSavedRef.current) {
      lastSavedRef.current = serialized;
      saveState(state);
    }
  }, [state, isHydrated]);

  // Clock tick
  useEffect(function() {
    var t = setInterval(function(){ setNow(new Date()); }, 30000);
    return function(){ clearInterval(t); };
  }, []);

  // Notification reminder engine
  useEffect(function() {
    if (!notifOk) return;
    var safeMeds     = Array.isArray(state.medications) ? state.medications : [];
    var safeLog      = state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {};
    var safeSettings = state.settings && typeof state.settings === "object" ? state.settings : { dayResetHour:4, reminderTimes:[] };

    function check() {
      var date = getLogicalDate(safeSettings.dayResetHour || 4);
      var nowM = now.getHours() * 60 + now.getMinutes();
      safeMeds.filter(function(m){ return m && m.status === "active"; }).forEach(function(med) {
        (med.schedules || []).forEach(function(sched) {
          var key  = doseKey(date, med.id, sched.periodId);
          var log  = safeLog[key];
          if (log) return;
          var t    = toMins(periodTime(sched));
          var diff = nowM - t;
          if (diff >= 0 && diff < 2 && !firedRef.current[key+"_due"]) {
            firedRef.current[key+"_due"] = true;
            var lbl = PERIOD_MAP[sched.periodId] && PERIOD_MAP[sched.periodId].label;
            notify("陪一刻｜服藥提醒", "現在是"+(lbl||"")+"用藥時間，記得吃 "+med.name);
          }
          if (diff >= 90 && !firedRef.current[key+"_late"]) {
            firedRef.current[key+"_late"] = true;
            notify("陪一刻｜還沒吃藥", med.name+" 的劑量超過 90 分鐘未記錄");
          }
        });
      });
      (safeSettings.reminderTimes || []).forEach(function(rt) {
        var fk   = "reminder_"+getLogicalDate(safeSettings.dayResetHour||4)+"_"+rt;
        var diff = now.getHours()*60+now.getMinutes() - toMins(rt);
        if (diff >= 0 && diff < 2 && !firedRef.current[fk]) {
          firedRef.current[fk] = true;
          notify("陪一刻｜該吃藥了", "記得按時服藥，照顧好自己 💊");
        }
      });
    }
    check();
    var t = setInterval(check, 60000);
    return function(){ clearInterval(t); };
  }, [notifOk, state.medications, state.scheduleLog, state.settings, now]);

  var showToast = useCallback(function(msg) {
    setToast(msg); setTimeout(function(){ setToast(null); }, 2400);
  }, []);

  var update = useCallback(function(fn) {
    setState(function(prev) {
      try {
        var next = JSON.parse(JSON.stringify(prev));
        fn(next);
        if (!Array.isArray(next.medications))  next.medications  = [];
        if (!Array.isArray(next.doseLogs))     next.doseLogs     = [];
        if (!Array.isArray(next.doctorVisits)) next.doctorVisits = [];
        if (!next.scheduleLog || typeof next.scheduleLog !== "object") next.scheduleLog = {};
        if (!next.settings)  next.settings  = { dayResetHour:4, reminderTimes:[] };
        // pair guard
        if (next.pair && typeof next.pair !== "object") next.pair = null;
        return next;
      } catch(e) {
        console.error("[PairCare] update:", e);
        return prev;
      }
    });
  }, []);

  // ── Derived state guards ────────────────────────────────────────────────────
  var safeMeds     = Array.isArray(state.medications) ? state.medications : [];
  var safeLog      = state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {};
  var safeSettings = state.settings && typeof state.settings === "object"
    ? state.settings : { dayResetHour:4, reminderTimes:[] };
  var dayResetHour = (safeSettings.dayResetHour != null ? Number(safeSettings.dayResetHour) : 4) || 4;
  var logicalDate  = getLogicalDate(dayResetHour);
  var activeMeds   = safeMeds.filter(function(m){ return m && m.status === "active"; });

  var user = state.user;
  var pair = state.pair && typeof state.pair === "object" ? state.pair : null;

  // ── Screen routing (state machine) ─────────────────────────────────────────
  // Wait for hydration before routing — prevents flash-to-login on reload
  if (!isHydrated) {
    return _jsxRuntime.jsxs("div", {
      className: "app",
      children: [
        _jsxRuntime.jsx("style", { children: CSS }),
        _jsxRuntime.jsxs("div", {
          style: { position:"fixed", inset:0, display:"flex", flexDirection:"column",
                   alignItems:"center", justifyContent:"center",
                   background:"linear-gradient(160deg,#FAF7F2 55%,#F5E6DE)", gap:20 },
          children: [
            _jsxRuntime.jsx("h1", {
              style: { fontSize:"2.4rem", letterSpacing:"0.12em",
                       color:"#231C10", fontWeight:400, fontFamily:"serif" },
              children: "陪一刻"
            }),
            _jsxRuntime.jsxs("div", {
              style: { display:"flex", gap:8 },
              children: [
                _jsxRuntime.jsx("div", { style:{ width:8,height:8,borderRadius:"50%",background:"#C4785A",animation:"pulse 1.2s ease-in-out infinite" } }),
                _jsxRuntime.jsx("div", { style:{ width:8,height:8,borderRadius:"50%",background:"#C4785A",animation:"pulse 1.2s ease-in-out .2s infinite" } }),
                _jsxRuntime.jsx("div", { style:{ width:8,height:8,borderRadius:"50%",background:"#C4785A",animation:"pulse 1.2s ease-in-out .4s infinite" } }),
              ]
            })
          ]
        })
      ]
    });
  }

  // No user → onboarding flow
  if (!user) {
    return _jsxRuntime.jsx(OnboardFlow, { update: update, showToast: showToast });
  }
  // User exists but no pair yet → pair setup
  if (!pair) {
    return _jsxRuntime.jsx(PairSetupFlow, {
      user: user, update: update, showToast: showToast
    });
  }
  // Caregiver joined but pair not locked yet → waiting for patient
  // (In localStorage-only mode both share same device, so we skip this state)

  // ── Main App (pair established) ─────────────────────────────────────────────
  var isCaregiver = user.role === "caregiver";

  function askNotif() {
    requestNotif().then(function(ok) {
      setNotifOk(ok);
      showToast(ok ? "✓ 提醒已開啟" : "瀏覽器拒絕了通知權限");
    });
  }

  return _jsxRuntime.jsxs("div", { className:"app", children: [
    _jsxRuntime.jsx("style", { children: CSS }),
    toast && _jsxRuntime.jsx("div", { className:"toast", children: toast }),
    isCaregiver && _jsxRuntime.jsx("div", { className:"viewer-banner", children:"👀 陪同者模式 — 只能閱讀，無法修改" }),
    (function(){ try { return "Notification" in window && !notifOk && !isCaregiver && Notification.permission !== "denied"; } catch(e){ return false; } })()
      && _jsxRuntime.jsxs("div", { className:"notif-banner", children:[
          _jsxRuntime.jsxs("span", { children:[Ico.bell, " 開啟提醒，到時間自動通知"] }),
          _jsxRuntime.jsx("button", { onClick: askNotif, children:"開啟" })
        ]}),
    _jsxRuntime.jsxs("div", { style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}, children:[
      tab === "today"  && _jsxRuntime.jsx(TodayPage,  {
        state:state, update:update, isViewer:isCaregiver,
        showToast:showToast, setModal:setModal,
        logicalDate:logicalDate, now:now
      }),
      tab === "meds"   && _jsxRuntime.jsx(MedsPage,   {
        state:state, update:update, isViewer:isCaregiver,
        showToast:showToast, setModal:setModal, logicalDate:logicalDate
      }),
      tab === "visits" && _jsxRuntime.jsx(VisitsPage, {
        state:state, update:update, isViewer:isCaregiver,
        showToast:showToast, setModal:setModal
      }),
    ]}),
    _jsxRuntime.jsx("nav", { className:"nav", children:
      [
        { id:"today",  label:"今日一刻", icon:Ico.today  },
        { id:"meds",   label:"藥物清單", icon:Ico.meds   },
        { id:"visits", label:"看診紀錄", icon:Ico.visits },
      ].map(function(item){
        return _jsxRuntime.jsxs("button", {
          className: "nav-item" + (tab === item.id ? " active" : ""),
          onClick: function(){ setTab(item.id); },
          children: [item.icon, _jsxRuntime.jsx("span", { children: item.label })]
        }, item.id);
      })
    }),
    modal === "addMed" && !isCaregiver && _jsxRuntime.jsx(AddMedModal, {
      onClose: function(){ setModal(null); },
      onSave:  function(med) {
        update(function(s) {
          s.medications.push(Object.assign({}, med, {
            id: uid(), pairId: pair.id,
            status: "active", remainingCount: med.totalCount,
            createdAt: new Date().toISOString()
          }));
        });
        showToast("✓ 已新增藥物"); setModal(null);
      }
    }),
    modal === "addVisit" && !isCaregiver && _jsxRuntime.jsx(AddVisitModal, {
      medications: activeMeds, allMeds: state.medications,
      onClose: function(){ setModal(null); },
      onSave:  function(visit) {
        update(function(s) {
          s.doctorVisits.unshift(Object.assign({}, visit, { id:uid(), pairId:pair.id }));
          var continued = new Set(visit.continuedIds || []);
          (visit.newMeds || []).forEach(function(nm) {
            if (!nm.name || !nm.name.trim()) return;
            s.medications.push({
              id:uid(), pairId:pair.id, name:nm.name,
              schedules:nm.schedules, totalCount:nm.totalCount,
              remainingCount:nm.totalCount, status:"active",
              createdAt:visit.date
            });
          });
          s.medications.forEach(function(m) {
            if (m.status === "active" && !continued.has(m.id)) m.status = "paused";
          });
        });
        showToast("✓ 看診紀錄已儲存"); setModal(null);
      }
    }),
    modal === "settings" && _jsxRuntime.jsx(SettingsModal, {
      state:state, update:update, onClose:function(){ setModal(null); },
      showToast:showToast, notifOk:notifOk, askNotif:askNotif
    }),
    modal === "profile" && _jsxRuntime.jsx(ProfileModalV6, {
      state:state, update:update,
      onClose:function(){ setModal(null); }, showToast:showToast
    }),
  ]});
};

// ─── 8. ONBOARD FLOW — Supabase Email OTP ───────────────────────────────────
function OnboardFlow({ update, showToast }) {
  // step: "email" | "otp" | "name" | "role"
  var _s   = useState("email"); var step = _s[0]; var setStep = _s[1];
  var _e   = useState("");      var email = _e[0]; var setEmail = _e[1];
  var _o   = useState("");      var otp   = _o[0]; var setOtp   = _o[1];
  var _n   = useState("");      var name  = _n[0]; var setName  = _n[1];
  var _err = useState("");      var err   = _err[0]; var setErr = _err[1];
  var _ld  = useState(false);   var loading = _ld[0]; var setLoading = _ld[1];

  function sendOTP() {
    if (!email.trim()) { setErr("請輸入 Email"); return; }
    var sb = getSupabase();
    if (!sb) { setErr("Supabase 尚未準備好，請重新整理"); return; }
    setLoading(true); setErr("");
    sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true }
    }).then(function(res) {
      setLoading(false);
      if (res.error) { setErr(res.error.message); return; }
      setStep("otp");
    }).catch(function(e) {
      setLoading(false);
      setErr(e.message || "發送失敗");
    });
  }

  function verifyOTP() {
    if (!otp.trim()) { setErr("請輸入驗證碼"); return; }
    var sb = getSupabase();
    if (!sb) { setErr("Supabase 尚未準備好"); return; }
    setLoading(true); setErr("");
    sb.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type:  "email"
    }).then(function(res) {
      setLoading(false);
      if (res.error) { setErr(res.error.message || "驗證碼錯誤"); return; }
      // Supabase SIGNED_IN event will update state via onAuthStateChange
      // But we also move to name step if user has no name yet
      var savedName = "";
      try {
        var saved = safeJSON(localStorage.getItem(STORAGE_KEY + "_user"));
        if (saved && saved.name) savedName = saved.name;
      } catch(e) {}
      if (savedName) {
        setStep("role");
        setName(savedName);
      } else {
        setStep("name");
      }
    }).catch(function(e) {
      setLoading(false);
      setErr(e.message || "驗證失敗");
    });
  }

  function proceed(chosenRole) {
    if (!name.trim()) return;
    // onAuthStateChange already set sbAuthUser; we just need to set name+role
    update(function(s) {
      if (!s.user) s.user = {};
      s.user.name = name.trim();
      s.user.role = chosenRole;
      // Save immediately
      try {
        localStorage.setItem(STORAGE_KEY + "_user", JSON.stringify(s.user));
      } catch(e) {}
    });
  }

  var cardStyle = { width:"100%" };

  return _jsxRuntime.jsxs("div", { className:"app", children:[
    _jsxRuntime.jsx("style", { children: CSS }),
    _jsxRuntime.jsxs("div", { className:"onboard", children:[
      _jsxRuntime.jsxs("div", { className:"onboard-logo", children:[
        _jsxRuntime.jsx("h1", { children:"陪一刻" }),
        _jsxRuntime.jsx("p",  { children:"CARE RELATIONSHIP LOG" }),
      ]}),

      // Step 1: Email
      step === "email" && _jsxRuntime.jsxs("div", { className:"onboard-card", style:cardStyle, children:[
        _jsxRuntime.jsx("h2", { children:"登入 / 註冊" }),
        _jsxRuntime.jsxs("div", { className:"field", children:[
          _jsxRuntime.jsx("label", { children:"Email" }),
          _jsxRuntime.jsx("input", {
            type:"email", value:email, autoFocus:true,
            placeholder:"your@email.com",
            onChange: function(e){ setEmail(e.target.value); setErr(""); },
            onKeyDown: function(e){ if(e.key==="Enter") sendOTP(); }
          }),
        ]}),
        err && _jsxRuntime.jsx("p", { style:{color:"var(--rose)",fontSize:"0.78rem",marginBottom:8}, children:err }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-primary",
          onClick: sendOTP,
          children: loading ? "發送中…" : "傳送驗證碼"
        }),
        _jsxRuntime.jsx("p", {
          style:{fontSize:"0.72rem",color:"var(--ink-muted)",textAlign:"center",marginTop:12,lineHeight:1.6},
          children:"我們會寄送一次性驗證碼到你的 Email"
        }),
      ]}),

      // Step 2: OTP
      step === "otp" && _jsxRuntime.jsxs("div", { className:"onboard-card", style:cardStyle, children:[
        _jsxRuntime.jsx("h2", { children:"輸入驗證碼" }),
        _jsxRuntime.jsx("p", {
          style:{fontSize:"0.82rem",color:"var(--ink-muted)",marginBottom:16,lineHeight:1.6},
          children:"驗證碼已寄到 " + email
        }),
        _jsxRuntime.jsxs("div", { className:"field", children:[
          _jsxRuntime.jsx("label", { children:"6 位數驗證碼" }),
          _jsxRuntime.jsx("input", {
            type:"text", value:otp, autoFocus:true,
            maxLength:8, placeholder:"123456",
            style:{textAlign:"center",fontSize:"1.6rem",letterSpacing:"0.2em",fontFamily:"'DM Mono',monospace"},
            onChange: function(e){ setOtp(e.target.value.replace(/[^0-9]/g,"")); setErr(""); },
            onKeyDown: function(e){ if(e.key==="Enter") verifyOTP(); }
          }),
        ]}),
        err && _jsxRuntime.jsx("p", { style:{color:"var(--rose)",fontSize:"0.78rem",marginBottom:8}, children:err }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-primary",
          onClick: verifyOTP,
          children: loading ? "驗證中…" : "確認"
        }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-ghost",
          onClick: function(){ setStep("email"); setOtp(""); setErr(""); },
          children:"← 重新輸入 Email"
        }),
      ]}),

      // Step 3: Name
      step === "name" && _jsxRuntime.jsxs("div", { className:"onboard-card", style:cardStyle, children:[
        _jsxRuntime.jsx("h2", { children:"你叫什麼名字？" }),
        _jsxRuntime.jsxs("div", { className:"field", children:[
          _jsxRuntime.jsx("label", { children:"名字" }),
          _jsxRuntime.jsx("input", {
            type:"text", value:name, autoFocus:true, placeholder:"例：小明",
            onChange: function(e){ setName(e.target.value); }
          }),
        ]}),
        _jsxRuntime.jsx("button", {
          className:"btn btn-primary",
          onClick: function(){ if(name.trim()) setStep("role"); },
          children:"下一步"
        }),
      ]}),

      // Step 4: Role
      step === "role" && _jsxRuntime.jsxs("div", { className:"onboard-card", style:cardStyle, children:[
        _jsxRuntime.jsxs("h2", { children:["嗨 ", name || "你好", "，你的身份是？"] }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-primary",
          onClick: function(){ proceed("patient"); },
          children:"我是吃藥者（建立紀錄）"
        }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-secondary",
          onClick: function(){ proceed("caregiver"); },
          children:"我是陪同者（加入紀錄）"
        }),
      ]}),
    ]}),
  ]});
}

// ─── 9. PAIR SETUP FLOW ────────────────────────────────────────────────────────
function PairSetupFlow({ user, update, showToast }) {
  // Patient: auto-create pair with invite code
  // Caregiver: enter invite code to join

  // Patient: generate code once
  var _code = useState(function(){ return inviteCode(); });
  var myCode = _code[0];

  var _inp = useState(""); var inputCode = _inp[0]; var setInputCode = _inp[1];
  var _err = useState(""); var joinErr   = _err[0]; var setJoinErr   = _err[1];
  var _done = useState(false); var done = _done[0]; var setDone = _done[1];

  function createPair() {
    var pairId = uid();
    var newPair = {
      id:          pairId,
      patientId:   user.id,
      caregiverId: null,
      inviteCode:  myCode,
      locked:      false,
      createdAt:   new Date().toISOString(),
    };
    update(function(s) {
      s.pair     = newPair;
      s.user     = Object.assign({}, s.user, { pairId: pairId });
    });
    showToast("✓ 已建立配對，等待陪同者加入");
  }

  function joinPair() {
    var code = inputCode.trim().toUpperCase();
    if (!code) { setJoinErr("請輸入邀請碼"); return; }
    // In localStorage-only mode: look for existing pair with this inviteCode
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      var existingPair = stored && stored.pair;
      if (existingPair && existingPair.inviteCode === code) {
        // Join this pair
        var updatedPair = Object.assign({}, existingPair, {
          caregiverId: user.id,
          locked:      true,
        });
        update(function(s) {
          s.pair       = updatedPair;
          s.user       = Object.assign({}, s.user, { pairId: updatedPair.id });
          // Carry over all existing data from the stored state
          if (stored.medications)  s.medications  = stored.medications;
          if (stored.scheduleLog)  s.scheduleLog  = stored.scheduleLog;
          if (stored.doseLogs)     s.doseLogs      = stored.doseLogs;
          if (stored.doctorVisits) s.doctorVisits  = stored.doctorVisits;
          if (stored.settings)     s.settings      = stored.settings;
        });
        setDone(true);
        showToast("✓ 已成功加入配對");
        return;
      }
    } catch(e) {}
    // Code not found in local storage — store the join intent
    // (patient hasn't set up yet, or different device)
    var pairId = uid();
    update(function(s) {
      s.pair = {
        id:          pairId,
        patientId:   null,
        caregiverId: user.id,
        inviteCode:  code,
        locked:      false,
        createdAt:   new Date().toISOString(),
      };
      s.user = Object.assign({}, s.user, { pairId: pairId });
    });
    setDone(true);
    showToast("✓ 邀請碼已記錄，等待吃藥者確認");
  }

  function copyCode() {
    try { navigator.clipboard.writeText(myCode); showToast("✓ 已複製邀請碼"); }
    catch(e) { showToast("邀請碼：" + myCode); }
  }

  return _jsxRuntime.jsxs("div", { className:"app", children:[
    _jsxRuntime.jsx("style", { children: CSS }),
    _jsxRuntime.jsxs("div", { className:"onboard", children:[
      _jsxRuntime.jsxs("div", { className:"onboard-logo", children:[
        _jsxRuntime.jsx("h1", { children:"陪一刻" }),
        _jsxRuntime.jsx("p",  { children:"CARE RELATIONSHIP LOG" }),
      ]}),

      // Patient flow
      user.role === "patient" && _jsxRuntime.jsxs("div", { className:"onboard-card", children:[
        _jsxRuntime.jsx("h2", { children:"建立你的配對" }),
        _jsxRuntime.jsxs("div", { style:{background:"var(--rose-pale)",borderRadius:12,padding:"20px 16px",textAlign:"center",marginBottom:16,border:"1.5px dashed var(--rose-light)"}, children:[
          _jsxRuntime.jsx("div", { style:{fontFamily:"'DM Mono',monospace",fontSize:"2.4rem",color:"var(--rose)",letterSpacing:"0.3em",fontWeight:500}, children: myCode }),
          _jsxRuntime.jsx("p",   { style:{fontSize:"0.72rem",color:"var(--ink-muted)",marginTop:6}, children:"這是你的邀請碼，傳給陪同者" }),
        ]}),
        _jsxRuntime.jsx("button", {
          className:"btn btn-secondary btn-sm",
          style:{marginBottom:12,marginTop:0},
          onClick: copyCode,
          children:"複製邀請碼"
        }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-primary",
          onClick: createPair,
          children:"建立配對並開始"
        }),
      ]}),

      // Caregiver flow
      user.role === "caregiver" && !done && _jsxRuntime.jsxs("div", { className:"onboard-card", children:[
        _jsxRuntime.jsx("h2", { children:"輸入吃藥者的邀請碼" }),
        _jsxRuntime.jsxs("div", { className:"field", children:[
          _jsxRuntime.jsx("label", { children:"邀請碼" }),
          _jsxRuntime.jsx("input", {
            type:"text", maxLength:8, value:inputCode,
            placeholder:"XXXXXX", autoFocus:true,
            style:{textAlign:"center",fontSize:"1.8rem",letterSpacing:"0.3em",fontFamily:"'DM Mono',monospace"},
            onChange: function(e){ setInputCode(e.target.value.toUpperCase()); setJoinErr(""); }
          }),
          joinErr && _jsxRuntime.jsx("p", { style:{color:"var(--rose)",fontSize:"0.75rem",marginTop:4}, children:joinErr }),
        ]}),
        _jsxRuntime.jsx("button", { className:"btn btn-primary", onClick:joinPair, children:"加入配對" }),
      ]}),

      // Caregiver success
      user.role === "caregiver" && done && _jsxRuntime.jsxs("div", { className:"onboard-card", children:[
        _jsxRuntime.jsx("div", { style:{textAlign:"center",fontSize:"2rem",marginBottom:12}, children:"🌿" }),
        _jsxRuntime.jsx("h2", { style:{textAlign:"center"}, children:"已成功綁定" }),
        _jsxRuntime.jsx("p",  { style:{fontSize:"0.82rem",color:"var(--ink-muted)",textAlign:"center",marginTop:8,lineHeight:1.6},
          children:"你現在可以看到吃藥者的用藥紀錄了。" }),
      ]}),
    ]}),
  ]});
}

// ─── 10. PROFILE MODAL V6 (pair-aware) ───────────────────────────────────────
function ProfileModalV6({ state, update, onClose, showToast }) {
  var u    = state.user;
  var pair = state.pair;

  function logout() {
    try { localStorage.removeItem(STORAGE_KEY+"_user"); } catch(e){}
    update(function(s){ s.user = null; });
    onClose();
  }
  function resetAll() {
    if (!window.confirm("⚠️ 確定清除所有資料？此操作無法還原。")) return;
    [STORAGE_KEY, STORAGE_KEY+"_user", "peiYike_v3", "peiYike_v3_user"].forEach(function(k){
      try { localStorage.removeItem(k); } catch(e){}
    });
    window.location.reload();
  }
  function copyCode() {
    var code = pair && pair.inviteCode;
    if (!code) return;
    try { navigator.clipboard.writeText(code); showToast("✓ 已複製邀請碼"); }
    catch(e) { showToast("邀請碼：" + code); }
  }

  return _jsxRuntime.jsxs("div", {
    className:"modal-overlay",
    onClick: function(e){ if(e.target === e.currentTarget) onClose(); },
    children:[_jsxRuntime.jsxs("div", { className:"modal", children:[
      _jsxRuntime.jsxs("div", { className:"modal-top", children:[
        _jsxRuntime.jsx("div", { className:"modal-handle" }),
        _jsxRuntime.jsx("h3", { children:"帳號 & 配對" }),
      ]}),
      _jsxRuntime.jsxs("div", { className:"modal-scroll", children:[
        // User info
        _jsxRuntime.jsxs("div", { className:"pair-info", children:[
          _jsxRuntime.jsx("span", { children:"👤" }),
          _jsxRuntime.jsxs("span", { children:[
            u && u.name, " · ", u && u.role === "patient" ? "吃藥者" : "陪同者"
          ]}),
        ]}),

        // Pair info
        pair && _jsxRuntime.jsxs("div", { style:{background:"var(--cream)",borderRadius:12,border:"1.5px solid var(--border)",padding:"14px 16px",marginBottom:14}, children:[
          _jsxRuntime.jsxs("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}, children:[
            _jsxRuntime.jsx("span", { style:{fontSize:"0.78rem",fontWeight:600,color:"var(--ink-light)",letterSpacing:"0.06em"}, children:"配對狀態" }),
            _jsxRuntime.jsx("span", { style:{
              fontSize:"0.68rem",fontFamily:"monospace",padding:"3px 9px",
              borderRadius:20,fontWeight:600,
              background: pair.locked ? "var(--sage-pale)" : "var(--amber-pale)",
              color:      pair.locked ? "var(--sage)"      : "var(--amber)",
            }, children: pair.locked ? "✓ 已鎖定" : "等待陪同者" }),
          ]}),
          u && u.role === "patient" && _jsxRuntime.jsxs("div", { children:[
            _jsxRuntime.jsx("div", { style:{fontFamily:"'DM Mono',monospace",fontSize:"1.8rem",color:"var(--rose)",letterSpacing:"0.25em",textAlign:"center",padding:"8px 0 4px"}, children: pair.inviteCode }),
            _jsxRuntime.jsx("div", { style:{fontSize:"0.7rem",color:"var(--ink-muted)",textAlign:"center",marginBottom:8}, children:"邀請碼（傳給陪同者）" }),
            _jsxRuntime.jsx("button", { className:"btn btn-secondary btn-sm", style:{marginTop:0}, onClick:copyCode, children:"複製邀請碼" }),
          ]}),
          u && u.role === "caregiver" && pair.locked && _jsxRuntime.jsx("div", {
            style:{fontSize:"0.82rem",color:"var(--sage-dark)",textAlign:"center",padding:"4px 0"},
            children:"✓ 已成功綁定吃藥者"
          }),
        ]}),

        _jsxRuntime.jsx("hr", { className:"divider" }),
        _jsxRuntime.jsxs("p", {
          style:{fontSize:"0.75rem",color:"var(--ink-muted)",marginBottom:16,lineHeight:1.7},
          children:[
            (Array.isArray(state.medications) ? state.medications : []).length, " 種藥物 · ",
            Object.keys(state.scheduleLog || {}).length, " 筆服藥紀錄 · ",
            (Array.isArray(state.doctorVisits) ? state.doctorVisits : []).length, " 筆看診紀錄",
          ]
        }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-secondary", style:{marginBottom:8,marginTop:0},
          onClick:logout, children:"登出帳號（保留所有資料）"
        }),
        _jsxRuntime.jsx("div", {
          style:{background:"var(--amber-pale)",border:"1.5px solid #DFC070",borderRadius:10,
                 padding:"10px 14px",marginBottom:14,fontSize:"0.75rem",color:"var(--amber)",lineHeight:1.6},
          children:"⚠ 登出 ≠ 清除資料。登出只是換人登入，所有紀錄仍然保留。"
        }),
        u && u.role === "patient" && _jsxRuntime.jsx("button", {
          className:"btn btn-danger btn-sm", onClick:resetAll,
          children:"清除所有資料（無法還原）"
        }),
        _jsxRuntime.jsx("button", {
          className:"btn btn-ghost", style:{marginTop:10,width:"100%"},
          onClick:onClose, children:"取消"
        }),
      ]}),
    ]})]
  });
}
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
  var safeMeds     = Array.isArray(state.medications)  ? state.medications  : [];
  var safeLog      = (state.scheduleLog && typeof state.scheduleLog === 'object') ? state.scheduleLog : {};
  var safeVisits   = Array.isArray(state.doctorVisits) ? state.doctorVisits : [];
  var safeSettings = state.settings && typeof state.settings === 'object'
    ? state.settings
    : { dayResetHour: 4, reminderTimes: [] };
  var activeMeds = safeMeds.filter(function(m){ return m && m.status === "active"; });
  var dayResetHour = safeSettings.dayResetHour || 4;
  var nowMins = now.getHours() * 60 + now.getMinutes();

  // Build period groups: { periodId, label, icon, time, meds[] }
  var periodGroupMap = {};
  activeMeds.forEach(med => {
    (med.schedules || []).forEach(sched => {
      var pid = sched.periodId;
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
  var groups = Object.values(periodGroupMap).sort((a, b) => toMins(a.time) - toMins(b.time));
  var totalGroups = groups.length;
  var doneGroups = groups.filter(g => g.meds.every(({
    key
  }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt))).length;
  var pct = totalGroups > 0 ? Math.round(doneGroups / totalGroups * 100) : 0;
  var CIRC = 2 * Math.PI * 26; // r=26

  function markPeriodTaken(group) {
    if (isViewer) return;
    var now_iso = new Date().toISOString();
    var now_hhmm = now_iso.slice(11, 16); // "HH:MM" in UTC — display only
    try { now_hhmm = new Date().toTimeString().slice(0, 5); } catch(e) {}
    update(function(s) {
      group.meds.forEach(function(item) {
        var key  = item.key;
        var sched = item.sched;
        var med   = item.med;
        // Full record: takenAt (ISO), displayTime (HH:MM local), periodId, medicationId
        s.scheduleLog[key] = {
          takenAt:      now_iso,
          displayTime:  now_hhmm,
          periodId:     sched.periodId,
          medicationId: med.id,
        };
        var m = s.medications.find(function(m){ return m.id === med.id; });
        if (m) m.remainingCount = Math.max(0, (m.remainingCount || 0) - sched.dose);
      });
    });
    showToast("✓ " + group.label + " 已完成");
  }
  function undoPeriod(group) {
    if (isViewer) return;
    update(s => {
      group.meds.forEach(({
        key,
        sched,
        med
      }) => {
        if ((s.scheduleLog[key] && (s.scheduleLog[key].takenAt || s.scheduleLog[key].displayTime))) {
          var m = s.medications.find(function(m){ return m.id === med.id; });
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
            children: pct === 100 ? "今天全部完成 🌿" : doneGroups === 0 ? "今天還沒有紀錄" : "已完成 " + pct + "%"
          }), (0, _jsxRuntime.jsx)("p", {
            children: pct === 100 ? "謝謝你認真照顧自己" : "還有 " + totalGroups - doneGroups + " 個時段待服藥"
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
        var allDone = group.meds.every(({
          key
        }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt));
        var anyDone = group.meds.some(({
          key
        }) => !!((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt));
        var tMins = toMins(group.time);
        var isLate = !allDone && nowMins - tMins > 30;
        var isNow = !allDone && nowMins - tMins >= 0 && nowMins - tMins <= 30;
        var cardClass = "period-card";
        if (allDone) cardClass += " is-done";else if (isNow) cardClass += " is-now";else if (isLate) cardClass += " is-late";
        var firstTakenAt = group.meds.map(({
          key
        }) => ((state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key] && (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key].takenAt)).filter(Boolean)[0];
        var firstDisplayTime = group.meds.map(function(item) {
          var log = safeLog[item.key];
          return log && (log.displayTime || (log.takenAt ? log.takenAt.slice(11,16) : null));
        }).filter(Boolean)[0];
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
                var log = (state.scheduleLog && typeof state.scheduleLog === "object" ? state.scheduleLog : {})[key];
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
                    children: log && (log.takenAt || log.displayTime)
                      ? ("✅ " + (log.displayTime || (log.takenAt ? log.takenAt.slice(11,16) : "")))
                      : "○"
                  })]
                }, key);
              })
            }), (0, _jsxRuntime.jsxs)("div", {
              className: "period-footer " + allDone ? "done" : isLate ? "late" : "",
              children: [(0, _jsxRuntime.jsx)("div", {
                className: "period-footer-label",
                children: (allDone ? ("✓ 已服藥 " + (firstDisplayTime || firstTakenAt || "")) : (isLate ? ("⚠ 已超過 " + (nowMins - tMins) + " 分鐘") : (isNow ? "⏰ 現在服藥時間" : "")))
              }), !isViewer && (allDone ? (0, _jsxRuntime.jsx)("button", {
                className: "btn-undo",
                onClick: function(){ undoPeriod(group); },
                children: "\u64A4\u92B7"
              }) : (0, _jsxRuntime.jsx)("button", {
                className: "btn-take-period",
                onClick: function(){ markPeriodTaken(group); },
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
  var active = (Array.isArray(state.medications) ? state.medications : []).filter(function(m){ return m.status === "active"; });
  var paused = (Array.isArray(state.medications) ? state.medications : []).filter(function(m){ return m.status === "paused"; });
  function toggle(id) {
    if (isViewer) return;
    update(s => {
      var m = s.medications.find(function(m){ return m.id === id; });
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
  var pct = med.totalCount > 0 ? Math.round(med.remainingCount / med.totalCount * 100) : 0;
  var dailyDose = (med.schedules || []).reduce((s, sc) => s + sc.dose, 0);
  var est = estimateFinishDate(med.remainingCount, dailyDose);
  var low = est && est.days < 7;
  return (0, _jsxRuntime.jsxs)("div", {
    className: "med-card " + med.status,
    children: [(0, _jsxRuntime.jsxs)("div", {
      className: "med-card-top",
      children: [(0, _jsxRuntime.jsx)("div", {
        children: (0, _jsxRuntime.jsx)("div", {
          className: "med-card-name",
          children: med.name
        })
      }), (0, _jsxRuntime.jsx)("span", {
        className: "status-tag " + med.status === "active" ? "tag-active" : "tag-paused",
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
          width: pct + "%",
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
  var sorted = state.doctorVisits.slice().sort((a, b) => b.date.localeCompare(a.date));
  function getMedName(id) {
    return ((Array.isArray(state.medications) ? state.medications : []).find(function(m){ return m.id === id; }) || {}).name || "—";
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
  var isSelected = pid => selected.some(function(s){ return s.periodId === pid; });
  function toggle(pid) {
    if (isSelected(pid)) {
      onChange(selected.filter(function(s){ return s.periodId !== pid; }));
    } else {
      var defaultT = PERIOD_MAP[pid] && PERIOD_MAP[pid].defaultTime || "08:00";
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
      var sel = isSelected(p.id);
      var sched = selected.find(function(s){ return s.periodId === p.id; });
      return (0, _jsxRuntime.jsxs)("div", {
        children: [(0, _jsxRuntime.jsxs)("div", {
          className: "period-option " + sel ? "selected" : "",
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
  var [name, setName] = useState("");
  var [total, setTotal] = useState(30);
  var [schedules, setSchedules] = useState([]);
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: function(e){ if(e.target===e.currentTarget) onClose(); },
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
  var todayStr = new Date().toISOString().slice(0, 10);
  var [date, setDate] = useState(todayStr);
  var [hospital, setHospital] = useState("");
  var [doctor, setDoctor] = useState("");
  var [note, setNote] = useState("");
  // continuedIds: set of med ids the user checks as "still taking"
  var [continuedIds, setContinuedIds] = useState(new Set(medications.map(function(m){ return m.id; })));
  var [newMeds, setNewMeds] = useState([]);
  function toggleContinue(id) {
    setContinuedIds(prev => {
      var s = new Set(prev);
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
    setNewMeds(prev => prev.filter(function(m){ return m._key !== key; }));
  }

  // Compute which will be stopped = active meds NOT in continuedIds
  var stoppedIds = medications.filter(function(m){ return !continuedIds.has(m.id); }).map(function(m){ return m.id; });
  function save() {
    onSave({
      date,
      hospital,
      doctor,
      note,
      continuedIds: (continuedIds).slice(),
      stoppedIds,
      newMeds: newMeds.filter(function(m){ return m.name && m.name.trim(); }).map(function(nm){ return { id:nm.id, name:nm.name, schedules:nm.schedules, totalCount:nm.totalCount }; })
    });
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: function(e){ if(e.target===e.currentTarget) onClose(); },
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
              var checked = continuedIds.has(med.id);
              var dailyDose = (med.schedules || []).reduce((s, sc) => s + sc.dose, 0);
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
                  className: "cb-box " + checked ? "checked" : "",
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
            children: ["\u26A0 \u4EE5\u4E0B\u85E5\u7269\u5C07\u81EA\u52D5\u505C\u85E5\uFF1A", stoppedIds.map(function(id){ var found = medications.find(function(m){ return m.id === id; }); return found ? found.name : id; }).join("、")]
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
  var hr = state.settings && state.settings.dayResetHour || 4;
  var reminderTimes = state.settings && state.settings.reminderTimes || [];
  function addReminderTime() {
    var t = "08:00";
    update(s => {
      s.settings.reminderTimes = [...(s.settings.reminderTimes || []), t];
    });
  }
  function updateReminderTime(idx, val) {
    update(s => {
      var arr = [...(s.settings.reminderTimes || [])];
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
    onClick: function(e){ if(e.target===e.currentTarget) onClose(); },
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
  var u = state.currentUser;
  function logout() {
    var sb = getSupabase();
    if (sb) { sb.auth.signOut().catch(function(e){ console.warn('[PairCare] signOut:', e); }); }
    try { localStorage.removeItem(STORAGE_KEY + "_user"); } catch(e) {}
    try { localStorage.removeItem("peiYike_sb_session"); } catch(e) {}
    update(function(s) { s.user = null; });
    onClose();
  }
  function resetAll() {
    if (!window.confirm("⚠️ 確定清除所有資料？此操作無法還原。")) return;
    [STORAGE_KEY, STORAGE_KEY + "_user", "peiYike_v2", "peiYike_v1"].forEach(function(k){ localStorage.removeItem(k); });
    window.location.reload();
  }
  return (0, _jsxRuntime.jsx)("div", {
    className: "modal-overlay",
    onClick: function(e){ if(e.target===e.currentTarget) onClose(); },
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
        }), (0, _jsxRuntime.jsx)(PairStatusBlock, {
          state: state,
          update: update,
          showToast: showToast
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
// window.App already assigned above

// Explicit global exports — required for index.html mount
if (typeof App !== "undefined") window.App = App;
if (typeof ErrorBoundary !== "undefined") window.ErrorBoundary = ErrorBoundary;
console.log('[PairCare] mounted v7', typeof window.App, typeof window.ErrorBoundary);
