# Handoff: Super-Go 主界面重设计（对局台 / Match Console）

## Overview

Super-Go 是一款桌面下棋软件（Electron，macOS + Windows），支持**围棋**与**中国象棋**，可接引擎对局、分析与「连线」（识别外部棋盘并同步）。

本次重设计的目标是让界面像一款**游戏**而不是传统工具软件。交付范围是**主界面**：窗口层 + 顶栏 + 棋盘区 + 侧栏。核心改动有三点：

1. **底部状态栏取消**，原有 6 项指标（引擎、状态、强度、访问量/深度、用时、胜率）全部并入侧栏顶部的仪表区；
2. **主操作下沉**到棋盘下沿的**浮动 dock**（新对局/悔棋/暂停/虚手/最佳选点/估目/认输），顶栏只保留棋种切换、引擎状态与窗口级开关（连线/缩放/侧栏/设置/置顶/引擎执方）；
3. 视觉语言换成**赛博 HUD**：暗底 + 青色主强调 + 洋红次强调、mono 数字、遥测条、扫描线。提供**暗色 / 亮色**两套主题。

## About the Design Files

本包内的 `Super-Go UI.dc.html` 是**设计参照（design reference）**，用 HTML 做的高保真原型，用来表达最终的视觉与布局意图——**不是可以直接搬进产品的生产代码**。

任务是把这些设计**在现有代码库的既有环境里重建**：仓库 `wuxihuhong/super-go` 的渲染层是 React + TypeScript（`packages/app/src/renderer/`），样式走 `styles/tokens.css` 的 CSS 变量。请沿用该项目已有的组件划分、变量命名与状态管理方式，把原型里的数值落到对应的 token 与组件上；不要引入原型里为了独立运行而写的内联样式写法。

原型中的 3D 棋盘用 CSS `perspective` + `rotateX` 近似表达最终观感，仅供确认视角与透视强度；产品里的棋盘渲染沿用现有实现（`GoBoard3D.tsx` / `Board3D.tsx`），按本文档的色值与标记样式调整即可。

## Fidelity

**高保真（hi-fi）**。颜色、字号、字重、圆角、间距、阴影均为最终值，请按 `TOKENS.md` 与本文档的数值实现。唯一例外是上面提到的棋盘 3D 渲染方式，以及示例数据（棋局、着法、胜率数字都是占位内容，接真实数据）。

## Screens / Views

原型共 8 格，是 **2 主题 × 2 棋种 × 2 平台** 的完整矩阵。编号规则 `主题+棋种+平台`：

| 编号 | 主题 | 棋种 | 平台 |
| --- | --- | --- | --- |
| `dgm` | 暗色 | 围棋 | macOS |
| `dgw` | 暗色 | 围棋 | Windows |
| `dcm` | 暗色 | 象棋 | macOS |
| `dcw` | 暗色 | 象棋 | Windows |
| `lgm` | 亮色 | 围棋 | macOS |
| `lgw` | 亮色 | 围棋 | Windows |
| `lcm` | 亮色 | 象棋 | macOS |
| `lcw` | 亮色 | 象棋 | Windows |

八格的**功能、按钮集合、侧栏结构完全一致**，差异只在主题色、棋盘、以及窗口层（见「平台差异」）。窗口设计尺寸 **1280 × 812**，布局需随窗口缩放自适应（侧栏定宽、棋盘区吸收剩余空间）。

### 整体结构

```
┌───────────────────────────────────────────────────────┐
│ 窗口层（mac 单行 52px / Windows 32px 标题栏 + 52px 命令栏） │
├──────────────────────────────────┬────────────────────┤
│ 棋盘区（flex:1，overflow:hidden）  │ 侧栏 348px 定宽      │
│   · 左上角对局元信息               │   · 胜率/优势仪表     │
│   · 棋盘（居中，预留 dock 空间）    │   · 遥测条 ×4        │
│   · 浮动 dock（吸底 16px，居中）    │   · 着法表（flex:1）  │
│                                  │   · 连线面板（条件）   │
│                                  │   · 评估走势（条件）   │
└──────────────────────────────────┴────────────────────┘
```

外层：`display:flex; flex-direction:column`，内层 `flex:1; display:flex; min-height:0`。

---

### 1. 窗口层（Window chrome）

#### macOS（`*m`）— 单行 52px

`height:52px; display:flex; align-items:center; gap:10px; padding:0 12px;`
`background: var(--chrome); border-bottom:1px solid var(--line);` `z-index:5`

从左到右：

| 元素 | 规格 |
| --- | --- |
| 交通灯 | 3 × 12px 圆点，`gap:8px`，色值 `#ff5f57` / `#febc2e` / `#28c840`。实际实现用系统 `titleBarStyle:'hiddenInset'`，不要自绘 |
| 棋种切换 | 见下方「棋种切换」 |
| 品牌锁定 | **绝对居中**（`left:50%; transform:translateX(-50%)`）：`app-icon.svg` 18px（`border-radius:4px`）+ 文字 `SUPER—GO`，`font:700 15px/1 Chakra Petch; letter-spacing:.24em; color:var(--txt)`；暗色加 `text-shadow:0 0 22px rgba(77,232,255,.55)`，亮色无 |
| 右侧组（`margin-left:auto; gap:9px`） | 引擎状态 chip → 引擎执方 → 窗口工具组 |

#### Windows（`*w`）— 32px 标题栏 + 52px 命令栏

**标题栏** `height:32px; display:flex; align-items:stretch; background:var(--win-title)`

- 左侧（`padding-left:12px; gap:9px; white-space:nowrap`）：`app-icon.svg` 16px + `Super-Go`（`12px/600`，`var(--dim)`）+ 1px 竖分隔（`height:14px`，`var(--line)`，`margin:0 3px`）+ 对局副标题（`12px`，`var(--dim2)`）
  - 副标题内容：围棋 `围棋 · 19×19 · 第 34 手`；象棋 `象棋 · 中炮对屏风马 · 第 8 回合`
- 右侧系统按钮：3 × **46 × 32**，字号 `─` 11px / `▢` 10px / `✕` 11px，颜色 `var(--win-btn)`
  - hover：`─`/`▢` 底色 `rgba(255,255,255,.06)`（亮色 `rgba(13,74,96,.06)`）；`✕` 底色 `#c42b1c`、图标转白
  - 用系统边框还是自绘由实现决定；若自绘务必保持 46×32 命中区

**命令栏** `height:52px; display:flex; align-items:center; gap:9px; padding:0 12px; border-bottom:1px solid var(--hair)`
左侧棋种切换，右侧 `margin-left:auto` 放引擎 chip + 引擎执方 + 窗口工具组（与 mac 右侧完全一致）。

#### 棋种切换（两平台相同）

外框 `display:flex; padding:2px; border-radius:9px; border:1px solid var(--grp-line)`，底色暗 `#0a121b` / 亮 `#e7eff4`。
两个分段 `padding:5px 13px; border-radius:7px; font-size:12px`：

- 选中：`font-weight:700; color:var(--acc-on); background:var(--acc-solid); box-shadow:var(--acc-glow)`
- 未选：`font-weight:600; color:var(--dim2)`

#### 引擎状态 chip

`height:30px; padding:0 12px; border-radius:7px; background:var(--acc-bg); border:1px solid var(--line); gap:8px; white-space:nowrap`
内含 6px 圆点（`var(--acc)`，暗色加 `box-shadow:0 0 8px var(--acc)`，`animation:pulse 1s ease-in-out infinite`）+ 引擎名 `font:600 11px JetBrains Mono; color:var(--acc)`。

**状态映射**（沿用 `lib/engineStatusText.ts`，不要自造文案）：

| 状态 | 圆点色 | 动画 | 文案示例 |
| --- | --- | --- | --- |
| 思考中 | `--acc` | pulse | `KataGo b18` / `Pikafish · 3133` |
| 空闲 | `--dim2` | 无 | 同上 |
| 未找到引擎 / 崩溃 | `--danger` | 无 | 按现有文案 |

> 注意：「未找到引擎」与「显示深度/评估值」互斥，不要同时出现。

#### 引擎执方 + 窗口工具组

两组均为 `group` 容器：`display:flex; align-items:center; gap:2px; padding:3px; background:var(--grp); border:1px solid var(--grp-line); border-radius:10px`

组内按钮统一 **30 × 30**，`border-radius:8px`，图标 15px（`stroke-width:1.8`，`stroke-linecap/linejoin:round`）：

- 默认 `color:var(--dim)`，背景透明
- hover `background:var(--acc-bg)`（10% 不透明度过渡 120ms）
- 激活/开启 `background:var(--acc-bg); color:var(--acc)`
- 危险态 `color:var(--danger-txt)`，hover 底 `var(--danger-bg)`

**引擎执方组**（2 枚）：内含 12px 圆点表示执方颜色。围棋：黑（`--dot-b` + `--dot-b-shadow`）/ 白（`--dot-w`）；象棋：红（`--dot-r`）/ 黑。当前由引擎执的一方 `background:var(--acc-bg)`。

**窗口工具组**（5 枚，顺序固定）：连线 `link` → 棋盘缩放 `zoom` → 侧栏 `panel` → 设置 `gear` → 窗口置顶 `pin`。
原型中的状态示例：连线开启（`--ok-txt` + `--acc-bg`）、侧栏展开（`--acc`）。

---

### 2. 棋盘区

`position:relative; flex:1; display:flex; align-items:center; justify-content:center;`
**`padding:30px 0 96px`** — 底部 96px 是给 dock 预留的流内空间，**这一条很关键**：dock 是 `position:absolute` 吸底，若不预留，Windows 因窗口层高 32px 会导致棋盘被 dock 压住。
`background:var(--area); overflow:hidden`

叠加两层装饰（`pointer-events:none`）：

1. 扫描线：`repeating-linear-gradient(to bottom, var(--scan) 0 1px, transparent 1px 3px)`，铺满
2. 扫掠光：顶部 80px 高 `linear-gradient(var(--sweep), transparent)`，`animation: sweep 5.5s linear infinite`（`translateY(-100%) → translateY(400%)`）

**左上角对局元信息** `position:absolute; top:16px; left:22px; display:flex; flex-direction:column; gap:5px`
两行 `font:600 9.5px JetBrains Mono; letter-spacing:.22em; color:var(--dim2)`，第二行 `opacity:.7`：

- 围棋：`BOARD 19×19 · KOMI 7.5` / `MOVE 34 · BLACK TO PLAY`
- 象棋：`OPENING 中炮对屏风马 · ROUND 8` / `RED TO PLAY · ENGINE PLAYS BLACK`

#### 围棋盘

19×19，格距 **34px**，盘面 612 × 612。木盘 `padding:26px; border-radius:4px; background:var(--slab); box-shadow:var(--slab-shadow)`。透视 `perspective:1600px; perspective-origin:50% 50%; transform:rotateX(20deg) scale(.86)`。

- 格线 `var(--gline)` 1px；盘面右/下补 `inset -1px -1px 0 var(--gline)`
- 暗色盘面额外 `inset 0 0 60px rgba(77,232,255,.07)` 内发光
- 星位 9 个，5px 圆点，`var(--hoshi)`
- 棋子 **29px** 圆，`box-shadow:var(--stone-shadow)`
  - 黑 `radial-gradient(circle at 36% 26%, #2b3d4d, #0a1219 62%, #030608)`（亮色见 TOKENS）
  - 白 `radial-gradient(circle at 36% 26%, #ffffff, #c9e6ef 60%, #7fa6b4)`
- **最后一手**：34px 圆环，`border:1.5px solid var(--m-last)`，`box-shadow:var(--m-last-shadow)`
- **引擎候选点**：30px 圆，`background:var(--m-best-bg); border:1.5px solid var(--m-best)`，中心显示访问量 `font:700 10px JetBrains Mono; color:var(--m-best-text)`，最佳点加 `box-shadow:var(--m-best-shadow)`
- **次优候选**：同尺寸，改用 `--m-good*` 一组；更弱的候选用 `border-style:dashed`

#### 象棋盘

9 列 × 10 行，格距 **63px**，盘面 504 × 567。木盘 `padding:30px 26px`，透视同上，`scale(.84)`。

- 楚河汉界：`box-sizing:border-box`（**必须**，否则宽度溢出盘面）；`left:1px; top:253px; width:502px; height:61px; background:var(--river)`；两侧文字 `楚河` / `汉界`，`font:400 19px Chakra Petch; letter-spacing:.42em; color:var(--river-text)`，`padding:0 56px; justify-content:space-between`
- 九宫斜线：两个 126 × 126 容器（上 `top:0`、下 `top:441px`，均 `left:189px`），`overflow:hidden`，各含两条 `178.2px × 1px` 线（`var(--gline)`），`transform-origin:0 0`，分别 `rotate(45deg)`（起点 `top:0`）与 `rotate(-45deg)`（起点 `top:126px`）
- 棋子 **54px** 圆，`background:var(--piece); box-shadow:var(--piece-shadow)`，字 `font:600 26px Chakra Petch`；黑方 `var(--piece-black-text)`、红方 `var(--piece-red-text)`
- 最后一手：58px 圆环，`border:1.5px solid var(--m-last)`

#### 浮动 dock

`position:absolute; bottom:16px; left:50%; transform:translateX(-50%);`
`display:flex; align-items:center; gap:4px; padding:6px; border-radius:14px;`
`background:var(--dock); border:1px solid var(--line); box-shadow:var(--dock-shadow);`
`backdrop-filter:blur(22px) saturate(1.3)`

按钮顺序与规格：

| 序 | 按钮 | 规格 |
| --- | --- | --- |
| 1 | **新对局** | 胶囊：`height:36px; padding:0 14px 0 11px; border-radius:11px; background:var(--acc-solid); color:var(--acc-on); font-size:12.5px; font-weight:700; gap:7px; box-shadow:var(--acc-glow)`，含 16px `plus` 图标 |
| 2 | 悔棋 | 36 × 36，`border-radius:11px`，图标 17px |
| 3 | 暂停引擎 | 同上 |
| — | 分隔 | 1px × 22px，`var(--line)`，`margin:0 4px` |
| 4 | 虚手（仅围棋） | 同上，内容为文字 `P`（`font:700 13px mono`） |
| 5 | 最佳选点（仅围棋） | 同上，`target` 图标，示例为开启态 |
| 6 | 估目（仅围棋） | 同上，文字 `目`（`font:700 15px`） |
| 4′ | 关于（仅象棋） | 同上，`info` 图标 |
| 5′ | 设置（仅象棋） | 同上，`gear` 图标 |
| — | 分隔 | 同上 |
| 7 | 认输 | 同上，`color:var(--danger-txt)`，hover 底 `var(--danger-bg)` |

**按钮不带任何键位标注**——保持小巧。快捷键走**悬浮 tooltip**：延迟 ~400ms 出现，内容「功能名 + 键位」（例：`悔棋 ⌘⇧Z` / `悔棋 Ctrl+Z`）。

---

### 3. 侧栏

`width:348px; flex:none; display:flex; flex-direction:column;`
`background:var(--sidebar); border-left:1px solid var(--line)`

侧栏由上到下 5 块。**它同时承担原底部状态栏的全部职责**，不要再保留底栏。

#### 3.1 胜率 / 优势仪表

`padding:16px 18px 14px; border-bottom:1px solid var(--hair)`

**围棋**：左右两列（`display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:10px`）

- 左：标签 `BLACK WIN`（`font:600 9.5px mono; letter-spacing:.2em; color:var(--dim2)`）+ 数值 `61.4`（`font:700 32px/1 mono; color:var(--acc); text-shadow:var(--glow-text)`）+ `%`（12px, `--dim2`）
- 右：`WHITE WIN` + `38.6`（`font:700 20px/1 mono; color:var(--pink-txt)`）+ `%`
- 条：`height:8px; border-radius:2px; border:1px solid var(--line); background:var(--track)`；黑段宽度 = 胜率%，`background:var(--bar-black); box-shadow:var(--bar-black-glow)`；白段 `flex:1; background:var(--bar-white)`

**象棋**：

- 左：`RED ADVANTAGE` + `+1.24`（`font:700 30px/1 mono; color:var(--pink-txt); white-space:nowrap`）
- 右：`DEPTH` + `28`（`font:700 20px/1 mono; color:var(--txt)`）
- 条：同尺寸，红方优势从左侧填充 `var(--bar-white)`（洋红渐变），中点 1px 竖线 `var(--line)` 标均势

#### 3.2 遥测条 ×4

`padding:12px 18px; border-bottom:1px solid var(--hair); display:flex; flex-direction:column; gap:9px`

每行：标题行 `display:flex; justify-content:space-between; font:600 9.5px mono; letter-spacing:.14em; margin-bottom:4px`（键 `var(--dim2)`，值 `var(--txt)`）；下方进度 `height:3px; border-radius:2px; background:var(--tele-track)`，填充条同高。

| 棋种 | 4 项 | 填充色 |
| --- | --- | --- |
| 围棋 | `VISITS` / `PLAYOUTS/S` / `LEAD` / `THINK TIME` | 前二 `--tele`，LEAD 洋红渐变，TIME 绿渐变 |
| 象棋 | `NODES` / `NPS` / `EVAL` / `MOVE TIME` | 同上对应 |

#### 3.3 着法表（可跳转）

`flex:1; display:flex; flex-direction:column; min-height:0`

- 表头行：`padding:12px 18px 6px`，左 `MOVE LOG`（`font:600 9.5px mono; letter-spacing:.2em; color:var(--dim2)`），右计数（围棋 `34 PLY` / 象棋 `8 ROUNDS`）
- 列头：`padding:0 20px 5px 18px; font:600 9.5px mono; letter-spacing:.12em; color:var(--dim2)`；列宽 序号 24px / 先手 `flex:1` / 后手 `flex:1` / 评估 44px 右对齐
  - 围棋 `BLACK` / `WHITE`；象棋 `RED` / `BLACK`
- 滚动区：`flex:1; min-height:0; overflow-y:auto; padding:0 10px`
- 行：`display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:5px; font:400 11.5px mono; border-left:2px solid transparent`
  - 序号 `var(--dim2)`；先手列 围棋 `var(--txt)` / 象棋 `var(--pink-txt)`；后手列 `var(--dim)`
  - 评估列：正值 `var(--eval-pos)`，负值 `var(--eval-neg)`，空 `var(--eval-none)`
  - hover：`background:var(--acc-bg)` 的一半不透明度
  - **当前手**：`background:rgba(77,232,255,.12)`（亮色 `rgba(13,116,144,.1)`）+ `border-left-color:var(--acc)`
- 点击任意行 → 跳转到该手局面（复盘）
- Windows 需要细滚动条：宽 3px，滑块 `var(--scroll)`，`border-radius:2px`（mac 用系统 overlay 滚动条）

> ⚠ 亮色主题必须用亮色版评估色（`--eval-pos:#1a7a45` / `--eval-neg:#b1432f`）。暗色的 `#6fb98f` 在白底上只有 2.3:1，不合格。

#### 3.4 连线面板（连线开启时显示）

`margin:0 12px 10px; padding:11px 12px; border-radius:9px; background:var(--ok-bg); border:1px solid var(--ok-line)`

- 标题行：6px 圆点（`var(--ok)`，暗色加 `box-shadow:0 0 8px var(--ok)`，pulse 1s）+ `LINKER · SCANNING`（`font:700 10.5px mono; letter-spacing:.14em; color:var(--ok-txt)`）+ 右侧 `12FPS 34MS`（`font:600 9.5px mono; color:var(--dim2)`）
- 详情行：`font:400 10.5px mono; color:var(--dim); white-space:nowrap`
  - mac：`SYNCED 34 · ORIENT NORMAL · ESC ABORT`
  - Windows：`SYNCED 34 · AUTOPLAY ON · ESC ABORT`（后台落子仅 Windows 支持）
- 按钮行 `gap:6px`，两枚等宽：`STOP`（`background:var(--danger-bg); border:1px solid var(--danger-line); color:var(--danger-txt)`）/ `PAUSE`（`border:1px solid var(--line); color:var(--dim)`），均 `padding:6px 0; border-radius:6px; font:600 10.5px mono`

面板需覆盖 `LinkerLiveStatus.tsx` 现有的全部状态（未连接 / 校准 / 扫描 / 暂停 / 错误），配色分别对应 `--dim2` / `--acc` / `--ok` / `--dim` / `--danger`，文案沿用现有实现。

#### 3.5 评估走势（可折叠）

`padding:10px 18px 14px; border-top:1px solid var(--hair)`
标题行 `EVAL TREND` + 右侧当前值（`font:600 9.5px mono; letter-spacing:.2em; color:var(--dim2)`）。
折线图 `viewBox="0 0 300 58"`，`preserveAspectRatio:none`：中线 `var(--line)` 1px `dasharray 2 4`；折线 `stroke-width:2; fill:none; stroke-linejoin:round`，围棋 `var(--acc)`、象棋 `var(--pink)`。

---

## Interactions & Behavior

| 交互 | 行为 |
| --- | --- |
| 按钮 hover | 底色渐入，`transition:background 120ms ease` |
| 按钮 active | `transform:scale(.96)`，80ms |
| Tooltip | 悬停 400ms 后出现，内容「功能名 + 平台化快捷键」 |
| 落子 | 棋子 140ms `cubic-bezier(.2,.8,.3,1)` 由 `scale(.86)` + `opacity:0` 落定；同时最后一手圆环 200ms 淡入 |
| 提子（象棋吃子/围棋提子） | 120ms `scale(.8)` + 淡出 |
| 棋种切换 | 分段滑块 180ms `ease-out` 位移；棋盘交叉淡入淡出 220ms |
| 侧栏收展 | 宽度 348px ↔ 0，240ms `cubic-bezier(.4,0,.2,1)`；内容同步淡出，避免挤压回流 |
| 引擎思考中 | 状态圆点 + 遥测条实时刷新（节流 ≥100ms，避免抖动） |
| 候选点出现 | 交错淡入，每个延迟 30ms |
| 连线扫描 | 扫掠光条持续动画；FPS/延迟数字实时更新 |
| 认输 / 新对局（对局中） | 二次确认弹窗 |
| 主题切换 | 跟随系统，可手动覆盖；切换时 200ms 颜色过渡 |
| `prefers-reduced-motion` | 关闭扫掠光、pulse 与落子动画，仅保留不透明度过渡 |

**响应式**：侧栏定宽 348px；窗口宽度 < 1100px 时侧栏自动收起（可手动展开覆盖在棋盘上）。棋盘按可用空间等比缩放，始终保留 dock 的 96px 底部余量。

## State Management

沿用渲染层现有 store，本设计新增/依赖的状态：

| 状态 | 类型 | 说明 |
| --- | --- | --- |
| `theme` | `'dark' \| 'light' \| 'system'` | 主题，默认 `system` |
| `gameKind` | `'go' \| 'xiangqi'` | 棋种 |
| `sidebarOpen` | `boolean` | 侧栏展开 |
| `alwaysOnTop` | `boolean` | 窗口置顶 |
| `boardScale` | `number` | 棋盘缩放 |
| `engineSide` | `'black' \| 'white' \| 'red' \| null` | 引擎执方 |
| `engineStatus` | 见 `engineStatusText.ts` | 驱动 chip 与侧栏状态 |
| `analysis` | `{ winrate, lead, visits, playouts, depth, candidates[] }` | 仪表 + 遥测 + 候选点 |
| `moves` | `Move[]` | 着法表；`currentIndex` 决定高亮行与盘面 |
| `linker` | `{ state, fps, latencyMs, syncedMoves, autoplay }` | 连线面板 |
| `showEvalTrend` | `boolean` | 走势图折叠 |

数据获取：引擎经现有 IPC 通道；连线状态由主进程推送。着法表点击只改 `currentIndex`，不发引擎请求。

## Design Tokens

见同目录 **`TOKENS.md`** —— 暗色/亮色两套完整变量，按 `styles/tokens.css` 的命名风格给出，可直接并入。

字体（需随包或改为本地字体）：

- 显示 / UI：**Chakra Petch** 500/600/700
- 数字 / 等宽：**JetBrains Mono** 400/600/700 —— 所有数字、代号、坐标、遥测值一律用它，并开启 `font-variant-numeric: tabular-nums`
- 中文回退：`'PingFang SC'`（mac）/ `'Microsoft YaHei'`（Windows）
- Windows 系统 UI 文本可回退 `'Segoe UI Variable Text', 'Segoe UI'`

最小字号：9.5px 仅用于全大写 + 加宽字距的标签；正文不低于 11.5px。

## Assets

| 资源 | 来源 | 说明 |
| --- | --- | --- |
| `app-icon.svg` | 仓库 `packages/app/src/renderer/assets/app-icon.svg` | 品牌标记，本包已附。窗口层用 16px（Windows）/ 18px（mac），圆角 4px |
| 图标集 | 仓库 `renderer/components/icons.tsx` | 本包 HTML 内的 `<symbol>` 是等价重绘，实现时**用仓库现有图标组件**，只需统一 `stroke-width:1.8`、`stroke-linecap/linejoin:round`、尺寸 15px（顶栏）/ 17px（dock） |

无位图资源，无第三方图标库依赖。

## Files

| 文件 | 说明 |
| --- | --- |
| `Super-Go UI.dc.html` | 8 格高保真设计参照，可直接在浏览器打开；页面可平移缩放，每格左上角有编号（`dgm` … `lcw`） |
| `TOKENS.md` | 暗色/亮色设计 token 对照表 |
| `app-icon.svg` | 品牌标记 |
| `README.md` | 本文档 |

对应的产品代码位置（供实现时定位）：

| 设计部分 | 仓库文件 |
| --- | --- |
| 顶栏 / 命令栏 | `renderer/components/Toolbar.tsx` |
| 浮动 dock（新增） | 建议新建 `renderer/components/BoardDock.tsx` |
| 侧栏 | `renderer/components/SidePanel.tsx` |
| 原底部状态栏（**移除**，内容并入侧栏） | `renderer/components/StatusBar.tsx` |
| 连线面板 | `renderer/components/LinkerLiveStatus.tsx` |
| 棋盘 | `renderer/components/GoBoard3D.tsx` / `Board3D.tsx` |
| 主题变量 | `renderer/styles/tokens.css` |
| 快捷键文案 | `renderer/lib/shortcuts.ts`（mac `⌘⇧X` / 其他 `Ctrl+X`） |
| 引擎状态文案 | `renderer/lib/engineStatusText.ts` |
