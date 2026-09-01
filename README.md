# Super Go

A desktop tool for two board games (Xiangqi + Go), supporting local human-vs-engine play and online proxy play.

Current status: **local human-vs-engine play works for both Xiangqi and Go** (see below); online proxy play is still on the roadmap ([DESIGN.md §9](./DESIGN.md)).

> 中文: [README.zh-CN.md](./README.zh-CN.md)

## Xiangqi human vs engine

- **3D board** (Three.js): wooden board, turned pieces, engraved characters, soft shadows, fixed playing view; switch to a flat board in settings
- **Adjustable strength**: five modes — Elo rating / search depth / think time / node count / unlimited; configurable search threads and hash table; change anytime during a game
- **Engine side**: play Red, play Black, or watch engine vs engine
- **Evaluation chart**: per-move engine eval line (Red’s perspective), move list and engine info in the same panel
- Full game controls: undo, resign, pause, replay navigation, revive after game end
- Move / capture / check / endgame sound effects (toggleable); UI in Chinese / English / Japanese; light / dark / system theme
- Always-on-top window toggle (for stacking above third-party platforms during proxy play)
- Bundled [Pikafish](https://github.com/official-pikafish/Pikafish) engine — ready out of the box

## Pikafish engine options

Bundled engine: **Pikafish 2026-01-31** ([website](http://pikafish.com) / [Wiki: UCI options](https://www.pikafish.com/wiki/index.php?title=UCI%E9%80%89%E9%A1%B9)). Options and defaults below are from a local `uci` handshake.

**Super Go adjusts strength, search threads, and hash table.** The five strength modes map to:


| Super Go strength | Sent to the engine |
| --- | --- |
| Elo rating | Enable `UCI_LimitStrength` and set `UCI_Elo` (1280–3133) |
| Search depth | Full strength; limit with `go depth` |
| Think time | Full strength; limit with `go movetime` (ms per move) |
| Node count | Full strength; limit with `go nodes` |
| Unlimited | Disable `UCI_LimitStrength`; no search cap |
| Threads / Hash | `Threads` / `Hash` (engine-level; not reset after each game) |


All other options use engine factory defaults (see the “Default” column below). After a game, strength resets to full so handicaps do not stick in analysis; threads and hash keep the user’s settings.

Handicap (Elo / Skill Level) affects **which move is played only**; analysis scores stay at full strength.

### Strength


| Option | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `UCI_LimitStrength` | switch | off | — | When on, `UCI_Elo` applies and `Skill Level` is ignored |
| `UCI_Elo` | int | 1280 | 1280–3133 | Ladder-calibrated human-like rating; lower = weaker. 1280 ≈ Skill 0, 1777 ≈ 4, 2268 ≈ 7, 2568 ≈ 10, 2850 ≈ 13, 3133 ≈ 19 |
| `Skill Level` | int | 20 | 0–20 | Coarse handicap (non-20 uses internal MultiPV=4). Super Go does not touch this; it uses `UCI_Elo` only |




### Repetition rules and move limits

Xiangqi draws and perpetual check are not judged like chess. The engine scores search according to the selected rule set; **perpetual check is treated as a violation by the checking side by default**, so at full strength it generally will not grind through loops like “Rook forward check, King forward, Rook back, King back”. Super Go’s local rules layer does not adjudicate perpetual check; game end is still checkmate / stalemate; online platforms apply their own rules.


| Option | Type | Default | Values | Notes |
| --- | --- | --- | --- | --- |
| `Repetition Rule` | enum | **AsianRule** | see below | How repeated moves (perpetual check / chase, etc.) are judged |
| `Mate Threat Depth` | int | 10 | 0–10 | `ChineseRule` only: plies to detect “mate threat”. 0 = off; higher values reduce strength |
| `Sixty Move Rule` | switch | **on** | — | Natural move limit: long sequences without capture score as draw (0) |
| `Rule60MaxPly` | int | **120** | 1–150 | Move-limit plies. 120 = 60 full moves, matching Tiantian Xiangqi. Too low hurts playing strength |
| `Draw Rule` | enum | **None** | see below | Treat draws as wins for one side — analysis only; distorts scores |




`Repetition Rule`:


| Value | Meaning |
| --- | --- |
| **AsianRule** (default) | Asian rules. Severity: perpetual check > perpetual chase of same piece > other. **2-fold** (same position on 2nd occurrence). Close to most online platforms |
| ChineseRule | Simplified Chinese rules (Asian variant). Severity: perpetual check > perpetual chase/kill and check-kill/chase-kill loops > other. Chinese rule text is ambiguous; not fully programmable |
| ComputerRule | Author’s *Chinese Computer Xiangqi Competition Rules*. Closer to Asian diagrams, **3-fold** (3rd occurrence). Differs from common online rules |
| SkyRule | Some online rules (Asian tweak), not official Chinese rules |
| YitianRule | Yitian platform |
| AllowChase | Only perpetual check forbidden; other loops allowed. For endgame analysis or avoiding repetition disputes |
| NoJudgement | No adjudication on repetition |


`Draw Rule`: `None` (normal) / `DrawAsBlackWin` / `DrawAsRedWin` (all draws count as that side’s win) / `DrawRepAsBlackWin` / `DrawRepAsRedWin` (repetition draws only). Reset to `None` after analysis.

### Search and display


| Option | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `Threads` | int | 1 | 1–CPU cores | Search threads. Adjustable in strength settings (protocol max 1024; Super Go clamps to core count) |
| `Hash` | int | 16 | 1–33554432 | Transposition table MB. Adjustable in settings (UI cap 32768 MB) |
| `Clear Hash` | button | — | — | Clear transposition table |
| `Ponder` | switch | off | — | Ponder while opponent’s clock runs |
| `MultiPV` | int | 1 | 1–128 | Principal variations in parallel. Higher values weaken play; analysis only |
| `Move Overhead` | int | 30 | 0–5000 | Communication/UI slack (ms), anti-timeout |
| `nodestime` | int | 0 | 0–10000 | Time from nodes; 0 = off |
| `ScoreType` | enum | **Elo** | Elo / PawnValueNormalized / Raw | Display only. Elo = win-rate model (~200 cp ≈ 76% self-play blitz win rate) |
| `LU_Output` | switch | on | — | Multiple bound updates at same depth; no strength effect |
| `EvalFile` | string | `pikafish.nnue` | — | NNUE weights path; usually next to the binary |
| `Debug Log File` | string | empty | — | Debug log file |
| `NumaPolicy` | string | auto | — | NUMA binding; rarely needs changing |




### Choosing a Windows binary

Installers pick by CPU automatically. When replacing manually, roughly fastest to slowest:

`vnni512` > `avx512icl` / `avx512` > `avxvnni` > `bmi2` > `avx2` > `sse41-popcnt`

Use the newest variant your CPU runs. Weights file `pikafish.nnue` must sit in the same directory as the executable.

## Go human vs engine

- **19×19 standard board** (3D wood / flat Canvas); Chinese / Japanese / AGA rules; default komi: Japanese 6.5, Chinese and AGA 7.5
- **Strength**: strongest network, visits / think time / unlimited; full-strength play, no human-dan handicapping
- **Engine side**: Black, White, or engine vs engine; pass, undo, resign, pause
- **Score estimate**: toolbar “Score” shows engine result only (Black/White, not W/B). No local counting, no ownership heatmap
- Evaluation: Black win rate + point lead




## KataGo engine options

Local engine: **KataGo 1.18.0** (Metal backend). Docs: [repo](https://github.com/lightvector/KataGo) / [GTP extensions](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md) / [example config](https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_example.cfg). Super Go uses one main model at full strength — play with the strongest network you have.

Options and defaults below from a local `gtp` handshake (`kata-list-params` / `kata-get-params`, config = official `gtp_example.cfg`). Items not in config use “unlimited” sentinel values (e.g. `maxTime = 1e+20`).

Settings → **Go engine** — what you can change and what is sent to the engine:

| Super Go setting | Default | Sent to engine |
| --- | --- | --- |
| KataGo path | empty = auto-detect | Executable; empty uses brew / `engines/go` |
| Model file | empty = auto-detect | Startup `-model` (primary strength factor). Empty prefers `kata1-b18*` |
| Config file | empty = app-generated `gtp.cfg` | `-config` |
| Strength · visits | **400** (presets 25 / 100 / 400 / 800 / 1600, or manual 1–1M) | Sets `maxVisits` only, **no time cap** |
| Strength · think time | seconds per move (default **8**) | Sets `maxTime` only, **no visit cap** |
| Strength · unlimited | — | No visit or time cap (engine searches on clock) |
| Move delay (s) | **0.3–0.9** (0–15) | App waits randomly after compute, before playing; 0 at both ends = instant. Not sent to KataGo |
| Ponder | off | `ponderingEnabled`; search while opponent thinks (ponder cap 60s in config) |
| Wide root noise | **0.04** | `analysisWideRootNoise`; widens analysis exploration only, not move choice |
| Default rules / komi | Chinese / **7.5** | `kata-set-rules` / GTP `komi`. Japanese switches to 6.5; AGA stays 7.5 |

Only one strength mode at a time; move choice is constrained by that mode only, the other dimension is unlimited, so analysis does not compete for the same visits/time. Post-move eval and scoring use built-in fast analysis; settings no longer expose separate “analysis visits / fast visits / analysis time limit”.

All other options use engine defaults (see “Default” below). Visits/time limits constrain **move choice and search depth only**; eval scores come from that search, not a separate fake score.

On the same network, more visits = deeper, steadier search; against humans all are well above world-champion level (rough guide, not absolute). 25 is already pro-level but shallow search may miss tactics; 400 is Super Go’s default; 1600 is deeper and steadier but heavier on GPU. To go stronger, swap to a stronger network rather than pushing visits into tens of thousands.

In 1.18, `kata-genmove_analyze` / `kata-analyze` **cannot** take `maxVisits` on the command line (color + interval only; interval in centiseconds); set caps with `kata-set-param` first.

### Strength and human level

Super Go uses the main `-model` only, at full strength. Network choice matters first; visits/time second. Launch:

```text
katago gtp -model <main-model.bin.gz> -config <gtp.cfg>
```

Rough comparisons only — no absolute standard. Official Elo is engine self-play; human Elo uses a different scale; compare relatively.

**Model → official Elo** ([katagotraining.org/networks](https://katagotraining.org/networks/), 2026-08):


| Model | Official Elo (approx.) | vs humans (some search) |
| --- | --- | --- |
| `tf3-b11` / Zhizi `b40` | 14500 | Above world champion; top tier |
| `b28` | 14100 | Above world champion |
| brew `b18` | 13600 | Also above world champion |
| brew bundled `g170*` | below b18 | Weaker, still far above pro |


Strongest play: `tf3-b11` or Zhizi `b40`. Homebrew only ships b18; download from the official site and set the model path in settings.

**Human Elo → rank** (approx.; amateur by EGF ~100 per rank; top pros by goratings scale):


| Approx. Elo | Approx. level |
| --- | --- |
| 100–2000 | Amateur 20 kyu – 1 kyu |
| 2100–2600 | Amateur 1 dan – 6 dan |
| ~2700 | Pro entry |
| 2700–3000 | Pro dan |
| 3800–3900 | Active world champion |


Networks at 13600–14500 are all above human world-champion level; a few hundred Elo apart is engine self-play only. Super Go defaults to 400 visits (official example 500); whichever of `maxTime` / `maxVisits` is hit first stops search.

### Search limits


| Option | Type | Default (local handshake) | Range / empty | Notes |
| --- | --- | --- | --- | --- |
| `maxVisits` | int | **500** | unset = unlimited | Cap on search-tree nodes this move (includes reused nodes from prior move) |
| `maxPlayouts` | int | unlimited (`2^50`) | unset = unlimited | **New** nodes expanded this move |
| `maxTime` | float s | unlimited (`1e+20`) | unset = unlimited | Think time this move. If all three set, first limit wins |
| `ponderingEnabled` | switch | off | — | Search while opponent’s clock runs |
| `maxVisitsPondering` / `maxPlayoutsPondering` | int | unlimited | — | Ponder visit/playout caps |
| `maxTimePondering` | float s | **60** | — | Ponder time cap, avoids holding GPU forever |
| `numSearchThreads` | int | **6** (example config) | tune with `katago benchmark` | Search threads; on strong GPUs optimal often exceeds CPU count |
| `lagBuffer` | float s | **1.0** | — | Clock slack, anti-timeout |
| `searchFactorAfterOnePass` | float | 0.50 | — | Search less after opponent passes (human-friendly) |
| `searchFactorAfterTwoPass` | float | 0.25 | — | Search less after both passed |
| `searchFactorWhenWinning` | float | 0.40 | from cfg if not in handshake | Search less when winning |
| `minPlayoutsPerThread` | float | 8 | — | Minimum playouts per thread |




### Rules

Set via `rules` or `kata-set-rules`. Engine **does not guarantee** word-for-word match with every tournament rule set; it picks the closest combination ([rules reference](https://lightvector.github.io/KataGo/rules.html)). Komi via standard GTP `komi`.


| Shorthand | Scoring | Ko | Suicide | Handicap compensation |
| --- | --- | --- | --- | --- |
| `chinese` | area | simple | no | White gets N (N = handicap stones) |
| `chinese-kgs` / `chinese-ogs` | area | superko | no | White gets N |
| `japanese` / `korean` | territory | simple | no | none |
| `aga` / `bga` | area | positional superko | no | White gets N−1 |
| `tromp-taylor` (example default) | area | superko | yes | none |
| `new-zealand` | area | positional superko | yes | none |
| `stone-scoring` | area + all tax | simple | no | none |


Or per field: `ko` / `scoring` / `tax` / `suicide` / `whiteHandicapBonus` / `friendlyPassOk` / `hasButton`. KGS `chinese` maps to `chinese-kgs`.

### Resignation and game behavior


| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `allowResignation` | switch | on | Allow resignation |
| `resignThreshold` | float | **−0.90** | Resign when mover’s win utility ([−1,1]) stays below this |
| `resignConsecTurns` | int | **3** | Consecutive moves below threshold |
| `resignMinScoreDifference` | float | unset | Do not resign if point lead is smaller |
| `resignMinMovesPerBoardArea` | float | 0 | e.g. 0.25 → ~90 moves on 19×19 before resign allowed |
| `delayMoveScale` / `delayMoveMax` | float s | 0 / huge | Engine’s own random move delay (obvious moves short, hard moves long) |
| `conservativePass` | switch | on | Do not pass just because another pass wins under Tromp-Taylor |
| `playoutDoublingAdvantage` | float | 0 | −3–3. Positive = assume stronger, safer; negative = assume weaker, sharper. Handicap games have extra dynamic term |
| `dynamicPlayoutDoublingAdvantageCapPerOppLead` | float | 0.045 (config default) | Auto-adjust advantage from handicap/komi; **does not affect** analyze scores |




### Analysis


| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `analysisWideRootNoise` | float | **0.04** | Analysis only; widens root exploration. 1 ≈ visits on almost every move |
| `analysisIgnorePreRootHistory` | switch | on | Reduces odd history effects on predictions |
| `reportAnalysisWinratesAs` | enum | **SIDETOMOVE** | `BLACK` / `WHITE` / `SIDETOMOVE`. Most UIs want side-to-move perspective |
| `analysisPVLen` | int | 15 | Max analysis PV length |
| `wideRootNoise` | float | 0 | Wide root noise for game search (separate from analysis) |




### Threads, cache, and other search internals

`nnCacheSizePowerOfTwo` (config default ~20, i.e. 2^20 eval cache entries) and GPU backend (local Metal / MPSGraph) live in startup config; usually not changeable via `kata-set-param`.

`kata-list-params` exposes many internal search knobs (`cpuctExploration`, `fpuReductionMax`, `useLcbForSelection`, `useGraphSearch`, etc.). Local defaults match the official example — **do not treat these as strength knobs**; change model and visits/time only. Full comments in official `gtp_example.cfg`.

## Download and run

Build installers from source (macOS dmg / Windows NSIS, engines bundled):

```bash
pnpm install
pnpm build-app          # output in packages/app/dist/
```

Or run the dev build:

```bash
pnpm dev                # Electron dev mode
```



## Development

- Node ≥ 22, pnpm ≥ 10
- `pnpm test` — unit tests (rules / protocol / engine integration); `pnpm gate` = typecheck + lint + test
- `pnpm dev:web` — browser UI debug (no Electron, mock backend injected, [http://localhost:5174](http://localhost:5174))

```
packages/core   Domain core: rules / notation / game state machine / move tree, pure TS, zero deps
packages/app    Electron app: main (engine process / IPC), renderer (React UI)
engines/chess/  Xiangqi engine bundle (gitignored; auto-detected in dev; bundled in release)
```

See [DESIGN.md](./DESIGN.md) and [AGENTS.md](./AGENTS.md) for design and dev conventions.

## License

Source code is released under **GNU GPLv3 or later** — full text in [LICENSE](./LICENSE). Third-party engines, weights, and frameworks: licenses, commercial restrictions, and source links in [NOTICE.md](./NOTICE.md).

Summary:

- Proxy-play `yolov11.onnx` comes from TCHESS (GPLv3); this app is distributed under GPL
- Bundled [Pikafish](https://github.com/official-pikafish/Pikafish) engine is GPLv3; `pikafish.nnue` **weights have a separate “no commercial use without permission” clause** ([licenses/pikafish-nnue.txt](./licenses/pikafish-nnue.txt))
- [KataGo](https://github.com/lightvector/KataGo) and official networks are MIT (or equivalent permissive)
- Electron, React, three.js, ONNX Runtime, etc. are MIT / Apache-2.0, compatible with GPL distribution
