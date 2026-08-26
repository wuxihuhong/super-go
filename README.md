# Super Go

双棋种（象棋 + 围棋）桌面对弈工具，支持本机人机对弈与连线代打两条核心场景。

当前进度：**象棋人机对弈已完整可用**（见下）；围棋与连线代打在开发计划中（[DESIGN.md §9](./DESIGN.md)）。

## 象棋人机对弈

- **3D 棋盘**（Three.js）：木盘 + 车削棋子 + 阴刻字 + 软阴影，固定对弈视角；可在设置中切换平面棋盘
- **棋力可选**：等级分 / 搜索深度 / 思考时长 / 节点数 / 不设限，五种模式；可设搜索线程与哈希表；对局中可随时调整
- **引擎执方任选**：执红、执黑或引擎左右互搏观战
- **评估走势图**：每一步的引擎评估折线（红方视角），着法列表与引擎信息同栏
- 完整对局控制：悔棋、认输、暂停、复盘跳转、终局悔棋复活
- 走子 / 吃子 / 将军 / 终局音效（可关），中 / 英 / 日界面，浅 / 深 / 跟随系统主题
- 窗口置顶开关（连线代打时压在第三方平台之上）
- 内置 [Pikafish](https://github.com/official-pikafish/Pikafish) 引擎，安装包开箱即用

## Pikafish 引擎参数

随包引擎为 **Pikafish 2026-01-31**（[官网](http://pikafish.com) / [Wiki：UCI 选项](https://www.pikafish.com/wiki/index.php?title=UCI%E9%80%89%E9%A1%B9)）。下面按本机 `uci` 握手列出全部选项与默认值。

**本软件会改棋力，以及搜索线程 / 哈希表。** 设置里的五种模式对应：

| Super Go 棋力 | 实际下发给引擎的 |
| --- | --- |
| 等级分 | 打开 `UCI_LimitStrength`，并设 `UCI_Elo`（1280–3133） |
| 搜索深度 | 满强度；用 `go depth` 限制层数 |
| 思考时长 | 满强度；用 `go movetime` 限制每步毫秒 |
| 节点数 | 满强度；用 `go nodes` 限制节点 |
| 不设限 | 关掉 `UCI_LimitStrength`，不限制搜索 |
| 搜索线程 / 哈希表 | `Threads` / `Hash`（引擎级，对局结束不复位） |

其余选项一律用引擎出厂默认（下表「默认」列）。对局结束会把强度复位为满强度，避免放水粘在分析上；线程与哈希保持用户设置。

放水（等级分 / Skill Level）只影响**出哪一步**，分析分数仍按满强度计算。

### 棋力

| 选项 | 类型 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `UCI_LimitStrength` | 开关 | 关 | — | 打开后 `UCI_Elo` 生效，并让 `Skill Level` 失效 |
| `UCI_Elo` | 整数 | 1280 | 1280–3133 | 天梯校准的拟人等级分；越低越弱。1280 ≈ Skill 0，1777 ≈ 4，2268 ≈ 7，2568 ≈ 10，2850 ≈ 13，3133 ≈ 19 |
| `Skill Level` | 整数 | 20 | 0–20 | 粗档放水（非 20 时内部 MultiPV=4）。本软件不改此项，只用 `UCI_Elo` |

### 循环棋规与限招

象棋和棋/长将不按国际象棋判。引擎在搜索里就按所选规则给分，**长将默认视为将军方违规**，满强度一般不会把「车进一将军、将进一、车退一、将退一」循环走穿。本软件本地规则层不裁判长将，终局仍以绝杀/困毙为准；连线时平台会按自己的棋规判。

| 选项 | 类型 | 默认 | 取值 | 说明 |
| --- | --- | --- | --- | --- |
| `Repetition Rule` | 枚举 | **AsianRule** | 见下 | 循环着法（长将 / 长捉等）怎么判 |
| `Mate Threat Depth` | 整数 | 10 | 0–10 | 仅 `ChineseRule` 有效：判断「杀」的回合数。0 = 不判断杀；越高棋力下降越明显 |
| `Sixty Move Rule` | 开关 | **开** | — | 自然限招：长时间不吃子按和（0 分） |
| `Rule60MaxPly` | 整数 | **120** | 1–150 | 限招步数。120 = 60 回合，与天天象棋一致。调太小棋力会漂 |
| `Draw Rule` | 枚举 | **None** | 见下 | 把「和」改算成某方胜，只适合拆棋，会扭曲分数 |

`Repetition Rule`：

| 值 | 含义 |
| --- | --- |
| **AsianRule**（默认） | 亚规。严重级：长将 > 长捉同一子 > 其它。**2-fold**（同一局面第 2 次即判）。多数网络平台接近此规 |
| ChineseRule | 简化中规（本质仍是亚规改版）。严重级：长将 > 长捉/长杀/将杀·将捉·杀捉循环 > 其它。中规条文模糊，无法完整程序化 |
| ComputerRule | 作者《中国象棋程序竞赛规则》。更贴亚规图例，**3-fold**（第 3 次才判），和常见网规有差别 |
| SkyRule | 部分网规（亚规微调），不是中规 |
| YitianRule | 弈天平台 |
| AllowChase | 只禁长将，其它循环都允。优势残局拆棋、想躲开循环争议时用 |
| NoJudgement | 循环不作裁决 |

`Draw Rule`：`None`（正常）/ `DrawAsBlackWin` / `DrawAsRedWin`（一切和棋算该方胜）/ `DrawRepAsBlackWin` / `DrawRepAsRedWin`（仅循环和算该方胜）。改完拆棋后务必改回 `None`。

### 搜索与显示

| 选项 | 类型 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `Threads` | 整数 | 1 | 1–本机 CPU 核数 | 搜索线程。可在棋力设置中改（引擎协议上限 1024，本软件按核数钳制） |
| `Hash` | 整数 | 16 | 1–33554432 | 置换表 MB。可在棋力设置中改（界面上限 32768 MB） |
| `Clear Hash` | 按钮 | — | — | 清空置换表 |
| `Ponder` | 开关 | 关 | — | 后台思考（对方时钟仍走时继续算） |
| `MultiPV` | 整数 | 1 | 1–128 | 同时计算几条主变。调高会降棋力，只适合拆棋 |
| `Move Overhead` | 整数 | 30 | 0–5000 | 通信/界面耗时余量（毫秒），防超时 |
| `nodestime` | 整数 | 0 | 0–10000 | 按节点折算时间；0 = 不用 |
| `ScoreType` | 枚举 | **Elo** | Elo / PawnValueNormalized / Raw | 只影响显示分，不影响棋力。Elo = 按胜率模型换算（约 200 分对应自对弈快棋 76% 胜率） |
| `LU_Output` | 开关 | 开 | — | 同一深度是否多次输出上下界；不影响棋力 |
| `EvalFile` | 字符串 | `pikafish.nnue` | — | NNUE 权重路径，一般与引擎同目录 |
| `Debug Log File` | 字符串 | 空 | — | 调试日志文件 |
| `NumaPolicy` | 字符串 | auto | — | 多路 CPU 绑核；一般不用改 |

### Windows 二进制怎么选

安装包会按 CPU 自动挑；自行替换时大致由快到慢：

`vnni512` > `avx512icl` / `avx512` > `avxvnni` > `bmi2` > `avx2` > `sse41-popcnt`

选本机能跑的最新一档即可。权重文件 `pikafish.nnue` 必须和可执行文件放在同一目录。

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
