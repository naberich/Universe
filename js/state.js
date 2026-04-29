// state.js — 状态管理 + 通用错误处理
// 依赖 data.js（window.AppData）。data.js 异步加载 data.json，
// 本文件在 `appdata-ready` 事件触发后才真正初始化。

function __initUniverseState() {
  if (window.__UniverseStateInited) return;
  window.__UniverseStateInited = true;

const { sources, categories, builtinEvents, aggregates, mosaicOrder } = window.AppData || {};
if (!categories) {
  console.error("[state.js] window.AppData not loaded; abort.");
  return;
}

// ================= 全局错误处理 =================
window.addEventListener("error", (e) => {
  console.error("[Universe] uncaught error:", e.message, e.filename, e.lineno);
  try { showToast && showToast("界面出了点问题，已记录到控制台"); } catch {}
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Universe] unhandled promise:", e.reason);
});

// localStorage 安全封装（禁用或配额超时都不崩）
const safeStorage = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      if (v == null) return fallback;
      return JSON.parse(v);
    } catch (e) {
      console.warn(`[storage] get ${k} failed:`, e.message);
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      console.warn(`[storage] set ${k} failed:`, e.message);
      try { showToast && showToast("本地存储失败，设置未保存"); } catch {}
      return false;
    }
  },
  remove(k) {
    try { localStorage.removeItem(k); } catch {}
  }
};

// fetch 包装：带超时 + 重试 + 429 退避
async function safeFetch(url, opts = {}) {
  const { timeout = 15000, retries = 2, ...rest } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        const wait = Math.min(2000 * (attempt + 1), 8000);
        console.warn(`[fetch] 429 rate limited, wait ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e.name === "AbortError") console.warn(`[fetch] timeout after ${timeout}ms: ${url}`);
      else console.warn(`[fetch] attempt ${attempt+1} failed:`, e.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("fetch failed");
}

// 通知 API 安全包装
function safeNotify(title, body, tag) {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, tag });
    return true;
  } catch (e) {
    console.warn("[notify] failed:", e.message);
    return false;
  }
}

// ================= 自建事件 =================
const CUSTOM_EVENTS_KEY = "universe_custom_events_v1";
let customEvents = safeStorage.get(CUSTOM_EVENTS_KEY, {});

// 合并事件库
const events = {};
function rebuildEvents() {
  for (const k of Object.keys(events)) delete events[k];
  Object.assign(events, builtinEvents, customEvents);
}
rebuildEvents();

function saveCustomEvents() {
  return safeStorage.set(CUSTOM_EVENTS_KEY, customEvents);
}
function isCustomEvent(id) { return !!customEvents[id]; }

// ================= 已读状态 =================
const READ_KEY = "universe_read_v1";
let readState = safeStorage.get(READ_KEY, { news: {}, events: {} });
if (!readState.news) readState.news = {};
if (!readState.events) readState.events = {};

function saveReadState() { return safeStorage.set(READ_KEY, readState); }
function markNewsRead(catId, i) {
  const key = `${catId}#${i}`;
  if (!readState.news[key]) {
    readState.news[key] = Date.now();
    saveReadState();
    if (typeof updateBellBadge === "function") updateBellBadge();
  }
}
function markEventRead(id) {
  if (!readState.events[id]) {
    readState.events[id] = Date.now();
    saveReadState();
  }
}
function isNewsRead(catId, i) { return !!readState.news[`${catId}#${i}`]; }
function isEventRead(id) { return !!readState.events[id]; }
function unreadCount(cat) {
  let n = 0;
  cat.news.forEach((_, i) => { if (!isNewsRead(cat.id, i)) n++; });
  return n;
}

// ================= 通知设置 =================
const NOTIF_KEY = "universe_notif_v2";
let notifSettings = (() => {
  const cur = safeStorage.get(NOTIF_KEY, null);
  if (cur && Array.isArray(cur.times)) return cur;
  const old = safeStorage.get("universe_notif_v1", null);
  if (old && old.time) return { times: [old.time, ""], email: old.email || "", lastSent: {} };
  return { times: ["09:00", ""], email: "", lastSent: {} };
})();
function saveNotifPersist() { return safeStorage.set(NOTIF_KEY, notifSettings); }

// ================= 日期 / 粒度 =================
let currentDate = new Date();
let currentGranularity = "day";

function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function toISODate(d = currentDate) {
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function formatDate(d = currentDate) {
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const w = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
  return `${d.getFullYear()} · ${m} · ${day} · ${w}`;
}
function formatByGranularity(d = currentDate, g = currentGranularity) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const w = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
  if (g === "day")   return `${y} · ${m} · ${day} · ${w}`;
  if (g === "week")  { const iw = getISOWeek(d); return `${iw.year} · W${String(iw.week).padStart(2,"0")}`; }
  if (g === "month") return `${y} · ${m}`;
  if (g === "quarter") return `${y} · Q${Math.floor(d.getMonth()/3)+1}`;
  if (g === "year")  return `${y}`;
  return formatDate(d);
}
function isCurrentPeriod(d = currentDate) {
  const t = new Date();
  const g = currentGranularity;
  if (g === "day")    return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
  if (g === "week")   { const a=getISOWeek(d), b=getISOWeek(t); return a.year===b.year && a.week===b.week; }
  if (g === "month")  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth();
  if (g === "quarter")return d.getFullYear()===t.getFullYear() && Math.floor(d.getMonth()/3)===Math.floor(t.getMonth()/3);
  if (g === "year")   return d.getFullYear()===t.getFullYear();
  return false;
}

// Period key / 聚合数据变体
function getPeriodKey(d = currentDate, g = currentGranularity) {
  const y = d.getFullYear();
  if (g === "year")    return `${y}`;
  if (g === "quarter") return `${y}-Q${Math.floor(d.getMonth()/3)+1}`;
  if (g === "month")   return `${y}-${String(d.getMonth()+1).padStart(2,"0")}`;
  if (g === "week")    { const iw = getISOWeek(d); return `${iw.year}-W${String(iw.week).padStart(2,"0")}`; }
  return `${y}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seedRand(seed) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507); s = Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}
function variateAggregate(baseAgg, seed) {
  if (!baseAgg) return baseAgg;
  const r = seedRand(seed);
  const jitter = (v, pct = 0.25) => {
    if (typeof v !== "string") return v;
    return v.replace(/-?\d+(\.\d+)?/, (m) => {
      const num = Number(m);
      const delta = (r() * 2 - 1) * pct;
      let out = num * (1 + delta);
      out = Math.abs(num) >= 10 ? Math.round(out) : (Math.round(out * 10) / 10);
      return String(out);
    });
  };
  return {
    recap: baseAgg.recap,
    numbers: baseAgg.numbers.map(k => ({ n: jitter(k.n), l: k.l })),
    chart: {
      type: baseAgg.chart.type,
      labels: baseAgg.chart.labels.slice(),
      unit: baseAgg.chart.unit,
      data: baseAgg.chart.data.map(v => {
        const delta = (r() * 2 - 1) * 0.35;
        return Math.round(v * (1 + delta) * 10) / 10;
      })
    },
    milestones: baseAgg.milestones.slice()
  };
}
function getAggregate(catId, g, periodKey) {
  const base = aggregates[catId] && aggregates[catId][g];
  if (!base) return null;
  if (!periodKey) return base;
  if (periodKey === getPeriodKey()) return base;
  return variateAggregate(base, hashStr(`${catId}|${g}|${periodKey}`));
}

// ================= 视图栈 =================
const viewStack = [];
function pushViewHistory(entry) {
  const last = viewStack[viewStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(entry)) return;
  viewStack.push(entry);
  if (viewStack.length > 20) viewStack.shift();
}
function goBack() {
  viewStack.pop();
  const prev = viewStack.pop();
  if (!prev) { switchView("dashboard"); return; }
  applyView(prev);
}
function applyView(entry) {
  if (!entry) return;
  switch (entry.type) {
    case "dashboard": switchView("dashboard"); break;
    case "events": switchView("events"); break;
    case "category": showCategory(entry.id); break;
    case "news": showNews(entry.catId, entry.i); break;
    case "event": showEvent(entry.id); break;
    case "aggregate": showAggregate(entry.catId, entry.g, entry.periodKey); break;
  }
}

function syncBodyViewClass() {
  const active = document.querySelector(".view.active");
  const newCls = document.body.className.replace(/\bview-\S+/g, "").trim();
  document.body.className = newCls + (active ? " " + active.id : "");
}

// ================= 搜索（匹配/高亮/本地检索） =================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function buildMatchRegex(kw) {
  const q = String(kw || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isAscii = /^[\x00-\x7F]+$/.test(q);
  try {
    return isAscii
      ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i')
      : new RegExp(escaped, 'i');
  } catch (e) {
    console.warn("[search] invalid regex:", e.message);
    return null;
  }
}
function highlight(text, kw) {
  const t = escapeHtml(text);
  if (!kw) return t;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isAscii = /^[\x00-\x7F]+$/.test(kw);
  try {
    const re = isAscii
      ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi')
      : new RegExp(escaped, 'gi');
    return t.replace(re, m => `<span class="sr-highlight">${m}</span>`);
  } catch { return t; }
}
function searchLocal(kw) {
  const re = buildMatchRegex(kw);
  if (!re) return { news: [], events: [], articles: [] };
  const newsHits = [];
  for (const cat of Object.values(categories)) {
    cat.news.forEach((n, i) => {
      const hay = n.title + " " + n.summary + " " + n.tags.join(" ");
      if (re.test(hay)) newsHits.push({ cat, n, i });
    });
  }
  const articleHits = [];
  for (const cat of Object.values(categories)) {
    cat.coreArticles.forEach(a => {
      if (re.test(a.title + " " + a.src)) articleHits.push({ cat, a });
    });
  }
  const eventHits = Object.values(events).filter(e => {
    const hay = e.name + " " + e.desc + " " + e.timeline.map(t => t.title + " " + t.desc).join(" ");
    return re.test(hay);
  });
  return { news: newsHits, events: eventHits, articles: articleHits };
}
function fakeAIWebAnswer(kw) {
  return {
    title: `关于「${kw}」的综合解读`,
    body: `我们在现有看板中没有直接匹配到「${escapeHtml(kw)}」。基于公开网络信息的快速整合：\n\n这是一个正在演进的议题，当前处于初期讨论阶段，主流媒体（Reuters、FT、The Verge 等）与专业社区（Arxiv、HuggingFace 等）均有涉及。短期来看，市场反应平稳；中期值得关注的是它与 AI 应用落地、中美科技竞争、以及 B 端商业化路径之间的交叉影响。\n\n建议你将其加入「Events」长期追踪，或在后续版本接入真实数据源后自动聚合进相关板块。`,
    refs: [
      "Reuters · 2026-04 · 行业综述",
      "The Verge · 2026-04 · 技术视角",
      "Foreign Affairs · 2026-03 · 政策评论",
      "Arxiv · 2026-04 · 相关研究"
    ]
  };
}

// ================= 实体识别 / 聚类推荐 =================
function extractEntities(text) {
  if (!text) return [];
  const out = new Set();
  (text.match(/[一-龥]{2,6}/g) || []).forEach(w => { if (w.length >= 2) out.add(w); });
  (text.match(/\b[A-Z][A-Za-z0-9]+(?:[ -][A-Z][A-Za-z0-9]+)*\b/g) || []).forEach(w => out.add(w));
  (text.match(/\b\d+(?:\.\d+)+\b/g) || []).forEach(w => out.add(w));
  return Array.from(out).filter(w => !/^(The|And|For|With|To|Of|In|On|At|By|Is|Are|Was|Be)$/i.test(w));
}
function scoreEventMatch(news, event) {
  const newsText = `${news.title} ${news.summary || ""} ${(news.tags || []).join(" ")}`;
  const evtText = `${event.name} ${event.desc} ${event.timeline.map(t => t.title + " " + t.desc).join(" ")}`;
  const nEnt = extractEntities(newsText);
  const eEnt = extractEntities(evtText);
  if (!nEnt.length || !eEnt.length) return { score: 0, hits: 0, matched: [] };
  let hits = 0;
  const matched = [];
  for (const w of nEnt) {
    if (eEnt.some(e => e === w || (w.length >= 3 && (e.includes(w) || w.includes(e))))) {
      hits++; matched.push(w);
    }
  }
  return { score: hits / Math.max(nEnt.length, 1), hits, matched };
}
function suggestEvents(news, k = 3) {
  const excludeId = news.eventId;
  const scored = [];
  for (const e of Object.values(events)) {
    if (e.id === excludeId) continue;
    const r = scoreEventMatch(news, e);
    if (r.hits >= 1 && r.score > 0.05) scored.push({ event: e, ...r });
  }
  scored.sort((a, b) => b.hits - a.hits || b.score - a.score);
  return scored.slice(0, k);
}

// ================= 时间线预测 =================
function parseTLDate(s) {
  if (!s) return null;
  const nums = String(s).match(/\d+/g);
  if (!nums || nums.length < 1) return null;
  const y = nums[0].length === 4 ? +nums[0] : null;
  if (!y) return null;
  const m = nums[1] ? +nums[1] : 6;
  const d = nums[2] ? +nums[2] : 15;
  return new Date(y, Math.min(11, Math.max(0, m-1)), Math.min(28, Math.max(1, d)));
}
function predictNextMilestone(timeline) {
  const dates = timeline.map(t => parseTLDate(t.date)).filter(Boolean);
  if (dates.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push(dates[i] - dates[i-1]);
  gaps.sort((a,b) => a-b);
  const median = gaps[Math.floor(gaps.length/2)];
  if (!median || median < 1000*60*60*24) return null;
  const last = dates[dates.length - 1];
  const next = new Date(last.getTime() + median);
  const avgDays = Math.round(median / (1000*60*60*24));
  const monthName = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"][next.getMonth()];
  const label = `${next.getFullYear()} · ${String(next.getMonth()+1).padStart(2,"0")}`;
  let rhythm;
  if (avgDays >= 60) rhythm = `历史平均每 ${Math.round(avgDays/30)} 个月一个里程碑`;
  else if (avgDays >= 14) rhythm = `历史平均每 ${Math.round(avgDays/7)} 周一个里程碑`;
  else rhythm = `历史平均每 ${avgDays} 天一个里程碑`;
  return { label, month: monthName, rhythm, date: next };
}

// ================= ID 工具 =================
function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "custom";
}
function genEventId(name) {
  const base = "custom_" + slugify(name);
  if (!(base in events)) return base;
  let i = 2;
  while ((base + "_" + i) in events) i++;
  return base + "_" + i;
}
function todayLabel() {
  const d = new Date();
  return `${d.getFullYear()} · ${String(d.getMonth()+1).padStart(2,"0")} · ${String(d.getDate()).padStart(2,"0")}`;
}

// ================= 对外暴露 =================
Object.assign(window, {
  // 数据引用
  sources, categories, builtinEvents, aggregates, mosaicOrder,
  // 状态
  customEvents, events, readState, notifSettings, viewStack,
  currentDate, currentGranularity,
  // 访问 & mutation：由 render.js 通过 set* 更新
  setCurrentDate: (d) => { currentDate = d; },
  setCurrentGranularity: (g) => { currentGranularity = g; },
  getCurrentDate: () => currentDate,
  getCurrentGranularity: () => currentGranularity,
  // 工具
  safeStorage, safeFetch, safeNotify,
  rebuildEvents, saveCustomEvents, isCustomEvent,
  saveReadState, markNewsRead, markEventRead, isNewsRead, isEventRead, unreadCount,
  saveNotifPersist,
  getISOWeek, toISODate, formatDate, formatByGranularity, isCurrentPeriod,
  getPeriodKey, getAggregate,
  pushViewHistory, goBack, applyView, syncBodyViewClass,
  escapeHtml, buildMatchRegex, highlight, searchLocal, fakeAIWebAnswer,
  extractEntities, scoreEventMatch, suggestEvents,
  parseTLDate, predictNextMilestone,
  slugify, genEventId, todayLabel
});

}

// 等待 data.js 把 JSON 加载好再 init；如果已经就绪则立刻 init
if (window.AppDataReady) {
  __initUniverseState();
} else {
  window.addEventListener("appdata-ready", __initUniverseState, { once: true });
}

