// api/search.js — Vercel Serverless Function
// 前端 POST { q, apiKey } → 自动识别 key 类型 → 调 Anthropic 或 OpenAI

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const q = String(body?.q || "").trim();
  if (!q) return json({ error: "empty query" }, 400);
  if (q.length > 120) return json({ error: "query too long" }, 400);

  const userKey = String(body?.apiKey || "").trim();
  const envKey  = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "";
  const key = userKey || envKey;

  if (!key) {
    return json({
      title: `关于「${q}」`,
      body: "未提供 API key。请在页面右上角 🔑 按钮里填入你的 Claude 或 OpenAI API key。\n\n· Claude key 以 sk-ant- 开头（https://console.anthropic.com/settings/keys）\n· OpenAI key 以 sk- 开头（https://platform.openai.com/api-keys）\n\nkey 仅保存在你的浏览器本地。",
      refs: [],
      needKey: true
    });
  }

  // 识别 provider
  const provider = detectProvider(key);
  if (!provider) {
    return json({
      title: "API key 格式不正确",
      body: "无法识别的 key 格式。支持：\n· Claude key（sk-ant-...）\n· OpenAI key（sk-... 或 sk-proj-...）",
      refs: [],
      needKey: true
    });
  }

  const prompt = buildPrompt(q);

  try {
    const text = provider === "anthropic"
      ? await callAnthropic(key, prompt)
      : await callOpenAI(key, prompt);
    if (!text) {
      return json({ title: `关于「${q}」`, body: "AI 返回空内容。", refs: [] });
    }
    const parsed = parseJSON(text, q);
    return json(parsed);
  } catch (e) {
    const msg = e.message || "";
    console.error("[search] error:", msg);
    if (/401|invalid|authentication/i.test(msg)) {
      return json({
        title: "API key 无效",
        body: `${provider === "anthropic" ? "Claude" : "OpenAI"} 拒绝了你提供的 API key。\n可能原因：\n· key 已过期或被禁用\n· key 有拼写错误\n· 账户欠费或达到配额\n\n请在设置里更换 key。`,
        refs: [],
        needKey: true
      });
    }
    if (/429|rate/i.test(msg)) {
      return json({
        title: "请求过快",
        body: "账户被限流，请稍等再试。",
        refs: []
      });
    }
    return json({
      title: `关于「${q}」`,
      body: `AI 服务暂时不可用：${msg}`,
      refs: []
    });
  }
}

function detectProvider(key) {
  if (/^sk-ant-/.test(key)) return "anthropic";
  if (/^sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(key)) return "openai";
  return null;
}

function buildPrompt(q) {
  return `你是一个信息策展编辑。用户搜索了「${q}」。

任务：基于你的知识，对这个话题给出一份中文综合解读。严格按以下 JSON 格式返回（不要加任何解释、不要用 markdown 代码块包裹）：

{
  "title": "一句话概括这个话题，20-30 字",
  "body": "详细解读，分 3-4 段，每段 2-3 句话。用中文。涵盖：\\n1. 话题当前状态 / 最新动态\\n2. 关键数字或事实\\n3. 背后的驱动因素或影响\\n4. 对用户可能的启发",
  "refs": [
    "主流媒体或研究机构名 · 大致时间 · 一句话说明观点",
    "（3-5 条）"
  ]
}

注意：
- 如果话题涉及具体公司股价、实时汇率等实时信息，说明你的知识截止时间可能落后，给出的是结构性分析而非实时数据
- 如果不确定某个数字，用"约"、"预计"等词，不要编造精确数字
- 对涉及中国政治敏感话题，保持客观中立`;
}

async function callAnthropic(key, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${t}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(key, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${t}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(text, q) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { title: `关于「${q}」`, body: text, refs: [] };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      title: parsed.title || `关于「${q}」`,
      body: parsed.body || "",
      refs: Array.isArray(parsed.refs) ? parsed.refs : []
    };
  } catch {
    return { title: `关于「${q}」`, body: match[0], refs: [] };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
