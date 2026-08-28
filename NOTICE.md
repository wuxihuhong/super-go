# Super Go — 版权与第三方授权

本文件说明本仓库源码、随包二进制与权重的许可证，以及必须单独遵守的附加条款。
完整 GPL 正文见 [`LICENSE`](./LICENSE)。皮卡鱼 NNUE 权重的额外条款见 [`licenses/pikafish-nnue.txt`](./licenses/pikafish-nnue.txt)。

## 本项目源码

Copyright (C) 2026 Super Go contributors

Super Go 以 **GNU General Public License v3.0 或后续版本**（SPDX: `GPL-3.0-or-later`）发布。

原因（已定案，见 `AGENTS.md` / `DESIGN.md`）：

- 连线识别复用了 TCHESS（[sojourners/public-Xiangqi](https://github.com/sojourners/public-Xiangqi)）的 `yolov11.onnx`，该项目以 GPLv3 发布；
- 安装包随附未改过的 [Pikafish](https://github.com/official-pikafish/Pikafish) 可执行文件（GPLv3 或后续版本）。

规则、记谱、对弈状态机与 UI 为独立实现，不是 TCHESS 的代码派生。若将来去掉 TCHESS 模型并停止随包分发 GPL 引擎，才可能改用其它许可证。

你收到的 Super Go 副本必须能拿到对应源码。本仓库即对应源码；未修改的 Pikafish 对应源码在其官方仓库与发行页。

## 随包 / 运行时引擎与模型

这些不是 Super Go 源码的一部分，但安装包或本机探测会带上或调用它们。各自许可证独立有效。

| 组件 | 用途 | 许可证 | 来源 |
| --- | --- | --- | --- |
| **Pikafish** 可执行文件 | 象棋引擎（UCI） | [GPLv3 或后续版本](https://github.com/official-pikafish/Pikafish/blob/master/Copying.txt) | [official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish)，派生自 Stockfish |
| **pikafish.nnue** | 皮卡鱼评估权重 | **非 GPL**：仅合法用途；**未经许可不得商用** | [official-pikafish/Networks](https://github.com/official-pikafish/Networks)；全文见 `licenses/pikafish-nnue.txt` |
| **KataGo** | 围棋引擎（GTP） | [MIT](https://github.com/lightvector/KataGo/blob/master/LICENSE)（其仓库里部分第三方库另有许可证） | [lightvector/KataGo](https://github.com/lightvector/KataGo)，Copyright David J Wu 等 |
| **KataGo 官方网络**（含 Human SL） | 围棋主模型 / 拟人模型 | [MIT 风格的网络许可证](https://katagotraining.org/network_license/) | [katagotraining.org](https://katagotraining.org/)；g170 等早期网络为 CC0；第三方投稿网络以该页说明为准 |
| **yolov11.onnx** | 象棋连线棋盘识别 | GPLv3（随 TCHESS） | [sojourners/public-Xiangqi](https://github.com/sojourners/public-Xiangqi)；TCHESS README 另声明未经授权禁止商用 |

当前安装包经 `electron-builder` 随附：Pikafish 本机二进制 + `pikafish.nnue` + `yolov11.onnx`。KataGo 默认本机探测（如 Homebrew），不改其许可证。

分发 **pikafish.nnue** 的商业产品须先取得皮卡鱼团队对权重的许可（与 Super Go / Pikafish **源码** 的 GPLv3 是两件事）。TCHESS 作者对模型的商用声明见其 README。

## 桌面运行时与 UI 框架

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | 桌面壳 | MIT |
| [React](https://github.com/facebook/react) / react-dom | UI | MIT |
| [three.js](https://github.com/mrdoob/three.js) | 3D 棋盘 | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 样式 | MIT |
| [Vite](https://github.com/vitejs/vite) / [electron-vite](https://github.com/alex8088/electron-vite) | 构建 | MIT |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime)（`onnxruntime-node`） | YOLO 推理 | MIT |
| [@nut-tree/nut-js](https://github.com/nut-tree/nut.js) | 鼠标监听 / 注入 | Apache-2.0 |
| [@nut-tree/node-mac-permissions](https://github.com/nut-tree/node-mac-permissions) | macOS 权限 | MIT |
| [koffi](https://github.com/Koromix/koffi) | Windows PrintWindow FFI | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 语言 | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | 测试 | MIT |

npm 传递依赖各自保留原许可证；完整清单见各包内 `LICENSE`。MIT / Apache-2.0 与本项目的 GPLv3 **组合分发**相容：组合作品按 GPLv3 提供，上述组件本身仍是原许可证。

## 参考项目（无代码继承）

[TCHESS / public-Xiangqi](https://github.com/sojourners/public-Xiangqi)（GPLv3）仅作设计与识别模型参考。除已声明复用的 `yolov11.onnx` 外，本仓库不包含其 Java 源码。

## 对应源码（GPLv3 §6）

| 作品 | 对应源码 |
| --- | --- |
| Super Go | 本 Git 仓库 |
| Pikafish（未修改官方二进制） | https://github.com/official-pikafish/Pikafish 及对应 Release 源码包 |
| yolov11.onnx | https://github.com/sojourners/public-Xiangqi |
| KataGo（若随包或本机安装） | https://github.com/lightvector/KataGo |
