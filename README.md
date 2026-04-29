# Universe · Daily Briefing

个人信息看板：每日聚合科技 / AI / 国际政治 / 中国政治 / 股票投资 / 个人学习 六大板块。

## 本地运行

```bash
# 安装依赖
npm install

# 抓取真实数据（可选：配 ANTHROPIC_API_KEY 会额外生成 AI Brief）
ANTHROPIC_API_KEY=sk-ant-xxx npm run fetch

# 启动本地服务器（不能直接双击 index.html，浏览器安全策略会拒绝 fetch）
npm run dev
# 打开 http://localhost:8765
```

## 目录结构

```
info-dashboard/
├── index.html            # 入口（HTML + CSS）
├── data.json             # 抓取生成的数据
├── js/
│   ├── data.js           # 异步加载 data.json
│   ├── state.js          # 状态管理 + 错误处理
│   └── render.js         # 所有渲染与交互
├── scripts/
│   ├── feeds.json        # RSS 源清单（按板块）
│   └── fetch.mjs         # 抓 RSS + 调 Claude → data.json
└── .github/workflows/
    └── update.yml        # 每小时自动抓数据
```

## 部署到 GitHub Pages（最省事）

### 一次性设置

1. 在 GitHub 新建一个 repo（比如 `universe-dashboard`），把这个目录 push 上去
2. 仓库 **Settings → Secrets and variables → Actions** → 新建 secret `ANTHROPIC_API_KEY`（从 https://console.anthropic.com 申请）
3. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，Branch 选 `main`，文件夹选 `/ (root)`
4. 等 1-2 分钟，访问 `https://<你的用户名>.github.io/<repo 名>/`

### 自动更新

`.github/workflows/update.yml` 每小时跑一次：抓最新数据 → 调 Claude 生成 AI Brief → 提交 `data.json`。
GitHub Pages 检测到提交后自动重新部署。

### 手动触发更新

Actions 页签 → 选 `Update Universe Data` → `Run workflow`。

## 部署到 Cloudflare Pages（推荐国内访问，无区域限制）

### 步骤

1. 代码已在 GitHub
2. 登录 https://dash.cloudflare.com → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub → 选 `naberich/Universe` → **Begin setup**
4. Build 设置：
   - Framework preset: **None**
   - Build command: （留空）
   - Build output directory: `/`
   - Root directory: `/`
5. 点 **Save and Deploy**
6. 等 1-2 分钟，会拿到 `https://universe-xxx.pages.dev`
7. `functions/api/search.js` 会自动被识别为 API 路由 `/api/search`

### 无需配置环境变量

用户自带 key，服务器不需要存 key。如果想设一个**默认 key 作为 fallback**（未填写时使用你的账户），在项目 **Settings → Variables and Secrets** 加：
- Name: `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`
- Value: 你的 key

---

## 部署到 Vercel（备选）

GitHub Pages 只能部署静态，**不能跑 `/api/search` 搜索**。想要真 AI 联网检索必须走 Vercel。

### 步骤

1. 代码已在 GitHub
2. 登录 https://vercel.com → `Add New Project` → Import 你的 `Universe` 仓库
3. Framework Preset 选 `Other`，Root Directory 保持默认（`./`），Deploy
4. 部署完成后去 **Settings → Environment Variables**：
   - Name: `ANTHROPIC_API_KEY`
   - Value: 你的 key（`sk-ant-...`）
   - Environment: 全选（Production / Preview / Development）
   - 保存后需要重新 Deploy 一次（Deployments → 最新一次 → ⋯ → Redeploy）
5. 生产 URL 形如 `https://universe-xxx.vercel.app`
6. GitHub Actions 的 workflow 依然负责每小时抓取 `data.json` 并 push；Vercel 监听 push 自动重新部署

### API 端点

- `POST /api/search` — body `{ q: "关键词" }`，返回 `{ title, body, refs[] }`（内部调用 Claude）

### GitHub Pages vs Vercel

| 功能 | GitHub Pages | Vercel |
|---|---|---|
| 静态网页展示 | ✅ | ✅ |
| 每日 RSS 抓取 | ✅ Actions | ✅ Actions |
| **实时 AI 搜索** | ❌ 不支持 | ✅ `/api/search` |
| 自定义域名 | ✅ | ✅ |
| 免费额度 | 完全免费 | 免费（个人） |

## 添加 / 调整 RSS 源

编辑 `scripts/feeds.json`，按板块加 `{ name, url, market }`。建议选择：
- 稳定、有 HTTPS 证书的官方 feed
- 不要超过 8 个/板块（过多会拉长抓取时间）
- 境内源可能需要走 [rsshub.app](https://rsshub.app) 转发

## 环境变量（GitHub Actions 用）

推荐新方式：只存一个通用 `AI_KEY`，自动识别厂商。

| 变量 | 作用 | 示例 |
|---|---|---|
| `AI_KEY` | **Secret**：任意厂商的 API key | `sk-xxx` / `sk-ant-xxx` / `abc.xyz` |
| `AI_PROVIDER` | **Variable**（可选）：指定厂商 | `deepseek` / `qwen` / `zhipu` / `anthropic` / `openai` |
| `AI_MODEL` | **Variable**（可选）：覆盖默认模型 | `deepseek-reasoner` / `qwen-max` |
| `TRANSLATE_NEWS` | 设为 `1` 开启英文新闻批量中文翻译 | `1` |

自动识别规则（不填 `AI_PROVIDER` 时）：
- `sk-ant-` 开头 → Anthropic Claude
- 含点号（如 `abc.xyz`）→ 智谱 GLM
- 其他 `sk-` 开头 → 默认按 DeepSeek 处理

**切换厂商只需要改 Secret 的 key 和（可选）Variable 的 provider，代码不用改**。

### 默认模型

| Provider | 默认模型 |
|---|---|
| `deepseek` | `deepseek-chat` |
| `qwen` | `qwen-turbo` |
| `zhipu` | `glm-4-flash` |
| `anthropic` | `claude-haiku-4-5-20251001` |
| `openai` | `gpt-4o-mini` |

### 向后兼容

原 `ANTHROPIC_API_KEY` 仍然生效，作为 `AI_KEY` 的 fallback。

## License

私人项目。
