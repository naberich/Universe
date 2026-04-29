// functions/api/search.js — Cloudflare Pages Functions
// POST /api/search { q, apiKey, provider } → 调对应 AI 厂商 API

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad json" }, 400); }

  const q = String(body?.q || "").trim();
  if (!q) return json({ error: "empty query" }, 400);
  if (q.length > 120) return json({ error: "query too long" }, 400);

  const userKey = String(body?.apiKey || "").trim();
  const provider = String(body?.provider || "").trim() || "deepseek";
  const envKey = (env && (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY)) || "";
  const key = userKey || envKey;

  if (!key) {
    return json({
      title: `关于「${q}」`,
      body: "未提供 API key。请在页面右上角 🔑 按钮里选择 AI 服务商并填入 key。",
      refs: [],
      needKey: true
    });
  }

  const prompt = buildPrompt(q);
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    return json({
      title: "不支持的服务商",
      body: `未知的 provider: ${provider}`,
      refs: []
    });
  }

  try {
    const text = cfg.format === "anthropic"
      ? await callAnthropic(cfg, key, prompt)
      : await callOpenAICompatible(cfg, key, prompt);
    if (!text) return json({ title: `关于「${q}」`, body: "AI 返回空内容。", refs: [] });
    return json(parseJSON(text, q));
  } catch (e) {
    const msg = e.message || "";
    if (/401|invalid|authentication|unauthor/i.test(msg)) {
      return json({
        title: "API key 无效",
        body: `${cfg.name} 拒绝了你的 key。\n可能原因：key 错误 / 过期 / 账户欠费 / 未开通该模型。\n\n请在设置里换一个 key。`,
        refs: [],
        needKey: true
      });
    }
    if (/403|country|region|forbidden/i.test(msg)) {
      return json({
        title: "区域不支持",
        body: `${cfg.name} 在当前部署节点不可用（${msg.slice(0,100)}）。\n建议换一家：国内推荐 DeepSeek / 通义 / 智谱。`,
        refs: [],
        needKey: true
      });
    }
    if (/429|rate/i.test(msg)) {
      return json({ title: "请求过快", body: "账户被限流，请稍等再试。", refs: [] });
    }
    return json({
      title: `关于「${q}」`,
      body: `AI 服务暂时不可用：${msg.slice(0, 200)}`,
      refs: []
    });
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "use POST" }, 405);
}

const PROVIDER_CONFIG = {
  deepseek: {
    name: "DeepSeek",
    format: "openai",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat"
  },
  qwen: {
    name: "通义千问",
    format: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-turbo"
  },
  zhipu: {
    name: "智谱 GLM",
    format: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash"
  },
  anthropic: {
    name: "Anthropic",
    format: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-haiku-4-5-20251001"
  },
  openai: {
    name: "OpenAI",
    format: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini"
  }
};

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

async function callAnthropic(cfg, key, prompt) {
  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAICompatible(cfg, key, prompt) {
  const payload = {
    model: cfg.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500
  };
  // 部分厂商支持 json 模式，不支持的不传（避免 400）
  if (cfg.format === "openai" && (cfg.endpoint.includes("openai.com") || cfg.endpoint.includes("deepseek") || cfg.endpoint.includes("bigmodel"))) {
    payload.response_format = { type: "json_object" };
  }
  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
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
