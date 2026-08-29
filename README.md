# Super Go

双棋种（象棋 + 围棋）桌面对弈工具，支持本机人机对弈与连线代打两条核心场景。

当前进度：**象棋与围棋本机人机对弈均已可用**（见下）；连线代打仍在开发计划中（[DESIGN.md §9](./DESIGN.md)）。

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


| Super Go 棋力 | 实际下发给引擎的                                       |
| ----------- | ---------------------------------------------- |
| 等级分         | 打开 `UCI_LimitStrength`，并设 `UCI_Elo`（1280–3133） |
| 搜索深度        | 满强度；用 `go depth` 限制层数                          |
| 思考时长        | 满强度；用 `go movetime` 限制每步毫秒                     |
| 节点数         | 满强度；用 `go nodes` 限制节点                          |
| 不设限         | 关掉 `UCI_LimitStrength`，不限制搜索                   |
| 搜索线程 / 哈希表  | `Threads` / `Hash`（引擎级，对局结束不复位）                |


其余选项一律用引擎出厂默认（下表「默认」列）。对局结束会把强度复位为满强度，避免放水粘在分析上；线程与哈希保持用户设置。

放水（等级分 / Skill Level）只影响**出哪一步**，分析分数仍按满强度计算。

### 棋力


| 选项                  | 类型  | 默认   | 范围        | 说明                                                                             |
| ------------------- | --- | ---- | --------- | ------------------------------------------------------------------------------ |
| `UCI_LimitStrength` | 开关  | 关    | —         | 打开后 `UCI_Elo` 生效，并让 `Skill Level` 失效                                           |
| `UCI_Elo`           | 整数  | 1280 | 1280–3133 | 天梯校准的拟人等级分；越低越弱。1280 ≈ Skill 0，1777 ≈ 4，2268 ≈ 7，2568 ≈ 10，2850 ≈ 13，3133 ≈ 19 |
| `Skill Level`       | 整数  | 20   | 0–20      | 粗档放水（非 20 时内部 MultiPV=4）。本软件不改此项，只用 `UCI_Elo`                                  |




### 循环棋规与限招

象棋和棋/长将不按国际象棋判。引擎在搜索里就按所选规则给分，**长将默认视为将军方违规**，满强度一般不会把「车进一将军、将进一、车退一、将退一」循环走穿。本软件本地规则层不裁判长将，终局仍以绝杀/困毙为准；连线时平台会按自己的棋规判。


| 选项                  | 类型  | 默认            | 取值    | 说明                                              |
| ------------------- | --- | ------------- | ----- | ----------------------------------------------- |
| `Repetition Rule`   | 枚举  | **AsianRule** | 见下    | 循环着法（长将 / 长捉等）怎么判                               |
| `Mate Threat Depth` | 整数  | 10            | 0–10  | 仅 `ChineseRule` 有效：判断「杀」的回合数。0 = 不判断杀；越高棋力下降越明显 |
| `Sixty Move Rule`   | 开关  | **开**         | —     | 自然限招：长时间不吃子按和（0 分）                              |
| `Rule60MaxPly`      | 整数  | **120**       | 1–150 | 限招步数。120 = 60 回合，与天天象棋一致。调太小棋力会漂                |
| `Draw Rule`         | 枚举  | **None**      | 见下    | 把「和」改算成某方胜，只适合拆棋，会扭曲分数                          |


`Repetition Rule`：


| 值                 | 含义                                                           |
| ----------------- | ------------------------------------------------------------ |
| **AsianRule**（默认） | 亚规。严重级：长将 > 长捉同一子 > 其它。**2-fold**（同一局面第 2 次即判）。多数网络平台接近此规    |
| ChineseRule       | 简化中规（本质仍是亚规改版）。严重级：长将 > 长捉/长杀/将杀·将捉·杀捉循环 > 其它。中规条文模糊，无法完整程序化 |
| ComputerRule      | 作者《中国象棋程序竞赛规则》。更贴亚规图例，**3-fold**（第 3 次才判），和常见网规有差别           |
| SkyRule           | 部分网规（亚规微调），不是中规                                              |
| YitianRule        | 弈天平台                                                         |
| AllowChase        | 只禁长将，其它循环都允。优势残局拆棋、想躲开循环争议时用                                 |
| NoJudgement       | 循环不作裁决                                                       |


`Draw Rule`：`None`（正常）/ `DrawAsBlackWin` / `DrawAsRedWin`（一切和棋算该方胜）/ `DrawRepAsBlackWin` / `DrawRepAsRedWin`（仅循环和算该方胜）。改完拆棋后务必改回 `None`。

### 搜索与显示


| 选项               | 类型  | 默认              | 范围                              | 说明                                                |
| ---------------- | --- | --------------- | ------------------------------- | ------------------------------------------------- |
| `Threads`        | 整数  | 1               | 1–本机 CPU 核数                     | 搜索线程。可在棋力设置中改（引擎协议上限 1024，本软件按核数钳制）               |
| `Hash`           | 整数  | 16              | 1–33554432                      | 置换表 MB。可在棋力设置中改（界面上限 32768 MB）                    |
| `Clear Hash`     | 按钮  | —               | —                               | 清空置换表                                             |
| `Ponder`         | 开关  | 关               | —                               | 后台思考（对方时钟仍走时继续算）                                  |
| `MultiPV`        | 整数  | 1               | 1–128                           | 同时计算几条主变。调高会降棋力，只适合拆棋                             |
| `Move Overhead`  | 整数  | 30              | 0–5000                          | 通信/界面耗时余量（毫秒），防超时                                 |
| `nodestime`      | 整数  | 0               | 0–10000                         | 按节点折算时间；0 = 不用                                    |
| `ScoreType`      | 枚举  | **Elo**         | Elo / PawnValueNormalized / Raw | 只影响显示分，不影响棋力。Elo = 按胜率模型换算（约 200 分对应自对弈快棋 76% 胜率） |
| `LU_Output`      | 开关  | 开               | —                               | 同一深度是否多次输出上下界；不影响棋力                               |
| `EvalFile`       | 字符串 | `pikafish.nnue` | —                               | NNUE 权重路径，一般与引擎同目录                                |
| `Debug Log File` | 字符串 | 空               | —                               | 调试日志文件                                            |
| `NumaPolicy`     | 字符串 | auto            | —                               | 多路 CPU 绑核；一般不用改                                   |




### Windows 二进制怎么选

安装包会按 CPU 自动挑；自行替换时大致由快到慢：

`vnni512` > `avx512icl` / `avx512` > `avxvnni` > `bmi2` > `avx2` > `sse41-popcnt`

选本机能跑的最新一档即可。权重文件 `pikafish.nnue` 必须和可执行文件放在同一目录。

## 围棋人机对弈

- **19 路标准盘**（3D 木盘 / 平面 Canvas 可切）；规则中国 / 日本 / AGA，贴目默认日本 6.5、中国与 AGA 7.5
- **棋力**：选最强网，visits / 思考时长 / 不设限；满强度对弈，不对人类段位放水
- **引擎执方任选**：执黑、执白或引擎互搏观战；虚着、悔棋、认输、暂停
- **算目**：工具栏「目」只展示引擎结果（黑/白，不用 W/B）。不做本地数子、不做领地热图
- 评估为黑方视角胜率 + 目差



## KataGo 引擎参数

本机引擎为 **KataGo 1.18.0**（Metal 后端）。文档：[官网](https://github.com/lightvector/KataGo) / [GTP 扩展](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md) / [官方示例配置](https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_example.cfg)。本软件只挂一张主模型、满强度下，要下就和下最强的那张。

下面按本机 `gtp` 握手（`kata-list-params` / `kata-get-params`，配置为官方 `gtp_example.cfg`）列出选项与默认值。未写进配置的项，引擎给的是「无上限」哨兵值（如 `maxTime = 1e+20`）。

设置 → **围棋引擎** 里能改的，以及实际下发给引擎的：

| Super Go 设置 | 默认 | 实际下发 |
| --- | --- | --- |
| KataGo 路径 | 空 = 自动探测 | 可执行文件；留空走 brew / `engines/go` |
| 模型文件 | 空 = 自动探测 | 启动参数 `-model`（棋力第一要素）。留空优先 `kata1-b18*` |
| 配置文件 | 空 = 应用生成 `gtp.cfg` | `-config` |
| 棋力 · 访问量 | **400**（预设 25 / 100 / 400 / 800 / 1600，也可手填 1–100 万） | 只设 `maxVisits`，**不限时间** |
| 棋力 · 思考时长 | 每手秒数（默认 **8**） | 只设 `maxTime`，**不限 visits** |
| 棋力 · 不设限 | — | visits、时间都不限（引擎按时钟搜） |
| 行棋延迟 (s) | **0.3–0.9**（0–15） | 本软件在算完之后、落子之前随机等；两端都为 0 则立刻走。不下发给 KataGo |
| 闲时思考 | 关 | `ponderingEnabled`；对方思考时继续搜（配置里闲时最多 60 秒） |
| 宽根噪声 | **0.04** | `analysisWideRootNoise`，只影响评估探索面，不影响对局出招 |
| 默认规则 / 贴目 | 中国 / **7.5** | `kata-set-rules` / GTP `komi`。切日本会改成 6.5，AGA 仍是 7.5 |

棋力三档只选其一，出招只受这一档约束，另一维拉到无上限，避免和分析抢同一套 visits/时间。落子后的评估和算目用内置快分析，设置里不再单独给「分析 visits / 快速 visits / 分析时限」。

其余选项一律用引擎出厂默认（下表「默认」列）。visits / 时限只约束**出哪一步和搜多深**，评估分仍按这次搜索给，不会另开一套假分。

同一张网上，visits 越大搜得越深、越稳，对人来说都过了世界冠军（大约，没有绝对标准）。25 已经职业以上，浅搜可能漏战术；400 是本软件默认；1600 更深更稳，也更吃 GPU。要再强，换更强的网比把 visits 加到几万更有效。

1.18 的 `kata-genmove_analyze` / `kata-analyze` **不能**把 `maxVisits` 写在命令行里（只接受颜色 + 间隔，间隔单位是厘秒）；上限必须先 `kata-set-param`。

### 棋力与人类水平

本软件只走主模型 `-model`，满强度。棋力首先看**用哪张网**，其次才是 visits / 时限。启动：

```text
katago gtp -model <主模型.bin.gz> -config <gtp.cfg>
```

下面都是大约对照，没有绝对标准。官网 Elo 是机器互搏分，人类 Elo 是另一把尺，只看相对高低。

**模型 → 官网 Elo**（[katagotraining.org/networks](https://katagotraining.org/networks/)，2026-08）：


| 模型                   | 官网 Elo（大约） | 对人（加一点搜索）    |
| -------------------- | ---------- | ------------ |
| `tf3-b11` / 智子 `b40` | 14500      | 世界冠军之上，现役最强档 |
| `b28`                | 14100      | 世界冠军之上       |
| brew 现成 `b18`        | 13600      | 也是世界冠军之上     |
| brew 自带 `g170*`      | 低于 b18     | 弱一截，仍远强于职业   |


要下最强：用 `tf3-b11` 或智子 `b40`。本机 brew 只有 b18，从官网下载后在设置里改模型路径。

**人类 Elo → 段位**（大约；业余按 EGF 100 分一档的量级，顶尖职业按 goratings 的量级）：


| 大约 Elo    | 大约水平        |
| --------- | ----------- |
| 100～2000  | 业余 20 级～1 级 |
| 2100～2600 | 业余 1 段～6 段  |
| 2700 上下   | 职业初段        |
| 2700～3000 | 职业段         |
| 3800～3900 | 现役世界冠军      |


13600～14500 的网对人来说都过了世界冠军；网差几百只是引擎互搏。本软件默认 visits 400（官方示例 500），谁先碰到 `maxTime` / `maxVisits` 谁停。

### 搜索上限


| 选项                                            | 类型  | 默认（本机握手）     | 范围 / 空值                 | 说明                         |
| --------------------------------------------- | --- | ------------ | ----------------------- | -------------------------- |
| `maxVisits`                                   | 整数  | **500**      | 不设则无上限                  | 本手搜索树节点上限（含上一手仍有效的节点）      |
| `maxPlayouts`                                 | 整数  | 无上限（`2^50`）  | 不设则无上限                  | 本手**新**展开的节点数              |
| `maxTime`                                     | 浮点秒 | 无上限（`1e+20`） | 不设则无上限                  | 本手思考时间。三者同时设时取最先碰到的        |
| `ponderingEnabled`                            | 开关  | 关            | —                       | 对方时钟走时继续搜                  |
| `maxVisitsPondering` / `maxPlayoutsPondering` | 整数  | 无上限          | —                       | 闲时思考的 visits / playouts 上限 |
| `maxTimePondering`                            | 浮点秒 | **60**       | —                       | 闲时思考时限，防止一直占 GPU           |
| `numSearchThreads`                            | 整数  | **6**（示例配置）  | 宜用 `katago benchmark` 调 | 搜索线程。强 GPU 上最优值常远高于 CPU 核数 |
| `lagBuffer`                                   | 浮点秒 | **1.0**      | —                       | 时钟余量，防超时                   |
| `searchFactorAfterOnePass`                    | 浮点  | 0.50         | —                       | 对方虚着后少搜一点（对人友好）            |
| `searchFactorAfterTwoPass`                    | 浮点  | 0.25         | —                       | 双方已虚着时再少搜                  |
| `searchFactorWhenWinning`                     | 浮点  | 0.40         | 配置项，握手未单列时看 cfg         | 胜势时少搜                      |
| `minPlayoutsPerThread`                        | 浮点  | 8            | —                       | 每线程至少展开这么多                 |




### 规则

由 `rules` 或 `kata-set-rules` 设置。引擎**不保证**与各国赛场细则逐字相同，只取最接近的组合（见 [规则说明](https://lightvector.github.io/KataGo/rules.html)）。贴目走标准 GTP `komi`。


| 简写                            | 计分    | 劫    | 自杀  | 让子贴还          |
| ----------------------------- | ----- | ---- | --- | ------------- |
| `chinese`                     | 数子    | 简单劫  | 否   | 白得 N（N = 让子数） |
| `chinese-kgs` / `chinese-ogs` | 数子    | 超劫   | 否   | 白得 N          |
| `japanese` / `korean`         | 地盘    | 简单劫  | 否   | 无             |
| `aga` / `bga`                 | 数子    | 局势超劫 | 否   | 白得 N−1        |
| `tromp-taylor`（示例配置默认）        | 数子    | 超劫   | 是   | 无             |
| `new-zealand`                 | 数子    | 局势超劫 | 是   | 无             |
| `stone-scoring`               | 数子+全税 | 简单劫  | 否   | 无             |


也可拆字段：`ko` / `scoring` / `tax` / `suicide` / `whiteHandicapBonus` / `friendlyPassOk` / `hasButton`。`kgs-rules` 的 `chinese` 会映射成 `chinese-kgs`。

### 认输与对局行为


| 选项                                             | 类型  | 默认          | 说明                                     |
| ---------------------------------------------- | --- | ----------- | -------------------------------------- |
| `allowResignation`                             | 开关  | 开           | 允许认输                                   |
| `resignThreshold`                              | 浮点  | **−0.90**   | 走子方胜负效用（[−1,1]）连续低于此值才认输               |
| `resignConsecTurns`                            | 整数  | **3**       | 连续低于阈值多少手                              |
| `resignMinScoreDifference`                     | 浮点  | 不设          | 目差小于此不认输                               |
| `resignMinMovesPerBoardArea`                   | 浮点  | 0           | 例：0.25 → 19 路约 90 手内不认输                |
| `delayMoveScale` / `delayMoveMax`              | 浮点秒 | 0 / 极大      | 引擎自己的随机落子延迟（明显手短、难手长）                  |
| `conservativePass`                             | 开关  | 开           | 不因「再虚着按 Tromp-Taylor 就赢了」而虚着           |
| `playoutDoublingAdvantage`                     | 浮点  | 0           | −3～3。正 = 自认更强、偏稳健；负 = 自认更弱、偏凶。让子局另有动态项 |
| `dynamicPlayoutDoublingAdvantageCapPerOppLead` | 浮点  | 0.045（配置默认） | 按让子/贴目自动调优势假设；**不影响** analyze 分数       |




### 分析


| 选项                             | 类型  | 默认             | 说明                                          |
| ------------------------------ | --- | -------------- | ------------------------------------------- |
| `analysisWideRootNoise`        | 浮点  | **0.04**       | 只影响分析，加宽根上探索。1 = 几乎每手都分配 visits             |
| `analysisIgnorePreRootHistory` | 开关  | 开              | 减轻到达当前局面的古怪历史对预测的影响                         |
| `reportAnalysisWinratesAs`     | 枚举  | **SIDETOMOVE** | `BLACK` / `WHITE` / `SIDETOMOVE`。多数界面要走子方视角 |
| `analysisPVLen`                | 整数  | 15             | 分析主变最长手数                                    |
| `wideRootNoise`                | 浮点  | 0              | 对局搜索的宽根噪声（与分析项分开）                           |




### 线程、缓存与其余搜索项

`nnCacheSizePowerOfTwo`（配置默认约 20，即 2^20 条评估缓存）和 GPU 后端（本机 Metal / MPSGraph）在启动配置里，一般不能靠 `kata-set-param` 改。

`kata-list-params` 里还有大量搜索内部项（`cpuctExploration`、`fpuReductionMax`、`useLcbForSelection`、`useGraphSearch` 等）。本机握手默认与官方示例一致，**不要当棋力旋钮拧**——棋力只应动模型、visits / 时限。完整注释见官方 `gtp_example.cfg`。

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
- `pnpm dev:web` 浏览器模式调试 UI（无 Electron，自动注入 mock 后端，[http://localhost:5174](http://localhost:5174)）

```
packages/core   领域内核：规则 / 记谱 / 对弈状态机 / 着法树，零依赖纯 TS
packages/app    Electron 应用：main（引擎进程 / IPC）、renderer（React UI）
engines/chess/  象棋引擎发行包（gitignore，dev 时按平台自动探测；打包版内置无需放置）
```

设计文档与开发约定见 [DESIGN.md](./DESIGN.md) 与 [AGENTS.md](./AGENTS.md)。

## 许可证

本项目源码以 **GNU GPLv3 或后续版本** 发布，全文见 [LICENSE](./LICENSE)。第三方引擎、权重与框架的许可证、商用限制与对应源码入口见 [NOTICE.md](./NOTICE.md)。

要点：

- 连线用的 `yolov11.onnx` 来自 TCHESS（GPLv3），本软件按 GPL 分发
- 随包 [Pikafish](https://github.com/official-pikafish/Pikafish) 引擎为 GPLv3；`pikafish.nnue` **权重另有「未经许可不得商用」条款**（[licenses/pikafish-nnue.txt](./licenses/pikafish-nnue.txt)）
- [KataGo](https://github.com/lightvector/KataGo) 及其官方网络为 MIT（或同等宽松许可）
- Electron、React、three.js、ONNX Runtime 等为 MIT / Apache-2.0，与 GPL 组合分发相容

