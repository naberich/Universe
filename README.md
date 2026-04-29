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

## 部署到 Vercel（更快的 CDN）

1. 推到 GitHub
2. 登录 https://vercel.com → Import Project → 选你的仓库
3. Framework Preset 选 `Other`，其他默认，Deploy
4. 在 Vercel 项目 **Settings → Environment Variables** 加 `ANTHROPIC_API_KEY`（让预览环境也能跑）
5. 生产 URL：`https://<项目名>.vercel.app`
6. GitHub Actions 里的 workflow 依然负责抓取 data.json 并 push；Vercel 监听 push 自动重新部署

## 添加 / 调整 RSS 源

编辑 `scripts/feeds.json`，按板块加 `{ name, url, market }`。建议选择：
- 稳定、有 HTTPS 证书的官方 feed
- 不要超过 8 个/板块（过多会拉长抓取时间）
- 境内源可能需要走 [rsshub.app](https://rsshub.app) 转发

## 环境变量

| 变量 | 作用 | 必需 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 生成 AI Brief 摘要 | 否（无则用上次的 brief） |

## License

私人项目。
