// data.js — 异步加载数据（data.json），失败降级到内置最小样本
// 运行后挂到 window.AppData。state.js / render.js 应在 appdata-ready 事件后初始化。

(function () {

const FALLBACK = {
  sources: {
    tech: "等待数据源加载…", ai: "等待数据源加载…", intl: "等待数据源加载…",
    cn: "等待数据源加载…", stock: "等待数据源加载…", study: "等待数据源加载…"
  },
  categories: {}, builtinEvents: {}, aggregates: {},
  mosaicOrder: ["tech", "ai", "intl", "cn", "stock", "study"]
};

window.AppData = FALLBACK;
window.AppDataReady = false;

async function loadAppData() {
  try {
    const res = await fetch("data.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !json.categories) throw new Error("data.json malformed");
    window.AppData = json;
    window.AppDataReady = true;
    window.dispatchEvent(new CustomEvent("appdata-ready", { detail: json }));
    console.log("[data.js] loaded", Object.keys(json.categories).length, "categories");
  } catch (e) {
    console.error("[data.js] load failed:", e.message);
    window.AppData = FALLBACK;
    window.AppDataReady = false;
    try {
      const banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:0;left:0;right:0;padding:10px;background:#d4475e;color:#fff;font-size:13px;text-align:center;z-index:9999;font-family:sans-serif;";
      banner.textContent = "⚠ 数据加载失败（" + e.message + "）— 请用 http 服务器打开（不能双击文件），或检查 data.json 存在";
      document.body.appendChild(banner);
    } catch {}
    window.dispatchEvent(new CustomEvent("appdata-ready", { detail: FALLBACK }));
  }
}

loadAppData();

})();
