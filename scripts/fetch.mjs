#!/usr/bin/env node
// scripts/fetch.mjs
// 1. 读 feeds.json 列表
// 2. 抓 RSS，汇总最近条目
// 3. 调 Claude API 做摘要 + 分类（可选，需要 ANTHROPIC_API_KEY）
// 4. 合并生成 data.json（保留原有 events/aggregates 结构）
//
// 用法：
//   node scripts/fetch.mjs            # 只抓 RSS，不调 AI
//   ANTHROPIC_API_KEY=sk-... node scripts/fetch.mjs   # 连 AI 摘要一起跑

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data.json");
const FEEDS_PATH = path.join(__dirname, "feeds.json");

const CATEGORY_NAMES = {
  tech:  { name: "Technology", nameCN: "科技",     code: "01 / TECHNOLOGY",           slot: "slot-tech",  icon: "💻" },
  ai:    { name: "AI",         nameCN: "AI 发展",  code: "02 / ARTIFICIAL INTELLIGENCE", slot: "slot-ai",    icon: "🤖" },
  intl:  { name: "Global",     nameCN: "国际政治", code: "03 / GLOBAL AFFAIRS",       slot: "slot-intl",  icon: "🌍" },
  cn:    { name: "China",      nameCN: "中国政治", code: "04 / CHINA POLICY",         slot: "slot-cn",    icon: "🇨🇳" },
  stock: { name: "Markets",    nameCN: "股票投资", code: "05 / MARKETS",              slot: "slot-stock", icon: "📈" },
  study: { name: "Learning",   nameCN: "个人学习", code: "06 / LEARNING",             slot: "slot-study", icon: "📚" }
};

const parser = new Parser({
  timeout: 8000,
  headers: { "User-Agent": "UniverseBot/1.0 (+https://example.com)" }
});

function relTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "recent";
  const diffMs = Date.now() - d.getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

function cleanText(s, max = 220) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 10).map(it => ({
      title: cleanText(it.title, 120),
      summary: cleanText(it.contentSnippet || it.content || it.summary, 220),
      source: feed.name,
      url: it.link,
      time: relTime(it.isoDate || it.pubDate),
      isoDate: it.isoDate || it.pubDate || new Date().toISOString(),
      market: feed.market || null,
      tags: []
    }));
  } catch (e) {
    console.warn(`[feed] ${feed.name} failed: ${e.message}`);
    return [];
  }
}

async function fetchCategoryNews(catId, feeds) {
  console.log(`\n--- 抓 ${catId} (${feeds.length} 源) ---`);
  // 并行抓取
  const results = await Promise.all(feeds.map(async f => {
    const items = await fetchFeed(f);
    console.log(`  ${items.length > 0 ? '✓' : '✗'} ${f.name}: ${items.length}`);
    return items;
  }));
  const all = results.flat();
  all.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  return all.slice(0, 10);
}

// --- 可选：调 Claude 做摘要 + AI Brief ---
async function callClaude(messages, maxTokens = 1500) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages
      })
    });
    if (!res.ok) {
      console.warn(`[claude] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }
    const json = await res.json();
    return json.content?.[0]?.text || null;
  } catch (e) {
    console.warn("[claude] failed:", e.message);
    return null;
  }
}

async function generateAIBrief(catId, news) {
  const cat = CATEGORY_NAMES[catId];
  const titles = news.slice(0, 10).map((n, i) => `${i+1}. ${n.title} (${n.source})`).join("\n");
  const prompt = `你是一名资深信息策展人。以下是今天「${cat.nameCN}」板块的原始新闻标题：

${titles}

请用中文输出一份 JSON，严格按照以下格式（不要加任何解释、不要用代码块）：
{
  "summary": "60-80 字的今日总结，要具体、带数字和关键事件",
  "lead": "一句话主论点，20-30 字",
  "sections": [
    {"h": "小主题 1", "p": "2-3 句话的解读"},
    {"h": "小主题 2", "p": "2-3 句话的解读"},
    {"h": "小主题 3", "p": "2-3 句话的解读"},
    {"h": "对从业者的信号", "p": "可操作建议"}
  ],
  "keyNumbers": [
    {"n": "数字", "l": "标签"},
    {"n": "数字", "l": "标签"},
    {"n": "数字", "l": "标签"},
    {"n": "数字", "l": "标签"}
  ]
}`;
  const text = await callClaude([{ role: "user", content: prompt }], 1500);
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.warn("[brief] parse failed:", e.message);
    return null;
  }
}

async function main() {
  const feeds = JSON.parse(await fs.readFile(FEEDS_PATH, "utf8"));
  // 读当前 data.json 作为基础（保留 events / aggregates / sources / mosaicOrder）
  let base = {};
  try {
    base = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  } catch {
    console.log("(no existing data.json, start fresh)");
    base = { sources: {}, categories: {}, builtinEvents: {}, aggregates: {}, mosaicOrder: Object.keys(CATEGORY_NAMES) };
  }

  const categories = { ...(base.categories || {}) };

  for (const catId of Object.keys(CATEGORY_NAMES)) {
    const meta = CATEGORY_NAMES[catId];
    const list = feeds[catId] || [];
    const news = await fetchCategoryNews(catId, list);
    const oldCat = categories[catId] || {};

    const brief = await generateAIBrief(catId, news);

    categories[catId] = {
      id: catId,
      ...meta,
      slot: meta.slot,
      updated: `Updated ${new Date().toISOString().slice(11, 16)} UTC`,
      summary: brief?.summary || oldCat.summary || `${meta.nameCN}最新资讯（${news.length} 条）`,
      coreArticles: news.slice(0, 5).map((n, i) => ({
        idx: i + 1,
        title: n.title,
        src: n.source,
        url: n.url
      })),
      aiBrief: brief ? {
        lead: brief.lead || brief.summary,
        heroImage: catId,
        sections: brief.sections || [],
        keyNumbers: brief.keyNumbers || [],
        relatedEvents: oldCat.aiBrief?.relatedEvents || []
      } : (oldCat.aiBrief || null),
      news: news.map(n => ({
        title: n.title,
        summary: n.summary,
        source: n.source,
        url: n.url,
        time: n.time,
        tags: n.tags,
        market: n.market
      }))
    };
  }

  const output = {
    ...base,
    categories,
    generatedAt: new Date().toISOString()
  };

  await fs.writeFile(DATA_PATH, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✓ Wrote ${DATA_PATH} (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
