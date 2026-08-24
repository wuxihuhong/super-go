# Super Go

双棋种（象棋 + 围棋）桌面对弈工具，支持本机人机对弈与连线代打两条核心场景。

当前进度：**象棋人机对弈已完整可用**（见下）；围棋与连线代打在开发计划中（[DESIGN.md §9](./DESIGN.md)）。

## 象棋人机对弈

- **3D 棋盘**（Three.js）：木盘 + 车削棋子 + 阴刻字 + 软阴影，固定对弈视角；可在设置中切换平面棋盘
- **棋力可选**：等级分 / 搜索深度 / 思考时长 / 节点数 / 不设限，五种模式；对局中可随时调整
- **引擎执方任选**：执红、执黑或引擎左右互搏观战
- **评估走势图**：每一步的引擎评估折线（红方视角），着法列表与引擎信息同栏
- 完整对局控制：悔棋、认输、暂停、复盘跳转、终局悔棋复活
- 走子 / 吃子 / 将军 / 终局音效（可关），中 / 英 / 日界面，浅 / 深 / 跟随系统主题
- 窗口置顶开关（连线代打时压在第三方平台之上）
- 内置 [Pikafish](https://github.com/official-pikafish/Pikafish) 引擎，安装包开箱即用

## 下载与运行

从源码构建安装包（macOS dmg / Windows 安装程序，自动携带引擎）：

```bash
pnpm install
pnpm build-app          # 产物在 packages/app/dist/
```

或直接运行开发版：

```bash
pnpm dev                # Electron 开发模式
```

## 开发

- Node ≥ 22、pnpm ≥ 10
- `pnpm test` 单测（规则 / 协议 / 引擎集成）；`pnpm gate` = typecheck + lint + test
- `pnpm dev:web` 浏览器模式调试 UI（无 Electron，自动注入 mock 后端，<http://localhost:5174>）

```
packages/core   领域内核：规则 / 记谱 / 对弈状态机 / 着法树，零依赖纯 TS
packages/app    Electron 应用：main（引擎进程 / IPC）、renderer（React UI）
engines/chess/  象棋引擎发行包（gitignore，dev 时按平台自动探测；打包版内置无需放置）
```

设计文档与开发约定见 [DESIGN.md](./DESIGN.md) 与 [AGENTS.md](./AGENTS.md)。
