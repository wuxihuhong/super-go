# Super-Go

双棋种（围棋 + 象棋）对弈工具。权威设计文档：[DESIGN.md](./DESIGN.md)。

## 环境

- Node ≥ 22，pnpm ≥ 10
- 仓库布局：pnpm workspaces 双包

```
packages/core   @super-go/core   领域内核（Game 接口 / MoveTree / 对弈状态机 / 象棋规则·FEN·记谱·PGN·Zobrist），零 Electron 依赖，Node 直接单测
packages/app    @super-go/app    Electron 壳（main / preload / renderer，electron-vite + React + Tailwind）
engines/chess/                   Pikafish 发行包（gitignore；放入即用，见下）
```

## 象棋引擎（P1）

- 引擎放 `engines/chess/<发行包>/`（如 `pikafish-20260131/MacOS/pikafish-apple-silicon`），main 进程按平台自动探测；用户可在设置 `engine.path` 覆盖。
- 引擎必须与其 NNUE 权重同目录（`EvalFile` 默认相对路径），适配器以二进制目录为 cwd 启动。
- 无引擎时 UI 进入"未找到引擎"状态，单测自动 skip，不阻塞门禁。

## 常用命令

```bash
pnpm install        # 安装（首次会下载 Electron 二进制）
pnpm dev            # 启动开发模式（HMR）
pnpm build          # 生产构建（输出 packages/app/out/）
pnpm test           # vitest（core 单测 + app 协议/引擎集成测试；无引擎自动 skip 引擎部分）
pnpm typecheck      # 全仓 TypeScript 检查
pnpm lint           # ESLint
pnpm gate           # 门禁 = typecheck + lint + test
pnpm format         # Prettier 格式化
```

## 分层铁律（详见 AGENTS.md）

- `core` 零 Electron 依赖、零运行时依赖——这是"core 可在 Node 直接单测"门禁的检验标准。
- 引擎进程、识别推理、原生 IO 全在 main 进程；renderer 只经 IPC 拿数据。
- `LinkerService` 是全项目唯一允许平台耦合的模块。
- UI 文案一律走路由键资源包（`packages/app/src/renderer/i18n/`），禁止硬编码；
  颜色一律走语义 token（`styles/tokens.css`），禁止硬编码色值，Canvas 棋盘消费同一套。
- 强度档生命周期绑定对局：对局结束/中断立即复位满强度（MatchService 统一管理，AGENTS.md 粘滞门禁）。
