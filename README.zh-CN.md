# Token Insight

[English README](./README.md)

Token Insight 是一个本地优先（local-first）的 AI 编码工具 token 使用分析系统。  
它会扫描本地产物、归一化 usage 事件、写入 SQLite，并提供支持深度筛选的可视化看板与社交分享图能力。

![Token Insight 预览](./docs/assets/token-insight-preview.png)

## 项目价值

- **默认本地运行**：不要求云端登录，不强制上传数据。
- **多来源聚合**：可汇总 Codex、Claude、Gemini、Cursor 等本地 usage 产物。
- **可操作看板**：趋势图、模型/来源排行、贡献热力图、分组来源健康度一站式查看。
- **双轴主题系统**：可切换布局主题（`console` / `dock` / `radar`）与颜色风格（`sand` / `midnight` / `frost` / `signal`）。
- **脚本化运维**：一键开发启动、生产启动、刷新、导出与分享图生成。

## 仓库结构

- [`backend`](/Volumes/dev/web/mo2g/token-usage/backend): Rust CLI + HTTP API
- [`frontend`](/Volumes/dev/web/mo2g/token-usage/frontend): React + Vite dashboard
- [`scripts`](/Volumes/dev/web/mo2g/token-usage/scripts): dev/start/export/refresh/share helpers

## 快速开始

### 环境要求

- Rust 稳定版工具链（`cargo`）
- [Bun](https://bun.sh/) 运行时

### 安装与验证

```bash
bun --cwd frontend install
cargo test --manifest-path backend/Cargo.toml
bun --cwd frontend test
bun --cwd frontend build
```

### 本地启动

```bash
./scripts/dev.sh
```

前端默认通过 Vite 输出地址（通常为 `http://localhost:5173`），后端默认监听 `http://127.0.0.1:8787`。

## 常用命令

```bash
# 类生产模式本地启动
./scripts/start.sh

# 强制全量扫描
./scripts/refresh.sh

# 导出归一化事件（CSV/JSON）
./scripts/export.sh --dataset events --format csv --output /tmp/token-events.csv

# 生成分享图
./scripts/share-image.sh --preset summary --output /tmp/token-share.png

# 生成 README 布局截图
./scripts/capture-doc-screenshots.sh
```

## 布局主题对比（科技感 UI）

| Console | Dock | Radar |
| --- | --- | --- |
| ![Console 布局](./docs/assets/dashboard-layout-console.png) | ![Dock 布局](./docs/assets/dashboard-layout-dock.png) | ![Radar 布局](./docs/assets/dashboard-layout-radar.png) |

## 隐私与数据行为

- 数据源根路径遵循各工具本地约定，缺失路径会自动跳过。
- 项目默认本地运行，不上传 usage 数据。
- 成本估算先使用内置定价快照，网络可用时会尝试刷新远端定价缓存。

## 贡献方式

贡献流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 路线图

- 持续增加来源适配器与 parser fixture。
- 补充可发布的社媒视觉素材和演示 GIF。
- 在 API 与 UX 稳定后补齐 CI 与发布自动化。


## 其他选择

- [tokendashboard](https://github.com/pdajoy/tokendashboard)

## 致谢

- [tokscale](https://github.com/junhoyeo/tokscale)
- [ccusage](https://github.com/ryoppippi/ccusage)
- [LiteLLM](https://github.com/BerriAI/litellm)
- [OpenRouter](https://openrouter.ai)
