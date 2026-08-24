# Super-Go

双棋种（围棋 + 象棋）对弈工具。权威设计文档：[DESIGN.md](./DESIGN.md)。

## 环境

- Node ≥ 22，pnpm ≥ 10
- 仓库布局：pnpm workspaces 双包

```
packages/core   @super-go/core   领域内核（Game 接口 / MoveTree / 对弈状态机），零 Electron 依赖，Node 直接单测
packages/app    @super-go/app    Electron 壳（main / preload / renderer，electron-vite + React + Tailwind）
```

## 常用命令

```bash
pnpm install        # 安装（首次会下载 Electron 二进制）
pnpm dev            # 启动开发模式（HMR）
pnpm build          # 生产构建（输出 packages/app/out/）
pnpm test           # vitest（core 单测）
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
  颜色一律走语义 token（`styles/tokens.css`），禁止硬编码色值。
