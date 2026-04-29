// api/search.js — Vercel Serverless Function
// 被前端调用：POST /api/search  { q: "关键词" }
// 返回: { title, body, refs[] }

export const config = {
  runtime: "edge"  // 冷启动快，全球分发
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const q = String(body?.q || "").trim();
  if (!q) return json({ error: "empty query" }, 400);
  if (q.length > 80) return json({ error: "query too long" }, 400);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json({
      title: `关于「${q}」`,
      body: "后端未配置 ANTHROPIC_API_KEY，暂时无法做实时综合检索。\n\n请在 Vercel 项目 Settings → Environment Variables 添加 ANTHROPIC_API_KEY 后重新部署。",
      refs: []
    });
  }

  const prompt = `你是一个信息策展编辑。用户搜索了「${q}」。

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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[search] claude error", res.status, errText);
      return json({
        title: `关于「${q}」`,
        body: `AI 服务暂时不可用（${res.status}）。请稍后再试，或在看板里浏览已聚合的信息。`,
        refs: []
      }, 200);  // 200 让前端正常渲染降级文案
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // 解析 JSON（Claude 有时会带前后文）
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return json({
        title: `关于「${q}」`,
        body: text || "AI 返回了空内容。",
        refs: []
      });
    }
    try {
      const parsed = JSON.parse(match[0]);
      return json({
        title: parsed.title || `关于「${q}」`,
        body: parsed.body || "",
        refs: Array.isArray(parsed.refs) ? parsed.refs : []
      });
    } catch {
      return json({
        title: `关于「${q}」`,
        body: match[0],
        refs: []
      });
    }
  } catch (e) {
    console.error("[search] fetch failed", e);
    return json({
      title: `关于「${q}」`,
      body: `网络错误：${e.message}。请稍后重试。`,
      refs: []
    }, 200);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "s-maxage=300, stale-while-revalidate=60"
    }
  });
}
