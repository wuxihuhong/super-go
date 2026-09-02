# Design Tokens — 对局台（Match Console）

暗色 / 亮色两套完整变量，命名沿用 `renderer/styles/tokens.css` 的风格。所有值来自设计参照 `Super-Go UI.dc.html`，可直接并入现有 token 文件。

## 用法

```css
:root { /* 暗色为默认 */ }
:root[data-theme='light'] { /* 覆盖 */ }
@media (prefers-color-scheme: light) { :root:not([data-theme]) { /* 同亮色 */ } }
```

---

## 颜色

### 底层与面板

| 变量 | 暗色 | 亮色 | 用途 |
| --- | --- | --- | --- |
| `--bg` | `#05070b` | `#eff4f8` | 窗口底色（mac） |
| `--bg-win` | `linear-gradient(150deg,#0a1119,#06090e 55%,#04060a)` | `linear-gradient(150deg,#f7fafc,#eaf1f6 55%,#e2ebf2)` | 窗口底色（Windows，Mica 感） |
| `--chrome` | `linear-gradient(#0b1119,#070b11)` | `linear-gradient(#ffffff,#f2f7fa)` | mac 顶栏 |
| `--win-title` | `rgba(77,232,255,.04)` | `rgba(255,255,255,.72)` | Windows 标题栏 |
| `--sidebar` | `linear-gradient(#0a121b,#060a10)` | `#ffffff` | 侧栏底 |
| `--panel` | `linear-gradient(#0a121b,#060a10)` | `#ffffff` | 面板底 |
| `--grp` | `#0a121b` | `#ffffff` | 按钮组容器 |
| `--area` | `radial-gradient(90% 70% at 50% 30%,#0d1926 0%,#060a10 60%,#03060a 100%)` | `radial-gradient(90% 70% at 50% 28%,#ffffff 0%,#e9f1f6 60%,#dde8ef 100%)` | 棋盘区背景 |
| `--dock` | `rgba(8,16,24,.86)` | `rgba(255,255,255,.88)` | 浮动 dock（配 `backdrop-filter`） |

### 描边

| 变量 | 暗色 | 亮色 | 用途 |
| --- | --- | --- | --- |
| `--line` | `rgba(77,232,255,.16)` | `rgba(13,74,96,.16)` | 主分隔、面板描边 |
| `--hair` | `rgba(77,232,255,.12)` | `rgba(13,74,96,.11)` | 侧栏内部细分隔 |
| `--grp-line` | `rgba(77,232,255,.13)` | `rgba(13,74,96,.13)` | 按钮组描边 |

### 文字

| 变量 | 暗色 | 亮色 | 对比度（亮色/白底） | 用途 |
| --- | --- | --- | --- | --- |
| `--txt` | `#dff1f7` | `#0c2733` | 14.8:1 | 主文字、数值 |
| `--dim` | `#8fb4c6` | `#4a6b7a` | 5.7:1 | 次要文字、图标默认色 |
| `--dim2` | `#5d7789` | `#587787` | 4.6:1 | 最小号标签、列头、序号 |

> 亮色 `--dim2` 用 `#587787`（不是更浅的 `#7d97a4`）——9.5–12px 的小字需要 ≥4.5:1。

### 强调色

| 变量 | 暗色 | 亮色 | 用途 |
| --- | --- | --- | --- |
| `--acc` | `#7df3ff` | `#0d7490` | 主强调：胜率数值、开启态图标、折线 |
| `--acc-bg` | `rgba(77,232,255,.16)` | `rgba(13,116,144,.12)` | 按钮 hover / 激活底 |
| `--acc-solid` | `linear-gradient(#7df3ff,#2ec7e0)` | `linear-gradient(#12a2c4,#0b7994)` | 主按钮、选中分段 |
| `--acc-on` | `#04141a` | `#f4fdff` | 主按钮上的文字 |
| `--acc-glow` | `0 0 18px rgba(77,232,255,.4)` | `0 1px 2px rgba(12,39,51,.22)` | 主按钮光晕（亮色降级为投影） |
| `--pink` | `#ff4d9d` | `#c4267c` | 次强调：白方 / 黑方、最后一手 |
| `--pink-txt` | `#ff8cc0` | `#a81f69` | 次强调文字 |
| `--ok` | `#4dffa3` | `#0f9b6c` | 连线正常 |
| `--ok-txt` | `#9dffcd` | `#0c7a55` | 连线文字 |
| `--ok-bg` | `rgba(77,255,163,.08)` | `rgba(15,155,108,.07)` | 连线面板底 |
| `--ok-line` | `rgba(77,255,163,.3)` | `rgba(15,155,108,.28)` | 连线面板描边 |
| `--danger` | `#ff4d6d` | `#d1365a` | 认输、错误 |
| `--danger-txt` | `#ff9caa` | `#b32a4b` | 危险态文字 |
| `--danger-bg` | `rgba(255,77,109,.14)` | `rgba(209,54,90,.09)` | 危险态底 |
| `--danger-line` | `rgba(255,77,109,.45)` | `rgba(209,54,90,.3)` | 危险态描边 |

### 评估值（着法表）

| 变量 | 暗色 | 亮色 |
| --- | --- | --- |
| `--eval-pos` | `#6fb98f` | `#1a7a45` |
| `--eval-neg` | `#c9503a` | `#b1432f` |
| `--eval-none` | `#4a463f` | `#b3ac9e` |

### 仪表与遥测

| 变量 | 暗色 | 亮色 |
| --- | --- | --- |
| `--track` | `#04080c` | `#dbe6ec` |
| `--bar-black` | `linear-gradient(90deg,#2ec7e0,#7df3ff)` | `linear-gradient(90deg,#0b7994,#12a2c4)` |
| `--bar-black-glow` | `0 0 12px rgba(77,232,255,.7)` | `none` |
| `--bar-white` | `linear-gradient(90deg,#7a2a52,#ff4d9d)` | `linear-gradient(90deg,#e6a8c6,#c4267c)` |
| `--tele` | `linear-gradient(90deg,#2ec7e0,#7df3ff)` | `linear-gradient(90deg,#0b7994,#12a2c4)` |
| `--tele-track` | `#0e1a24` | `#e2ecf1` |
| `--scroll` | `rgba(255,255,255,.26)` | `rgba(13,74,96,.24)` |

### 棋盘

| 变量 | 暗色 | 亮色 |
| --- | --- | --- |
| `--slab` | `linear-gradient(180deg,#12212e,#0a141d 60%,#070f16)` | `linear-gradient(180deg,#c3d6e0,#a8bfcc 60%,#95afbe)` |
| `--slab-shadow` | `0 20px 0 -3px #060c13, 0 24px 0 -3px rgba(77,232,255,.12), 0 0 60px rgba(77,232,255,.12), 0 50px 84px rgba(0,0,0,.8)` | `0 20px 0 -3px #7f9aaa, 0 24px 0 -3px rgba(13,116,144,.18), 0 42px 70px rgba(20,60,80,.26)` |
| `--plane` | `linear-gradient(180deg,#0d1a26,#08121b)` | `linear-gradient(180deg,#f3f8fb,#e5eff4)` |
| `--gline` | `rgba(77,232,255,.3)` | `rgba(13,74,96,.5)` |
| `--hoshi` | `rgba(77,232,255,.7)` | `rgba(13,74,96,.72)` |
| `--stone-black` | `radial-gradient(circle at 36% 26%,#2b3d4d,#0a1219 62%,#030608)` | `radial-gradient(circle at 36% 26%,#4a5c68,#141d24 60%,#05080b)` |
| `--stone-white` | `radial-gradient(circle at 36% 26%,#ffffff,#c9e6ef 60%,#7fa6b4)` | `radial-gradient(circle at 36% 26%,#ffffff,#f0f6f9 58%,#c6d5dd)` |
| `--stone-shadow` | `0 0 0 1px rgba(77,232,255,.35), 0 4px 8px rgba(0,0,0,.7)` | `0 3px 7px rgba(20,60,80,.3)` |
| `--piece` | `radial-gradient(circle at 36% 26%,#1c3040,#0c1a26 60%,#060f18)` | `radial-gradient(circle at 36% 26%,#ffffff,#eef5f9 58%,#cfdee6)` |
| `--piece-shadow` | `0 0 0 1px rgba(77,232,255,.4), 0 4px 9px rgba(0,0,0,.75)` | `0 3px 7px rgba(20,60,80,.26), 0 0 0 1px rgba(13,74,96,.16) inset` |
| `--piece-black-text` | `#cfe9f2` | `#123240` |
| `--piece-red-text` | `#ff8cc0` | `#c4267c` |
| `--river` | `linear-gradient(180deg,#0b1a26,#08131d)` | `linear-gradient(180deg,#e9f2f7,#dfebf1)` |
| `--river-text` | `rgba(77,232,255,.42)` | `rgba(13,74,96,.5)` |

### 棋盘标记

| 变量 | 暗色 | 亮色 |
| --- | --- | --- |
| `--m-last` | `#ff4d9d` | `#c4267c` |
| `--m-last-shadow` | `0 0 14px rgba(255,77,157,.7)` | `0 2px 8px rgba(196,38,124,.3)` |
| `--m-best` | `#4de8ff` | `#0d7490` |
| `--m-best-bg` | `rgba(77,232,255,.16)` | `rgba(13,116,144,.14)` |
| `--m-best-text` | `#c8f6ff` | `#0a4f63` |
| `--m-best-shadow` | `0 0 16px rgba(77,232,255,.55)` | `0 2px 8px rgba(13,116,144,.24)` |
| `--m-good` | `rgba(77,255,163,.75)` | `rgba(15,155,108,.75)` |
| `--m-good-bg` | `rgba(77,255,163,.13)` | `rgba(15,155,108,.12)` |
| `--m-good-text` | `#9dffcd` | `#0c7a55` |

### 窗口层与装饰

| 变量 | 暗色 | 亮色 |
| --- | --- | --- |
| `--win-btn` | `rgba(143,180,198,.9)` | `#3d5a68` |
| `--win-close-hover` | `#c42b1c` | `#c42b1c` |
| `--dock-shadow` | `0 0 34px rgba(77,232,255,.2), 0 18px 44px rgba(0,0,0,.66), 0 1px 0 rgba(255,255,255,.14) inset` | `0 14px 36px rgba(20,60,80,.2), 0 1px 0 rgba(255,255,255,.9) inset, 0 0 0 1px rgba(13,74,96,.08)` |
| `--scan` | `rgba(77,232,255,.045)` | `rgba(13,116,144,.03)` |
| `--sweep` | `rgba(77,232,255,.09)` | `rgba(13,116,144,.05)` |
| `--glow-text` | `0 0 22px rgba(77,232,255,.55)` | `none` |
| `--dot-black` | `#0a1219` + `box-shadow:0 0 0 1.5px rgba(77,232,255,.6)` | `#141d24` + `box-shadow:0 0 0 1.5px rgba(13,74,96,.3)` |
| `--dot-white` | `#dff1f7` | `#ffffff` |
| `--dot-red` | `#ff4d6d` | `#d1365a` |

交通灯（mac，仅设计参照用；产品用系统按钮）：`#ff5f57` / `#febc2e` / `#28c840`

---

## 字体

| 变量 | 值 |
| --- | --- |
| `--font-ui` | `'Chakra Petch', -apple-system, 'PingFang SC', system-ui, sans-serif` |
| `--font-ui-win` | `'Chakra Petch', 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei', sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` |

所有数字、坐标、遥测值、着法代号用 `--font-mono` + `font-variant-numeric: tabular-nums`。

### 字号 / 字重

| 用途 | 规格 |
| --- | --- |
| 主胜率数值 | `700 32px/1` mono |
| 次胜率 / DEPTH | `700 20px/1` mono |
| 象棋优势值 | `700 30px/1` mono |
| 品牌字 | `700 15px/1` UI，`letter-spacing:.24em` |
| 主按钮 | `700 12.5px` UI |
| 分段选中 / 未选 | `700 / 600 12px` UI |
| 窗口标题 | `600 12px` UI |
| 副标题 | `400 12px` UI |
| 着法行 | `400 11.5px` mono |
| 引擎名 / 连线详情 | `600 11px` / `400 10.5px` mono |
| 区块标签（全大写） | `600 9.5px` mono，`letter-spacing:.2em` |
| 遥测键值 | `600 9.5px` mono，`letter-spacing:.14em` |
| 棋盘元信息 | `600 9.5px` mono，`letter-spacing:.22em` |
| 棋盘候选点数字 | `700 10px` mono |
| 围棋虚手 `P` | `700 13px` mono |
| 估目 `目` | `700 15px` UI |
| 象棋棋子 | `600 26px` UI |
| 楚河汉界 | `400 19px` UI，`letter-spacing:.42em` |

---

## 尺寸

### 圆角

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--r-sm` | `5px` | 着法行 |
| `--r-btn` | `8px` | 顶栏图标按钮（30px） |
| `--r-md` | `9px` | 棋种切换外框、连线面板 |
| `--r-grp` | `10px` | 按钮组容器 |
| `--r-dock-btn` | `11px` | dock 按钮（36px）、新对局胶囊 |
| `--r-dock` | `14px` | dock 容器 |
| `--r-chip` | `7px` | 引擎 chip、分段选中 |
| 棋盘木盘 | `4px` | — |

### 高度 / 命中区

| 元素 | 尺寸 |
| --- | --- |
| mac 顶栏 | `52px` |
| Windows 标题栏 | `32px` |
| Windows 命令栏 | `52px` |
| Windows 系统按钮 | `46 × 32` |
| 顶栏图标按钮 | `30 × 30`（图标 15px） |
| dock 图标按钮 | `36 × 36`（图标 17px） |
| 新对局胶囊 | `height:36px; padding:0 14px 0 11px` |
| 引擎 chip | `height:30px; padding:0 12px` |
| 侧栏宽度 | `348px` |
| 棋盘区底部预留 | `96px`（dock 让位，必须保留） |
| 仪表条 / 遥测条 | `8px` / `3px` |

### 间距

| 场景 | 值 |
| --- | --- |
| 顶栏左右内距 | `12px` |
| 顶栏元素间距 | `9–10px` |
| 按钮组内距 / 间距 | `padding:3px; gap:2px` |
| dock 内距 / 间距 | `padding:6px; gap:4px` |
| dock 分隔线 | `1px × 22px`，`margin:0 4px` |
| 侧栏区块内距 | `16px 18px 14px`（仪表）/ `12px 18px`（遥测）/ `10px 18px 14px`（走势） |
| 侧栏区块间隙 | 由 `1px solid var(--hair)` 分隔，无额外 margin |
| 连线面板外距 | `0 12px 10px` |
| 棋盘区内距 | `30px 0 96px` |
| dock 吸底 | `bottom:16px` |
| 棋盘元信息 | `top:16px; left:22px` |

### 棋盘几何

| 项 | 围棋 | 象棋 |
| --- | --- | --- |
| 格距 | `34px` | `63px` |
| 盘面 | `612 × 612` | `504 × 567` |
| 木盘内距 | `26px` | `30px 26px` |
| 棋子直径 | `29px` | `54px` |
| 星位 | `5px` | — |
| 最后一手圈 | `34px` | `58px` |
| 候选点 | `30px` | — |
| 透视 | `perspective:1600px; rotateX(20deg) scale(.86)` | 同，`scale(.84)` |
| 楚河汉界 | — | `left:1px; top:253px; 502 × 61`，`box-sizing:border-box` |
| 九宫斜线 | — | `126 × 126` 容器，线 `178.2 × 1px`，`rotate(±45deg)` |

---

## 动效

| 变量 | 值 |
| --- | --- |
| `--ease-out` | `cubic-bezier(.2,.8,.3,1)` |
| `--ease-inout` | `cubic-bezier(.4,0,.2,1)` |
| `--t-hover` | `120ms` |
| `--t-press` | `80ms` |
| `--t-move` | `140ms` |
| `--t-switch` | `180–220ms` |
| `--t-panel` | `240ms` |

```css
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
@keyframes sweep { 0% { transform:translateY(-100%) } 100% { transform:translateY(400%) } }
```

`pulse` 用于引擎/连线状态圆点（1–1.4s `ease-in-out infinite`）；`sweep` 用于棋盘区顶部扫掠光（5.5s `linear infinite`）。

`prefers-reduced-motion: reduce` 时关闭 `sweep`、`pulse` 与落子位移，仅保留不透明度过渡。
