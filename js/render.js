// render.js — 渲染与 UI 交互
// 依赖 state.js

// 声明一个本地的代理访问，实际值存在 state.js 闭包里
// 所有读写都通过 window.getCurrentDate / setCurrentDate 等函数

// ================= 渲染 =================


function refreshDateUI() {
  document.getElementById("date-text").textContent = formatByGranularity();
  document.getElementById("date-input").value = toISODate();
}

// 日期选择
function toggleDatePop(e) {
  e.stopPropagation();
  document.getElementById("date-pop").classList.toggle("open");
}
function onDateChange(v) {
  if (!v) return;
  setCurrentDate(new Date(v + "T00:00:00"));
  afterDateChange();
}
function quickDate(offset, el) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  setCurrentDate(d);
  afterDateChange();
}


function setGranularity(g) {
  setCurrentGranularity(g);
  document.querySelectorAll(".gran-btn").forEach(b => b.classList.toggle("active", b.dataset.gran === g));
  document.body.classList.toggle("gran-agg", g !== "day");
  const dayMode = document.getElementById("day-mode");
  const list = document.getElementById("period-list");
  if (g === "day") {
    dayMode.style.display = "";
    list.style.display = "none";
  } else {
    dayMode.style.display = "none";
    list.style.display = "";
    list.innerHTML = buildPeriodList(g);
  }
  // 切粒度后立即反映到顶部 chip 和卡片
  refreshDateUI();
  renderMosaic();
  updateHistoryBanner();
}

function buildPeriodList(g) {
  const t = new Date();
  const items = [];
  if (g === "week") {
    // 过去 12 周
    for (let i = 0; i < 12; i++) {
      const d = new Date(t); d.setDate(d.getDate() - i*7);
      const iw = getISOWeek(d);
      const label = `${iw.year} · W${String(iw.week).padStart(2,"0")}`;
      const sunday = new Date(d); sunday.setDate(d.getDate() - d.getDay());
      const satur  = new Date(sunday); satur.setDate(sunday.getDate() + 6);
      const hint = `${String(sunday.getMonth()+1).padStart(2,"0")}/${String(sunday.getDate()).padStart(2,"0")} – ${String(satur.getMonth()+1).padStart(2,"0")}/${String(satur.getDate()).padStart(2,"0")}`;
      items.push({ label, hint, iso: toISODateOf(d), current: i === 0 });
    }
  } else if (g === "month") {
    for (let i = 0; i < 12; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const label = `${d.getFullYear()} · ${String(d.getMonth()+1).padStart(2,"0")}`;
      const hint  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
      items.push({ label, hint, iso: toISODateOf(d), current: i === 0 });
    }
  } else if (g === "quarter") {
    for (let i = 0; i < 8; i++) {
      const m = t.getMonth() - i*3;
      const d = new Date(t.getFullYear(), m, 1);
      const q = Math.floor(d.getMonth()/3)+1;
      items.push({ label: `${d.getFullYear()} · Q${q}`, hint: `Quarter ${q}`, iso: toISODateOf(d), current: i === 0 });
    }
  } else if (g === "year") {
    for (let i = 0; i < 8; i++) {
      const y = t.getFullYear() - i;
      items.push({ label: `${y}`, hint: "Full year", iso: `${y}-01-01`, current: i === 0 });
    }
  }
  return items.map(it => `
    <div class="period-item ${it.current ? 'current' : ''}" onclick='pickPeriod("${it.iso}")'>
      <span>${it.label}</span>
      <span class="period-hint">${it.hint}</span>
    </div>
  `).join("");
}

function toISODateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function pickPeriod(iso) {
  setCurrentDate(new Date(iso + "T00:00:00"));
  afterDateChange();
}

function updateHistoryBanner() {
  const banner = document.getElementById("history-banner");
  if (!isCurrentPeriod()) {
    const label = formatByGranularity();
    if (!banner) {
      const b = document.createElement("div");
      b.id = "history-banner";
      b.className = "history-banner";
      b.innerHTML = `<span>◷ 正在查看 <b>${label}</b> 的历史快照</span><span class="back-today" onclick="backToNow()">回到当前</span>`;
      document.getElementById("view-dashboard").prepend(b);
    } else {
      banner.querySelector("b").textContent = label;
    }
  } else if (banner) {
    banner.remove();
  }
}

function backToNow() {
  setCurrentDate(new Date());
  afterDateChange();
}

function afterDateChange() {
  refreshDateUI();
  updateHistoryBanner();
  document.getElementById("date-pop").classList.remove("open");
  switchView("dashboard");
  renderMosaic();
}

function renderMosaic() {
  const wrap = document.getElementById("mosaic");
  wrap.innerHTML = mosaicOrder.map(id => renderCard(categories[id])).join("");
}

function renderCard(cat) {
  const g = getCurrentGranularity();
  if (g && g !== "day") {
    return renderAggregateCard(cat, g);
  }
  return `
    <div class="card ${cat.slot}" onclick="showCategory('${cat.id}')">
      <button class="card-share" title="分享此板块" onclick='event.stopPropagation(); openShareCard("brief","${cat.id}")'>↗</button>
      <div class="c-head">
        <span class="c-badge"><span class="dot"></span>${cat.code}</span>
        <span class="c-meta">${cat.updated}</span>
      </div>
      <div class="c-title">${cat.name}</div>
      <div class="c-sub">${cat.nameCN}</div>
      <div class="c-summary">${cat.summary}</div>
      <ul class="c-articles c-articles-lite">
        ${cat.coreArticles.slice(0, 3).map(a => `
          <li class="c-art">
            <span class="c-art-text">${a.title}</span>
          </li>
        `).join("")}
      </ul>
      <div class="c-foot">
        <span class="c-foot-left">${cat.news.length} ENTRIES</span>
        <span class="c-foot-cta">Explore <span class="arrow">→</span></span>
      </div>
    </div>
  `;
}

// 根据当前日期 + 粒度生成稳定的 periodKey

function renderAggregateCard(cat, g) {
  const periodKey = getPeriodKey();
  const agg = getAggregate(cat.id, g, periodKey);
  const label = { week:"WEEK", month:"MONTH", quarter:"QUARTER", year:"YEAR" }[g];
  if (!agg) {
    return `
      <div class="card ${cat.slot}">
        <div class="c-head">
          <span class="c-badge"><span class="dot"></span>${cat.code}</span>
          <span class="c-meta">${label} VIEW</span>
        </div>
        <div class="c-title">${cat.name}</div>
        <div class="c-sub">${cat.nameCN}</div>
        <div class="c-summary" style="color:var(--ink-muted);">暂无聚合数据</div>
      </div>
    `;
  }
  return `
    <div class="card ${cat.slot}" onclick="showAggregate('${cat.id}','${g}','${periodKey}')">
      <button class="card-share" title="分享此板块" onclick='event.stopPropagation(); openShareCard("brief","${cat.id}")'>↗</button>
      <div class="c-head">
        <span class="c-badge"><span class="dot"></span>${cat.code}</span>
        <span class="c-meta">${label} · ${formatByGranularity()}</span>
      </div>
      <div class="c-title">${cat.name}</div>
      <div class="c-sub">${cat.nameCN}</div>

      <div class="agg-recap">${agg.recap}</div>

      <div class="agg-nums">
        ${agg.numbers.map(k => `
          <div class="agg-num">
            <div class="n">${k.n}</div>
            <div class="l">${k.l}</div>
          </div>
        `).join("")}
      </div>

      <div class="agg-chart">
        ${renderSemanticChart(cat.id, g, agg)}
      </div>

      <div class="agg-tl">
        ${agg.milestones.map(m => `
          <div class="agg-tl-item">
            <span class="agg-tl-date">${m.date}</span>
            <span class="agg-tl-body">
              <b>${m.title}</b><span class="desc">${m.desc}</span>
              ${m.tag ? `<span class="agg-tl-tag">${m.tag}</span>` : ""}
            </span>
          </div>
        `).join("")}
      </div>

      <div class="c-foot">
        <span class="c-foot-left">${label} AGGREGATED</span>
        <span class="c-foot-cta">Detail <span class="arrow">→</span></span>
      </div>
    </div>
  `;
}

// 语义图表 - 每板块专属
function renderSemanticChart(catId, g, agg) {
  const color = getAccent(catId);
  if (catId === "stock")  return chartStockCandle(g, color);
  if (catId === "tech")   return chartTechRelease(g, color);
  if (catId === "ai")     return chartAIFunding(g, color);
  if (catId === "intl")   return chartIntlTension(g, color);
  if (catId === "cn")     return chartCNPolicy(g, color);
  if (catId === "study")  return chartStudyTopic(g, color);
  return renderMiniChart(agg.chart, catId);
}

// 股票：涨跌柱（红绿分明）
function chartStockCandle(g, color) {
  const data = g === "week" ? [-0.8, 1.2, 0.6, -0.3, 1.24]
    : g === "month" ? [0.5, 1.8, -0.6, 1.2]
    : g === "quarter" ? [3.1, -1.5, 5.2]
    : [8.5, -2.1, 6.3, 5.2];
  const labels = g === "week" ? ["周一","周二","周三","周四","周五"]
    : g === "month" ? ["W1","W2","W3","W4"]
    : g === "quarter" ? ["1月","2月","3月"]
    : ["Q1","Q2","Q3","Q4"];
  const label = g === "year" ? "全年各季度涨跌幅 %" : g === "quarter" ? "季度月度涨跌 %" : "上证涨跌幅 %";
  return semBarChart(data, labels, label, "#14b8a6", "#ef4444", true);
}

// 科技：新品发布数柱
function chartTechRelease(g, color) {
  const data = g === "week" ? [3,5,4,6,8,5,4]
    : g === "month" ? [12, 15, 10, 11]
    : g === "quarter" ? [42, 38, 50]
    : [120, 140, 130, 130];
  const labels = g === "week" ? ["一","二","三","四","五","六","日"]
    : g === "month" ? ["W1","W2","W3","W4"]
    : g === "quarter" ? ["1月","2月","3月"]
    : ["Q1","Q2","Q3","Q4"];
  return semBarChart(data, labels, "新品发布数", color);
}

// AI：融资金额（美元）面积
function chartAIFunding(g, color) {
  const data = g === "week" ? [120, 80, 200, 180, 240, 60, 40]
    : g === "month" ? [800, 950, 720, 820]
    : g === "quarter" ? [2800, 3100, 3500]
    : [9500, 11000, 14000, 12500];
  const labels = g === "week" ? ["一","二","三","四","五","六","日"]
    : g === "month" ? ["W1","W2","W3","W4"]
    : g === "quarter" ? ["1月","2月","3月"]
    : ["Q1","Q2","Q3","Q4"];
  const unit = data[0] > 1000 ? "(M$)" : "(M$)";
  return semAreaChart(data, labels, "Agent 赛道融资 " + unit, color);
}

// 国际政治：事件占比（堆叠条）
function chartIntlTension(g, color) {
  const segs = [
    { name: "协议/缓和", val: 3, color: "#14b8a6" },
    { name: "摩擦/制裁", val: 2, color: "#f59e0b" },
    { name: "谈判进行",  val: 4, color: color },
    { name: "国际组织",  val: 2, color: "#60a5fa" }
  ];
  return semStackedBar(segs, "本期事件类型分布 (条数)");
}

// 中国：政策热度仪表（水平条）
function chartCNPolicy(g, color) {
  const items = [
    { name: "宏观政策", val: 85 },
    { name: "国企改革", val: 72 },
    { name: "消费扩容", val: 90 },
    { name: "货币政策", val: 66 },
    { name: "社会舆论", val: 78 }
  ];
  return semHBar(items, "政策关注度（0-100）", color);
}

// 学习：话题方向环形（donut）
function chartStudyTopic(g, color) {
  const slices = [
    { name: "产品",   val: 32, color: "#667eea" },
    { name: "UX",     val: 24, color: "#60a5fa" },
    { name: "硬件",   val: 18, color: "#f59e0b" },
    { name: "用研",   val: 15, color: "#14b8a6" },
    { name: "商业",   val: 11, color: "#d4475e" }
  ];
  return semDonut(slices, "学习方向占比 %");
}

// -------- 通用语义图表绘制 --------
function semBarChart(data, labels, title, posColor, negColor, diverging = false) {
  const W = 280, H = 90, P = 18;
  const max = Math.max(...data, 0);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const zeroY = H - P - (diverging ? ((0 - min) / range) * (H - P*2) : 0);
  const step = (W - P) / data.length;
  const bw = step * 0.62;
  const y = v => H - P - ((v - (diverging ? min : 0)) / range) * (H - P*2);
  const bars = data.map((v, i) => {
    const x = P/2 + i*step + (step - bw)/2;
    const barTop = Math.min(y(v), zeroY);
    const barH = Math.max(Math.abs(y(v) - zeroY), 2);
    const fill = (diverging && v < 0) ? (negColor || "#ef4444") : posColor;
    return `<rect x="${x}" y="${barTop}" width="${bw}" height="${barH}" rx="3" fill="${fill}" opacity="0.9">
      <title>${labels[i]}: ${v}</title></rect>`;
  }).join("");
  const lbls = labels.map((l, i) => {
    const x = P/2 + i*step + step/2;
    return `<text x="${x}" y="${H-4}" font-family="JetBrains Mono" font-size="8.5" fill="#848890" text-anchor="middle">${l}</text>`;
  }).join("");
  const vals = data.map((v, i) => {
    const x = P/2 + i*step + step/2;
    const yy = (diverging && v < 0) ? y(v) + 9 : y(v) - 3;
    return `<text x="${x}" y="${yy}" font-family="JetBrains Mono" font-size="9" font-weight="600" fill="#1a1d21" text-anchor="middle">${v}</text>`;
  }).join("");
  return svgWrap(W, H, `${bars}${vals}${lbls}`, title);
}

function semAreaChart(data, labels, title, color) {
  const W = 280, H = 90, P = 18;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = (W - P) / (data.length - 1 || 1);
  const y = v => H - P - ((v - min) / range) * (H - P*2);
  const pts = data.map((v, i) => `${P/2 + i*step},${y(v)}`);
  const area = `M ${P/2},${H-P} L ${pts.join(' L ')} L ${P/2 + (data.length-1)*step},${H-P} Z`;
  const poly = pts.join(' ');
  const dots = data.map((v, i) => {
    const x = P/2 + i*step;
    return `<circle cx="${x}" cy="${y(v)}" r="3" fill="#fff" stroke="${color}" stroke-width="2"><title>${labels[i]}: ${v}</title></circle>
      <text x="${x}" y="${y(v)-8}" font-family="JetBrains Mono" font-size="9" font-weight="600" fill="#1a1d21" text-anchor="middle">${v}</text>`;
  }).join("");
  const lbls = labels.map((l, i) => {
    const x = P/2 + i*step;
    return `<text x="${x}" y="${H-4}" font-family="JetBrains Mono" font-size="8.5" fill="#848890" text-anchor="middle">${l}</text>`;
  }).join("");
  return svgWrap(W, H, `
    <defs><linearGradient id="ga-${Math.random().toString(36).slice(2,6)}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="${color}" opacity="0.15"/>
    <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${lbls}`, title);
}

function semStackedBar(segs, title) {
  const W = 280, H = 90, P = 18;
  const total = segs.reduce((s, x) => s + x.val, 0);
  const barY = 30;
  const barH = 18;
  let x = P/2;
  const barW = W - P;
  const rects = segs.map(s => {
    const w = (s.val / total) * barW;
    const r = `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${s.color}" opacity="0.9"><title>${s.name}: ${s.val}</title></rect>`;
    x += w;
    return r;
  }).join("");
  // legend
  let lx = P/2;
  const legends = segs.map(s => {
    const item = `<g transform="translate(${lx},${barY + barH + 14})">
      <rect width="10" height="10" fill="${s.color}" rx="2"/>
      <text x="14" y="9" font-family="Inter" font-size="10" fill="#1a1d21">${s.name} ${s.val}</text>
    </g>`;
    lx += 58;
    return item;
  }).join("");
  return svgWrap(W, H, `${rects}${legends}`, title);
}

function semHBar(items, title, color) {
  const W = 280, H = 108, P = 6;
  const rowH = (H - 10) / items.length;
  const labelW = 58;
  const barMaxW = W - labelW - 36;
  const rows = items.map((it, i) => {
    const y = 2 + i*rowH;
    const w = (it.val / 100) * barMaxW;
    return `
      <text x="0" y="${y + rowH/2 + 3}" font-family="Inter" font-size="10.5" fill="#4a4f56">${it.name}</text>
      <rect x="${labelW}" y="${y + rowH/2 - 4}" width="${barMaxW}" height="8" rx="4" fill="rgba(26,29,33,0.08)"/>
      <rect x="${labelW}" y="${y + rowH/2 - 4}" width="${w}" height="8" rx="4" fill="${color}" opacity="0.85"><title>${it.name}: ${it.val}</title></rect>
      <text x="${W - 2}" y="${y + rowH/2 + 3}" font-family="JetBrains Mono" font-size="10" font-weight="600" fill="#1a1d21" text-anchor="end">${it.val}</text>
    `;
  }).join("");
  return svgWrap(W, H, rows, title);
}

function semDonut(slices, title) {
  const W = 280, H = 108;
  const cx = 54, cy = H/2, R = 40, r = 24;
  const total = slices.reduce((s, x) => s + x.val, 0);
  let angle = -Math.PI / 2;
  const arcs = slices.map(s => {
    const portion = s.val / total;
    const a2 = angle + portion * Math.PI * 2;
    const large = portion > 0.5 ? 1 : 0;
    const x1 = cx + R*Math.cos(angle), y1 = cy + R*Math.sin(angle);
    const x2 = cx + R*Math.cos(a2), y2 = cy + R*Math.sin(a2);
    const x3 = cx + r*Math.cos(a2), y3 = cy + r*Math.sin(a2);
    const x4 = cx + r*Math.cos(angle), y4 = cy + r*Math.sin(angle);
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    angle = a2;
    return `<path d="${path}" fill="${s.color}" opacity="0.92"><title>${s.name}: ${s.val}%</title></path>`;
  }).join("");
  let ly = 10;
  const legends = slices.map(s => {
    const item = `<g transform="translate(${cx+R+20}, ${ly})">
      <rect width="9" height="9" fill="${s.color}" rx="2"/>
      <text x="14" y="8.5" font-family="Inter" font-size="10.5" fill="#1a1d21">${s.name}</text>
      <text x="${W - cx - R - 22}" y="8.5" font-family="JetBrains Mono" font-size="10" font-weight="600" fill="#4a4f56" text-anchor="end">${s.val}%</text>
    </g>`;
    ly += 18;
    return item;
  }).join("");
  return svgWrap(W, H, `${arcs}${legends}`, title);
}

function svgWrap(W, H, inner, title) {
  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:${H+2}px;">
      ${inner}
    </svg>
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-muted);letter-spacing:1px;margin-top:4px;text-align:center;">${title || ''}</div>
  `;
}

// 旧的 renderMiniChart 保留作为兜底
function renderMiniChart(chart, catId) {
  const W = 280, H = 70, P = 6;
  const color = { tech:"#667eea", ai:"#8b5cf6", intl:"#ec4899", cn:"#f59e0b", stock:"#14b8a6", study:"#60a5fa" }[catId] || "#667eea";
  const vals = chart.data.map(Number);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const range = (max - min) || 1;
  const n = vals.length;
  const step = (W - P*2) / (n - (chart.type==="bar" ? 0 : 1));
  const y = v => H - P - ((v - min) / range) * (H - P*2);

  if (chart.type === "bar") {
    const bw = step * 0.6;
    const zeroY = y(0);
    const bars = vals.map((v, i) => {
      const x = P + i*step + (step - bw)/2;
      const top = Math.min(y(v), zeroY);
      const bh = Math.abs(y(v) - zeroY);
      return `<rect x="${x}" y="${top}" width="${bw}" height="${Math.max(bh,1.5)}" rx="2" fill="${color}" opacity="${v<0?0.4:0.85}"></rect>`;
    }).join("");
    const labels = chart.labels.map((l, i) => {
      const x = P + i*step + step/2;
      return `<text x="${x}" y="${H-0.5}" font-family="JetBrains Mono" font-size="8" fill="#9aa0ab" text-anchor="middle">${l}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}${labels}</svg>`;
  }

  // line
  const pts = vals.map((v, i) => `${P + i*step},${y(v)}`).join(" ");
  const area = `M ${P},${H-P} L ${pts.replace(/ /g,' L ')} L ${P + (n-1)*step},${H-P} Z`;
  const labels = chart.labels.map((l, i) => {
    const x = P + i*step;
    return `<text x="${x}" y="${H-0.5}" font-family="JetBrains Mono" font-size="8" fill="#9aa0ab" text-anchor="middle">${l}</text>`;
  }).join("");
  const dots = vals.map((v, i) => `<circle cx="${P + i*step}" cy="${y(v)}" r="2.5" fill="#fff" stroke="${color}" stroke-width="1.5"></circle>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="g-${catId}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#g-${catId})"></path>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"></polyline>
    ${dots}
    ${labels}
  </svg>`;
}

// 视图栈
const viewStack = [];

function switchView(which) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === which));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  if (which === "dashboard") {
    document.getElementById("view-dashboard").classList.add("active");
    pushViewHistory({ type: "dashboard" });
  } else if (which === "events") {
    renderEventsLibrary();
    document.getElementById("view-events").classList.add("active");
    pushViewHistory({ type: "events" });
  }
  syncBodyViewClass();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCategory(id) {
  const cat = categories[id];
  if (!cat) return;
  pushViewHistory({ type: "category", id });
  const v = document.getElementById("view-category");
  const allTags = Array.from(new Set(cat.news.flatMap(n => n.tags)));
  v.innerHTML = `
    <button class="back-btn" onclick="goBack()">← Back</button>
    <div class="detail-head">
      <div class="c-badge" style="margin-bottom: 12px;"><span class="dot" style="background:${getAccent(id)};"></span>${cat.code}</div>
      <div class="detail-title">${cat.name}</div>
      <div class="detail-sub">${cat.nameCN} · ${cat.updated} · ${cat.news.length} entries</div>
    </div>

    <div class="filter-bar">
      <span class="filter-label">Filter</span>
      <span class="chip active" onclick="filterNews('${id}', 'all', this)">All</span>
      ${allTags.map(t => `<span class="chip" onclick="filterNews('${id}','${t}',this)">${t}</span>`).join("")}
    </div>

    ${renderAIBrief(cat)}

    <div class="news-list" id="news-list-${id}">
      ${cat.news.map((n, i) => renderNewsItem(cat.id, n, i)).join("")}
    </div>

    <div class="sources-bar">
      <div class="sources-bar-label">SOURCES</div>
      <div class="sources-bar-text">${sources[cat.id]}</div>
    </div>
  `;
  document.querySelectorAll(".view").forEach(x => x.classList.remove("active"));
  v.classList.add("active");
  syncBodyViewClass();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getAccent(id) {
  return { tech:"#667eea", ai:"#8b5cf6", intl:"#ec4899", cn:"#f59e0b", stock:"#14b8a6", study:"#60a5fa" }[id] || "#667eea";
}

function renderAIBrief(cat) {
  const b = cat.aiBrief;
  // 向后兼容旧的字符串形式
  if (typeof b === "string") {
    return `<div class="ai-brief">
      <div class="ai-brief-tag"><span class="pulse"></span>AI Brief · 今日综合解读</div>
      <p>${b}</p>
    </div>`;
  }
  const heroClass = "hero-" + (b.heroImage || cat.id);
  const heroGlyph = { tech:"T", ai:"AI", intl:"G", cn:"中", stock:"$", study:"L" }[b.heroImage || cat.id] || "·";

  return `<div class="ai-brief">
    <div class="ai-brief-tag"><span class="pulse"></span>AI Brief · 今日综合解读</div>

    <div class="brief-hero ${heroClass}">
      <div class="hero-label">${cat.code}</div>
      <div class="hero-sub">${b.lead}</div>
      <div class="hero-glyph">${heroGlyph}</div>
    </div>

    ${b.keyNumbers && b.keyNumbers.length ? `
      <div class="brief-numbers">
        ${b.keyNumbers.map(k => `
          <div class="brief-num">
            <div class="n">${k.n}</div>
            <div class="l">${k.l}</div>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="brief-sections">
      ${b.sections.map(s => `
        <div class="brief-sec">
          <div class="brief-sec-h">${s.h}</div>
          <div class="brief-sec-p">${s.p}</div>
        </div>
      `).join("")}
    </div>

    ${b.relatedEvents && b.relatedEvents.length ? `
      <div class="related-events">
        <div class="related-events-title">◎ Related Events · 相关事件</div>
        <div class="related-events-list">
          ${b.relatedEvents.filter(id => events[id]).map(id => {
            const e = events[id];
            return `<span class="rel-evt" onclick="showEvent('${id}')">
              <span class="evt-dot"></span>${e.name}
              <span class="arr">→</span>
            </span>`;
          }).join("")}
        </div>
      </div>
    ` : ""}

    <div class="brief-actions">
      <div class="brief-actions-title">◎ Next Actions · 下一步</div>
      <div class="brief-actions-row">
        <button class="action-btn primary" onclick="scrollToEvents()">
          <span class="action-ico">⬇</span> 查看相关事件
        </button>
        <button class="action-btn" onclick='openEventModal("${cat.name} · ${cat.nameCN}", null)'>
          <span class="action-ico">◉</span> 创建监控
        </button>
        <button class="action-btn" onclick='openShareCard("brief","${cat.id}")'>
          <span class="action-ico">↗</span> 分享/导出
        </button>
      </div>
    </div>
  </div>`;
}

function scrollToEvents() {
  const target = document.querySelector(".related-events") || document.querySelector(".news-list");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderNewsItem(catId, n, i) {
  const hasEvent = n.eventId && events[n.eventId];
  const evt = hasEvent ? events[n.eventId] : null;
  const externalUrl = n.url || `https://www.google.com/search?q=${encodeURIComponent(n.title)}`;
  const read = isNewsRead(catId, i);
  return `
    <div class="news-item ${read ? 'is-read' : ''}" onclick="showNews('${catId}', ${i})">
      <div class="news-index">${read ? '✓' : String(i+1).padStart(2,"0")}</div>
      <div style="flex:1;">
        <div class="news-title">${n.title}</div>
        <div class="news-summary">${n.summary}</div>
        <div class="news-meta">
          <a class="news-source ext" href="${externalUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();">${n.source} ↗</a>
          <span>${n.time}</span>
          ${n.market ? `<span class="tag">${n.market}</span>` : ""}
          ${n.tags.map(t => `<span class="tag">${t}</span>`).join("")}
          ${hasEvent ? `<span class="event-link" onclick="event.stopPropagation(); showEvent('${n.eventId}')">◎ ${evt.name} →</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function filterNews(catId, tag, el) {
  const cat = categories[catId];
  const list = document.getElementById(`news-list-${catId}`);
  el.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  const filtered = tag === "all" ? cat.news : cat.news.filter(n => n.tags.includes(tag));
  list.innerHTML = filtered.map(n => renderNewsItem(catId, n, cat.news.indexOf(n))).join("");
}

function showNews(catId, i) {
  const cat = categories[catId];
  const n = cat.news[i];
  pushViewHistory({ type: "news", catId, i });
  markNewsRead(catId, i);
  const v = document.getElementById("view-news");
  const evt = n.eventId ? events[n.eventId] : null;
  v.innerHTML = `
    <button class="back-btn" onclick="goBack()">← Back</button>
    <div class="detail-head" style="position:relative;">
      <div class="detail-title">${n.title}</div>
      <div class="detail-sub">${n.source} · ${n.time}</div>
      <button class="action-btn" style="position:absolute;top:24px;right:24px;" onclick='openShareCard("news",null,${JSON.stringify({catId, i})})'>↗ 分享</button>
    </div>

    <div class="ai-brief">
      <div class="ai-brief-tag"><span class="pulse"></span>TL;DR</div>
      <p>${n.summary}</p>
    </div>

    ${evt ? `
      <div class="timeline-wrap">
        <div class="timeline-title">◎ ${evt.name}</div>
        <div class="timeline-sub">${evt.desc}</div>
        <div class="timeline">
          ${evt.timeline.map(t => `
            <div class="tl-item ${t.latest ? 'latest' : ''}">
              <div class="tl-date">${t.date}</div>
              <div class="tl-title">${t.title}</div>
              <div class="tl-desc">${t.desc}</div>
              <div class="tl-src">${t.src}</div>
            </div>
          `).join("")}
        </div>
        <div style="margin-top:20px;">
          <span class="event-link" onclick="showEvent('${evt.id}')">View full event →</span>
        </div>
      </div>
    ` : `
      <div class="timeline-wrap" style="text-align:center; color: var(--ink-muted);">
        此条资讯暂未关联长期事件
      </div>
    `}

    ${renderSuggestedEvents(n, catId, i)}
  `;
  document.querySelectorAll(".view").forEach(x => x.classList.remove("active"));
  v.classList.add("active");
  syncBodyViewClass();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAggregate(catId, g, periodKey) {
  const cat = categories[catId];
  const agg = getAggregate(catId, g, periodKey);
  if (!cat || !agg) return;
  pushViewHistory({ type: "aggregate", catId, g, periodKey });
  const v = document.getElementById("view-aggregate");
  const label = { week:"WEEK", month:"MONTH", quarter:"QUARTER", year:"YEAR" }[g];
  // 相关事件（来自该板块的 AI Brief 里列的 relatedEvents）
  const relatedIds = (cat.aiBrief && cat.aiBrief.relatedEvents) || [];
  v.innerHTML = `
    <button class="back-btn" onclick="goBack()">← Back</button>
    <div class="detail-head">
      <div class="c-badge" style="margin-bottom:12px;"><span class="dot" style="background:${getAccent(catId)};"></span>${cat.code}</div>
      <div class="detail-title">${cat.name} · ${label} Report</div>
      <div class="detail-sub">${cat.nameCN} · ${periodKey} · ${formatByGranularity()}</div>
    </div>

    <div class="ai-brief">
      <div class="ai-brief-tag"><span class="pulse"></span>${label} 回顾综合解读</div>
      <p style="font-size:16px;line-height:1.9;">${agg.recap}</p>
    </div>

    <div class="agg-nums" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
      ${agg.numbers.map(k => `
        <div class="agg-num" style="padding:18px 16px;">
          <div class="n" style="font-size:28px;">${k.n}</div>
          <div class="l">${k.l}</div>
        </div>
      `).join("")}
    </div>

    <div class="timeline-wrap">
      <div class="timeline-title">◎ ${label} 数据可视化</div>
      <div class="timeline-sub">该时期板块核心指标</div>
      <div class="agg-chart" style="padding:18px;">
        ${renderSemanticChart(catId, g, agg)}
      </div>
    </div>

    <div class="timeline-wrap">
      <div class="timeline-title">◎ 里程碑时间线</div>
      <div class="timeline-sub">本${label === 'WEEK' ? '周' : label === 'MONTH' ? '月' : label === 'QUARTER' ? '季度' : '年'}重要节点</div>
      <div class="timeline">
        ${agg.milestones.map((m, i) => `
          <div class="tl-item ${i === agg.milestones.length-1 ? 'latest' : ''}">
            <div class="tl-date">${m.date}</div>
            <div class="tl-title">${m.title}</div>
            <div class="tl-desc">${m.desc}</div>
            ${m.tag ? `<div class="tl-src">${m.tag}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>

    ${relatedIds.length ? `
      <div class="timeline-wrap">
        <div class="timeline-title">◎ 相关长期事件</div>
        <div class="timeline-sub">可跳转查看完整时间脉络</div>
        <div class="related-events-list" style="margin-top:12px;">
          ${relatedIds.filter(id => events[id]).map(id => {
            const e = events[id];
            return `<span class="rel-evt" onclick="showEvent('${id}')">
              <span class="evt-dot"></span>${e.name} <span class="arr">→</span>
            </span>`;
          }).join("")}
        </div>
      </div>
    ` : ""}

    <div class="timeline-wrap">
      <div class="timeline-title">◎ 该板块最近新闻</div>
      <div class="timeline-sub">查看日度视图获取完整列表</div>
      <div style="margin-top:12px;">
        ${cat.news.slice(0,5).map((n, i) => `
          <div class="news-item ${isNewsRead(catId, i) ? 'is-read' : ''}" onclick="showNews('${catId}', ${i})" style="padding:14px 0;border-bottom:1px dashed var(--line);">
            <div style="flex:1;">
              <div class="news-title">${n.title}</div>
              <div class="news-meta"><span class="news-source">${n.source}</span><span>${n.time}</span></div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  document.querySelectorAll(".view").forEach(x => x.classList.remove("active"));
  v.classList.add("active");
  syncBodyViewClass();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderEventsLibrary() {
  const v = document.getElementById("view-events");
  const all = Object.values(events);
  const customCount = all.filter(e => isCustomEvent(e.id)).length;
  v.innerHTML = `
    <div class="detail-head">
      <div class="c-badge" style="margin-bottom: 12px;"><span class="dot"></span>LONG-TERM THREADS</div>
      <div class="detail-title">Events</div>
      <div class="detail-sub">${all.length} 议题 · 其中 ${customCount} 个自建 · 点击任一议题查看完整时间脉络</div>
    </div>
    <div class="events-grid">
      ${all.map(e => `
        <div class="event-card" onclick="showEvent('${e.id}')">
          <span class="event-cat">${e.category}${isCustomEvent(e.id) ? ' · CUSTOM' : ''}</span>
          ${isCustomEvent(e.id) ? `<button class="evt-del-mini" title="删除" onclick="event.stopPropagation(); deleteEvent('${e.id}')">✕</button>` : ""}
          <div class="event-name">${e.name}</div>
          <div class="event-desc">${e.desc}</div>
          <div class="event-stats">
            <span><b>${e.timeline.length}</b> milestones</span>
            <span>Latest · <b>${e.timeline[e.timeline.length-1].date}</b></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function showEvent(id) {
  const e = events[id];
  if (!e) return;
  pushViewHistory({ type: "event", id });
  markEventRead(id);
  const v = document.getElementById("view-event");
  const isCustom = isCustomEvent(id);
  v.innerHTML = `
    <button class="back-btn" onclick="goBack()">← Back</button>
    <div class="detail-head" style="position:relative;">
      <span class="event-cat">${e.category}${isCustom ? ' · CUSTOM' : ''}</span>
      <div class="detail-title" style="margin-top:8px;">${e.name}</div>
      <div class="detail-sub">${e.desc}</div>
      <div style="position:absolute;top:24px;right:24px;display:flex;gap:8px;">
        <button class="action-btn" onclick='openShareCard("event","${id}")'>↗ 分享</button>
        ${isCustom ? `<button class="evt-del-btn" style="position:static;" onclick="deleteEvent('${id}')">🗑 删除</button>` : ""}
      </div>
    </div>
    <div class="timeline-wrap">
      <div class="timeline-title">◎ Full Timeline</div>
      <div class="timeline-sub">按时间顺序展示，最新进展高亮</div>
      <div class="timeline">
        ${e.timeline.map(t => `
          <div class="tl-item ${t.latest ? 'latest' : ''}">
            <div class="tl-date">${t.date}</div>
            <div class="tl-title">${t.title}</div>
            <div class="tl-desc">${t.desc}</div>
            <div class="tl-src">${t.src}</div>
          </div>
        `).join("")}
        ${(() => {
          const p = predictNextMilestone(e.timeline);
          if (!p) return "";
          return `
            <div class="tl-item tl-forecast">
              <div class="tl-date">${p.label} <span class="fc-tag">预测</span></div>
              <div class="tl-title">下一里程碑可能出现在 ${p.month} 左右</div>
              <div class="tl-desc">基于时间线历史节奏外推 · ${p.rhythm}</div>
              <div class="tl-src">AI Forecast · 仅供参考，非预言</div>
            </div>
          `;
        })()}
      </div>
    </div>
  `;
  document.querySelectorAll(".view").forEach(x => x.classList.remove("active"));
  v.classList.add("active");
  syncBodyViewClass();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ================= 实体识别 / 聚类推荐 =================
// 简单实体抽取：中文专名词 + 英文大写连词 + 数字型版本号
// ================= 添加 / 删除事件 =================

function openEventModal(keyword, aiAnswer) {
  const kw = keyword || "";
  document.getElementById("modal-kw").textContent = kw;
  document.getElementById("modal-name").value = aiAnswer ? (aiAnswer.title || kw) : kw;
  document.getElementById("modal-desc").value = aiAnswer
    ? (String(aiAnswer.body || "").replace(/\n+/g, " ").slice(0, 200))
    : `关于「${kw}」的长期追踪议题`;
  document.getElementById("modal-milestone").value = aiAnswer ? "AI 联网检索结果归档" : "";
  document.getElementById("modal-category").value = "Technology";
  document.getElementById("event-modal").classList.add("open");
  window.__pendingAI = aiAnswer || null;
}

function closeEventModal() {
  document.getElementById("event-modal").classList.remove("open");
  window.__pendingAI = null;
}

function confirmAddEvent() {
  const nameEl = document.getElementById("modal-name");
  const name = nameEl.value.trim();
  const category = document.getElementById("modal-category").value;
  const desc = document.getElementById("modal-desc").value.trim() || "用户添加的长期追踪议题";
  const firstMilestone = document.getElementById("modal-milestone").value.trim();
  if (!name) {
    nameEl.focus(); nameEl.style.borderColor = "#d4475e";
    return;
  }
  const id = genEventId(name);
  const ai = window.__pendingAI;
  const timeline = [{
    date: todayLabel(),
    title: firstMilestone || "议题创建",
    desc: ai ? String(ai.body || "").replace(/\n+/g, " ").slice(0, 160) : `创建时的初始描述：${desc}`,
    src: ai ? "AI Web Search" : "手动创建",
    latest: true
  }];
  customEvents[id] = {
    id, name, category, desc, timeline,
    createdAt: new Date().toISOString(),
    custom: true
  };
  saveCustomEvents(customEvents);
  rebuildEvents();
  closeEventModal();
  showToast(`已添加「${name}」到 Events`, id);
  closeSearch();
}

function deleteEvent(id) {
  if (!isCustomEvent(id)) {
    showToast("内置事件不可删除");
    return;
  }
  if (!confirm("确定删除这个事件？此操作不可撤销。")) return;
  delete customEvents[id];
  saveCustomEvents(customEvents);
  rebuildEvents();
  showToast("已删除");
  switchView("events");
}

// ================= 时间线预测 =================

// ================= 分享卡片 =================
let _shareContext = null;

function openShareCard(type, id, extra) {
  _shareContext = { type, id, extra };
  const sub = document.getElementById("share-sub");
  let title, lead, payload, forecast = null;
  if (type === "brief") {
    const cat = categories[id];
    title = `${cat.name} · 每日综合解读`;
    lead = cat.aiBrief && typeof cat.aiBrief === "object" ? cat.aiBrief.lead : cat.summary;
    payload = { kind: "category", id };
    sub.textContent = `分享「${cat.name}」今日综合解读`;
    // 从相关事件里拿第一个有预测的
    const rel = (cat.aiBrief && cat.aiBrief.relatedEvents) || [];
    for (const eid of rel) {
      const e = events[eid];
      if (!e) continue;
      const p = predictNextMilestone(e.timeline);
      if (p) { forecast = { ...p, eventName: e.name }; break; }
    }
  } else if (type === "event") {
    const e = events[id];
    if (!e) return;
    title = e.name;
    lead = e.desc;
    payload = { kind: "event", id };
    sub.textContent = `分享事件「${e.name}」`;
    const p = predictNextMilestone(e.timeline);
    if (p) forecast = { ...p, eventName: e.name };
  } else if (type === "news") {
    const cat = categories[extra.catId];
    const n = cat.news[extra.i];
    title = n.title;
    lead = n.summary;
    payload = { kind: "news", catId: extra.catId, i: extra.i };
    sub.textContent = `分享资讯「${n.title}」`;
    if (n.eventId && events[n.eventId]) {
      const p = predictNextMilestone(events[n.eventId].timeline);
      if (p) forecast = { ...p, eventName: events[n.eventId].name };
    }
  }
  const url = `${location.origin}${location.pathname}#${encodeURIComponent(JSON.stringify(payload))}`;
  document.getElementById("share-url").value = url;
  drawShareCard(title, lead, payload, url, forecast);
  document.getElementById("share-modal").classList.add("open");
}

function closeShare() {
  document.getElementById("share-modal").classList.remove("open");
  _shareContext = null;
}

function copyShareUrl() {
  const input = document.getElementById("share-url");
  input.select();
  try { document.execCommand("copy"); showToast("链接已复制"); } catch {}
}

// 绘制卡片
function drawShareCard(title, lead, payload, url, forecast) {
  const cvs = document.getElementById("share-canvas");
  const ctx = cvs.getContext("2d");
  const W = cvs.width, H = cvs.height;

  // 背景：青白渐变 + 角落色块
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#eef3f1");
  grad.addColorStop(0.55, "#e2ebe7");
  grad.addColorStop(1, "#dde8ec");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // 紫色光斑
  const r = ctx.createRadialGradient(W*0.85, H*0.1, 0, W*0.85, H*0.1, W*0.5);
  r.addColorStop(0, "rgba(118,75,162,0.25)");
  r.addColorStop(1, "rgba(118,75,162,0)");
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  const r2 = ctx.createRadialGradient(W*0.15, H*0.95, 0, W*0.15, H*0.95, W*0.5);
  r2.addColorStop(0, "rgba(102,126,234,0.22)");
  r2.addColorStop(1, "rgba(102,126,234,0)");
  ctx.fillStyle = r2; ctx.fillRect(0, 0, W, H);

  // 顶部 Brand
  ctx.fillStyle = "rgba(26,29,33,0.55)";
  ctx.font = "500 28px 'JetBrains Mono', monospace";
  ctx.fillText("UNIVERSE · DAILY BRIEFING", 72, 100);

  // Universe Logo (big)
  const lg = ctx.createLinearGradient(72, 140, 600, 260);
  lg.addColorStop(0, "#667eea"); lg.addColorStop(1, "#764ba2");
  ctx.fillStyle = lg;
  ctx.font = "700 120px Manrope, sans-serif";
  ctx.fillText("Universe", 72, 250);

  // Divider
  ctx.strokeStyle = "rgba(26,29,33,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(72, 310); ctx.lineTo(W-72, 310); ctx.stroke();

  // 主标题（自动换行）
  ctx.fillStyle = "#14213a";
  ctx.font = "700 54px Manrope, sans-serif";
  wrapText(ctx, title, 72, 400, W-144, 68, 3);

  // 副文案（lead）— 若有预测则缩短为 5 行，给预测区腾空间
  ctx.fillStyle = "#3a506e";
  ctx.font = "400 30px Inter, 'PingFang SC', sans-serif";
  const leadY = 600;
  const leadMaxLines = forecast ? 5 : 8;
  wrapText(ctx, lead || "", 72, leadY, W-144, 46, leadMaxLines);

  // 预测区（可选）
  if (forecast) {
    const boxY = H - 520;
    const boxH = 220;
    // 紫色渐变底
    const pg = ctx.createLinearGradient(72, boxY, W-72, boxY+boxH);
    pg.addColorStop(0, "rgba(102,126,234,0.14)");
    pg.addColorStop(1, "rgba(118,75,162,0.14)");
    ctx.fillStyle = pg;
    roundRect(ctx, 72, boxY, W-144, boxH, 28);
    ctx.fill();
    // 左侧虚线圆环图标
    ctx.save();
    ctx.strokeStyle = "#764ba2";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(130, boxY + 62, 26, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
    // forecast 角标
    ctx.fillStyle = "#764ba2";
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    ctx.fillText("AI FORECAST · 趋势预测", 180, boxY + 54);
    // 标题
    ctx.fillStyle = "#14213a";
    ctx.font = "700 36px Manrope, sans-serif";
    const fcTitle = `下一里程碑预计 ${forecast.label}（${forecast.month}）`;
    wrapText(ctx, fcTitle, 180, boxY + 110, W - 144 - 130, 46, 2);
    // 节奏 + 来源事件
    ctx.fillStyle = "#3a506e";
    ctx.font = "400 22px Inter, 'PingFang SC', sans-serif";
    const line = `${forecast.rhythm} · 基于「${forecast.eventName}」时间线外推`;
    wrapText(ctx, line, 180, boxY + 170, W - 144 - 130, 32, 2);
  }

  // 底部 URL 区
  ctx.fillStyle = "rgba(118,75,162,0.08)";
  roundRect(ctx, 72, H-260, W-144, 180, 24);
  ctx.fill();

  ctx.fillStyle = "rgba(26,29,33,0.5)";
  ctx.font = "500 22px 'JetBrains Mono', monospace";
  ctx.fillText("SCAN / OPEN LINK TO READ FULL", 96, H-208);

  ctx.fillStyle = "#1a1d21";
  ctx.font = "600 28px 'JetBrains Mono', monospace";
  const shortUrl = url.length > 56 ? url.slice(0, 54) + "…" : url;
  ctx.fillText(shortUrl, 96, H-162);

  ctx.fillStyle = "rgba(26,29,33,0.35)";
  ctx.font = "400 20px Inter, sans-serif";
  ctx.fillText("— by NA · Everything worth knowing, in one glance.", 96, H-110);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = text.split("");
  let line = "", lines = 0;
  for (let i = 0; i < chars.length && lines < maxLines; i++) {
    const test = line + chars[i];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line) {
      if (lines === maxLines - 1 && i < chars.length - 1) {
        ctx.fillText(line + "…", x, y + lines * lineHeight);
      } else {
        ctx.fillText(line, x, y + lines * lineHeight);
      }
      lines++;
      line = chars[i];
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function downloadShareCard() {
  const cvs = document.getElementById("share-canvas");
  const link = document.createElement("a");
  link.download = `universe-share-${Date.now()}.png`;
  link.href = cvs.toDataURL("image/png");
  link.click();
  showToast("图片已保存");
}

// 打开时解析 hash，若是分享链接则自动跳转到对应内容
function handleShareHash() {
  const h = location.hash.slice(1);
  if (!h) return;
  try {
    const payload = JSON.parse(decodeURIComponent(h));
    if (payload.kind === "category") setTimeout(() => showCategory(payload.id), 200);
    else if (payload.kind === "event") setTimeout(() => showEvent(payload.id), 200);
    else if (payload.kind === "news") setTimeout(() => showNews(payload.catId, payload.i), 200);
  } catch {}
}
// ================= 通知与订阅 =================
// NOTIF_KEY / notifSettings 已在 state.js 声明并暴露到 window

// 生成所有半小时节点标签
function allTimeOptions() {
  const opts = [`<option value="">-- 不推送 --</option>`];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const v = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      opts.push(`<option value="${v}">${v}</option>`);
    }
  }
  return opts.join("");
}
function fillTimeSelect(idx) {
  const sel = document.getElementById(`notif-time-${idx}`);
  if (!sel) return;
  sel.innerHTML = allTimeOptions();
  sel.value = notifSettings.times[idx - 1] || "";
}
function clearTime(idx) {
  const sel = document.getElementById(`notif-time-${idx}`);
  if (sel) sel.value = "";
}

function saveNotifPersist() {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifSettings)); } catch {}
}

function openNotifModal() {
  fillTimeSelect(1);
  fillTimeSelect(2);
  document.getElementById("notif-email").value = notifSettings.email || "";
  refreshNotifStatus();
  document.getElementById("notif-modal").classList.add("open");
}
function closeNotifModal() {
  document.getElementById("notif-modal").classList.remove("open");
}
function refreshNotifStatus() {
  const el = document.getElementById("notif-status");
  if (!("Notification" in window)) { el.textContent = "当前浏览器不支持桌面通知"; return; }
  const p = Notification.permission;
  if (p === "granted") el.textContent = "✓ 已授权，将在设定时间推送";
  else if (p === "denied") el.textContent = "✗ 已被拒绝，需要去浏览器设置里开启";
  else el.textContent = "未授权，点左侧按钮申请";
}
function requestDesktopNotif() {
  if (!("Notification" in window)) return;
  Notification.requestPermission().then(() => refreshNotifStatus());
}
function testNotif() {
  if (!("Notification" in window)) { showToast("当前浏览器不支持桌面通知"); return; }
  if (Notification.permission !== "granted") {
    Notification.requestPermission().then(p => { if (p === "granted") fireTestNotif(); });
  } else fireTestNotif();
}
function fireTestNotif() {
  try {
    new Notification("Universe · 每日摘要测试", {
      body: "今日 6 大板块已就绪：科技/AI/国际/中国/投资/学习。",
      tag: "universe-test"
    });
  } catch (e) { showToast("通知发送失败: " + e.message); }
}

function saveNotifSettings() {
  const email = document.getElementById("notif-email").value.trim();
  const t1 = document.getElementById("notif-time-1").value || "";
  const t2 = document.getElementById("notif-time-2").value || "";
  // 去重 + 排序
  const times = [t1, t2].filter(Boolean);
  const uniq = Array.from(new Set(times)).sort();
  notifSettings.times = [uniq[0] || "", uniq[1] || ""];
  notifSettings.email = email;
  if (!notifSettings.lastSent) notifSettings.lastSent = {};
  saveNotifPersist();

  if (email && email !== notifSettings._lastEmail) {
    const subject = encodeURIComponent("订阅 Universe 每日摘要");
    const timeLine = notifSettings.times.filter(Boolean).join(" / ") || "未设置";
    const body = encodeURIComponent(`请订阅此邮箱 ${email} 接收每日信息简报。\n推送时间：${timeLine}`);
    window.open(`mailto:subscribe@universe.local?subject=${subject}&body=${body}`, "_blank");
    notifSettings._lastEmail = email;
    saveNotifPersist();
  }
  closeNotifModal();
  const active = notifSettings.times.filter(Boolean);
  showToast(active.length
    ? `通知设置已保存：${active.join(" / ")}`
    : "通知已关闭（未设置任何时段）");
  updateBellBadge();
}

// 未读数徽标
function updateBellBadge() {
  const total = Object.values(categories).reduce((s, c) => s + unreadCount(c), 0);
  const badge = document.getElementById("bell-badge");
  if (!badge) return;
  if (total > 0) {
    badge.style.display = "";
    badge.textContent = total > 99 ? "99+" : String(total);
  } else {
    badge.style.display = "none";
  }
}

// 定时检查（每 30s 一次），到推送时间且今天未推送过 → 弹通知
function maybeDailyPush() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  const now = `${hh}:${mm}`;
  const today = toISODate();
  if (!notifSettings.lastSent || typeof notifSettings.lastSent !== "object") notifSettings.lastSent = {};
  const active = (notifSettings.times || []).filter(Boolean);
  for (const t of active) {
    const key = `${today}#${t}`;
    if (t === now && !notifSettings.lastSent[key]) {
      const total = Object.values(categories).reduce((s, c) => s + unreadCount(c), 0);
      try {
        new Notification(`Universe · ${t} 摘要`, {
          body: total > 0 ? `当前有 ${total} 条新资讯待查看。` : "资讯已就绪，请查看看板。",
          tag: `universe-${t}`
        });
        notifSettings.lastSent[key] = true;
        saveNotifPersist();
      } catch {}
    }
  }
}

// ================= Toast =================
let __toastTimer = null;
function showToast(msg, eventIdForLink) {
  const t = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  const link = document.getElementById("toast-link");
  if (eventIdForLink) {
    link.style.display = "";
    link.onclick = () => { showEvent(eventIdForLink); t.classList.remove("show"); };
  } else {
    link.style.display = "none";
  }
  t.classList.add("show");
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// ================= 搜索 =================

function closeSearch() {
  const box = document.getElementById("search-results");
  box.classList.remove("show");
  box.innerHTML = "";
}

function runSearch() {
  const kw = document.getElementById("search-input").value.trim();
  const box = document.getElementById("search-results");
  if (!kw) { closeSearch(); return; }

  const { news, events: evs, articles } = searchLocal(kw);
  const hasLocal = news.length + evs.length + articles.length > 0;

  const closeBtn = `<button class="search-close" onclick="closeSearch()" title="收起搜索结果 (Esc)">✕</button>`;

  // 先显示本地结果（若有）
  let html = closeBtn;
  if (hasLocal) {
    if (evs.length) {
      html += `<div class="search-section">
        <div class="search-section-title">Events <span class="count">${evs.length}</span></div>
        ${evs.map(e => `
          <div class="search-result-item" onclick="closeSearch(); showEvent('${e.id}')">
            <span class="sr-kind">EVENT</span>
            <div class="sr-body">
              <div class="sr-title">${highlight(e.name, kw)}<span class="subscribed-tag">◉ Tracking</span></div>
              <div class="sr-snippet">${highlight(e.desc, kw)}</div>
              <div class="sr-meta">${e.category} · ${e.timeline.length} milestones · Latest ${e.timeline[e.timeline.length-1].date}</div>
            </div>
          </div>
        `).join("")}
      </div>`;
    }
    if (news.length) {
      html += `<div class="search-section">
        <div class="search-section-title">News <span class="count">${news.length}</span></div>
        ${news.map(({cat, n, i}) => `
          <div class="search-result-item" onclick="closeSearch(); showNews('${cat.id}', ${i})">
            <span class="sr-kind">NEWS</span>
            <div class="sr-body">
              <div class="sr-title">${highlight(n.title, kw)}</div>
              <div class="sr-snippet">${highlight(n.summary, kw)}</div>
              <div class="sr-meta">${cat.name} · ${n.source} · ${n.time}</div>
            </div>
          </div>
        `).join("")}
      </div>`;
    }
    if (articles.length) {
      html += `<div class="search-section">
        <div class="search-section-title">Core Articles <span class="count">${articles.length}</span></div>
        ${articles.map(({cat, a}) => `
          <div class="search-result-item" onclick="closeSearch(); showCategory('${cat.id}')">
            <span class="sr-kind">ARTICLE</span>
            <div class="sr-body">
              <div class="sr-title">${highlight(a.title, kw)}</div>
              <div class="sr-meta">${cat.name} · ${a.src}</div>
            </div>
          </div>
        `).join("")}
      </div>`;
    }
    // 无匹配事件时，底部给个"新建事件"入口
    if (!evs.length) {
      html += `<div class="search-section" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <span class="hint" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-muted);letter-spacing:1px;">◈ 没找到对应的长期追踪议题？</span>
        <button class="btn-save-event" onclick='openEventModal(${JSON.stringify(kw)}, null)'>
          ＋ 把「${escapeHtml(kw)}」加入 Events
        </button>
      </div>`;
    }

    box.innerHTML = html;
    box.classList.add("show");
    return;
  }

  // 本地无结果 → 模拟 AI 联网检索
  box.innerHTML = closeBtn + `<div class="ai-searching"><span class="spin"></span>正在联网检索「${escapeHtml(kw)}」并生成 AI 综合总结…</div>`;
  box.classList.add("show");

  setTimeout(() => {
    const ans = fakeAIWebAnswer(kw);
    const kwEsc = escapeHtml(kw);
    box.innerHTML = closeBtn + `
      <div class="search-section ai-web-card">
        <div class="ai-web-tag"><span class="pulse"></span>AI Web Search · 联网综合</div>
        <div class="ai-web-title">${ans.title}</div>
        <div class="ai-web-body">${ans.body.replace(/\n/g,"<br>")}</div>
        <div class="ai-web-refs"><b>REFERENCES</b><br>${ans.refs.map(r => "· " + r).join("<br>")}</div>
        <div class="ai-web-actions">
          <span class="hint">◈ 还不够？把它加入长期追踪</span>
          <button class="btn-ghost" onclick="runSearch()">重新检索</button>
          <button class="btn-save-event" onclick='openEventModal(${JSON.stringify(kw)}, ${JSON.stringify(ans)})'>
            ＋ 添加到 Events
          </button>
        </div>
      </div>
    `;
  }, 1400);
}

// ESC 收起搜索结果
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const box = document.getElementById("search-results");
    if (box && box.classList.contains("show")) closeSearch();
  }
});

// ===== 对外暴露（给 HTML 的 onclick 用，立即执行，不等数据） =====
Object.assign(window, {
  toggleDatePop, onDateChange, quickDate, setGranularity, pickPeriod, backToNow,
  switchView, showCategory, showNews, showEvent, showAggregate,
  filterNews, runSearch, closeSearch,
  openEventModal, closeEventModal, confirmAddEvent, deleteEvent,
  openShareCard, closeShare, copyShareUrl, downloadShareCard,
  openNotifModal, closeNotifModal, requestDesktopNotif, testNotif,
  saveNotifSettings, clearTime, fillTimeSelect,
  showToast, scrollToEvents
});

// ===== 初始化：等 state.js 挂好后执行 =====
function __initRender() {
  if (window.__UniverseRenderInited) return;
  window.__UniverseRenderInited = true;
  // 需要的 state 函数可能尚未挂上，再次校验
  if (typeof formatByGranularity !== "function") {
    console.warn("[render.js] state not ready yet; retry later");
    return;
  }
  try {
    // 点击空白处关闭 date-pop
    document.addEventListener("click", () => {
      const dp = document.getElementById("date-pop");
      if (dp) dp.classList.remove("open");
    });
    refreshDateUI();
    renderMosaic();
    syncBodyViewClass();
    if (typeof handleShareHash === "function") handleShareHash();
    if (typeof updateBellBadge === "function") updateBellBadge();
    if (typeof maybeDailyPush === "function") setInterval(maybeDailyPush, 30000);
  } catch (e) {
    console.error("[render.js] init failed:", e);
  }
}

if (window.AppDataReady && window.__UniverseStateInited) {
  __initRender();
} else {
  window.addEventListener("appdata-ready", () => {
    // state.js 的监听器会在 render.js 之前执行（addEventListener 注册顺序）
    // 但保险起见延迟一帧
    setTimeout(__initRender, 0);
  }, { once: true });
}
