# Super Go 1.0.0

**2026-08-31**

First stable release of a dual-game (Xiangqi + Go) desktop tool. Local human-vs-engine, engine self-play, and third-party proxy play share one pipeline: sync position → engine move → human-like delay → play.

> 中文: [RELEASES.zh-CN.md](./RELEASES.zh-CN.md)

## Highlights

- **Xiangqi out of the box**: installer bundles [Pikafish](https://github.com/official-pikafish/Pikafish) (2026-01-31) and `pikafish.nnue` — no separate engine download.
- **Local Go play**: [KataGo](https://github.com/lightvector/KataGo) (GTP). 19×19 board, Chinese / Japanese / AGA rules, configurable komi and handicap.
- **Proxy play**: recognize third-party platform boards; engine plays or spectate-only. Xiangqi uses YOLO; Go uses classic CV (grid + intersection classification); moves are single-click on intersections.
- **3D / flat board**: default 3D wood board, optional flat Canvas; dark / light / system theme; UI in Chinese / English / Japanese.

## Xiangqi

- Five strength modes: Elo rating (1280–3133, `UCI_Elo`) / search depth / think time / node count / unlimited.
- Adjustable search threads and hash table; change side and strength anytime during a game.
- Engine plays Red, Black, or both sides for self-play spectating.
- Evaluation chart (Red’s perspective), move list, and engine info in one panel.
- Undo, resign, pause (strict alternation), replay navigation, revive after game end.
- Move / capture / check / endgame sounds (toggleable).
- Move delay: random wait after compute before playing (local and proxy; default 0.3–0.9 s).

Windows installer includes all CPU variants; runtime picks the best ISA (e.g. `avx512icl`). macOS installer ships Apple Silicon build.

## Go

- 19×19; Chinese / Japanese / AGA rules (default komi: Japanese 6.5, Chinese and AGA 7.5).
- Strength: visits / think time / unlimited. This release uses one main model at full strength — **no human-dan handicapping**.
- Engine plays Black, White, or self-play; pass, undo, resign, pause.
- **Score estimate**: toolbar shows engine result (Black / White); no local counting, no ownership heatmap.
- **Best moves**: candidates on board (blue = sole best, green = near-best).
- Evaluation: Black win rate + point lead; ponder and wide root noise configurable in settings.

**KataGo is not bundled.** Install separately (macOS: `brew install katago`), or set executable, model, and config in settings. Empty fields auto-detect Homebrew / `engines/go`.

## Proxy play

- Select target window to start: recognize position and start a new game; spectate by default, then let the engine take a side from the toolbar.
- Self-healing on failure: retries missed clicks; after exhaustion enters “awaiting manual intervention” — one manual move on the platform resumes play.
- Emergency stop: `⌘/Ctrl+Shift+X`.
- Always-on-top to sit beside the platform (do not cover the opponent’s board or capture fails).
- macOS first run guides Screen Recording / Accessibility / Input Monitoring permissions.
- **macOS requires the target window visible** (real mouse clicks). Windows supports background capture / background clicks.
- Enable “animation confirm” when the platform animates moves, to avoid half-animation frames.

## UI and system

| Item | Details |
| --- | --- |
| Platforms | macOS 12+ (Apple Silicon, `.dmg`) · Windows x64 (NSIS installer) |
| Theme | Light / dark / system |
| Languages | 中文 / English / 日本語 |
| Shortcuts | New game, undo, resign, pass, score, best moves, pause (space), always-on-top, proxy e-stop, etc.; mac uses `⌘⇧` throughout |

Installer version string: `1.0.0-yyyyMMdd` (build date).

## Known limitations

- KataGo and network weights **are not shipped**; Go engine will not start without install or configured paths.
- Local Go UI is **19×19** only (core supports 9 / 13).
- No SGF import/export, opening book, ownership heatmap, or batch full-game analysis.
- Xiangqi repetition rules (perpetual check, etc.) are adjudicated inside the engine; app game end is checkmate / stalemate only.
- Proxy play depends on screen recognition; target board must be fully visible; platform UI styles may affect accuracy.
- Installers are unsigned: macOS — open via right-click; Windows SmartScreen may block — choose run anyway.

## License

Source under **GNU GPLv3 or later** — see [LICENSE](./LICENSE). Third-party engines, weights, and recognition model terms in [NOTICE.md](./NOTICE.md).

Summary: bundled `yolov11.onnx` from TCHESS (GPLv3); `pikafish.nnue` **not for commercial use without permission**.
