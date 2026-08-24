/**
 * 引擎层共享类型（DESIGN.md §5.2）。
 *
 * main 实现、renderer 消费；禁止引入 Node/Electron 类型。
 * EngineAdapter 为 P1 裁剪版：分析（startAnalysis/stopAnalysis）留 P2+，
 * ponder（§5.9）留 P2。
 */
import type { Player } from '@super-go/core';

/** 引擎进程状态（引擎信息面板 / 状态点用） */
export type EngineStatus =
  | 'not-found' // 未找到可执行文件
  | 'launching' // 握手中
  | 'ready' // 空闲
  | 'thinking' // 搜索中
  | 'crashed' // 异常退出（等待自动重启）
  | 'quit'; // 正常关闭

/** 引擎面板数据（IPC 推送） */
export interface EnginePanelInfo {
  name: string | null;
  status: EngineStatus;
  /** 当前强度档显示（null = 满强度） */
  strengthLabel: string | null;
}

/** 出招搜索约束（§5.5 棋力模式）：深度/节点/时长可组合，时长作上限兜底 */
export interface GenMoveRequest {
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
}

/** 引擎评估帧（info 行提炼；cp 为走子方视角厘兵） */
export interface EngineEvaluation {
  depth?: number;
  cp?: number;
  mate?: number;
  pv?: string[];
}

/** 强度规格：null = 满强度（不下发任何弱化选项，§5.5 粘滞防线） */
export interface UciStrengthSpec {
  uciElo: number;
}

export interface GenMoveResult {
  /** ICCS 坐标（如 h2e2）；引擎无着可走时为 null */
  move: string | null;
  evaluation?: EngineEvaluation;
}

/**
 * UCI 引擎适配器接口。局面对齐为快照式：fen 为初始局面、moves 为重放着法序列，
 * 适配器内部全量重发（DESIGN.md §5.2：不依赖 undo）。
 */
export interface EngineAdapter {
  readonly engineName: string | null;
  launch(binaryPath: string): Promise<void>;
  syncPosition(fen: string, moves: readonly string[]): void;
  genmove(req: GenMoveRequest): Promise<GenMoveResult>;
  setStrength(spec: UciStrengthSpec | null): Promise<void>;
  stopSearch(): void;
  quit(): void;
  getStatus(): EngineStatus;
  /** 引擎进程退出（崩溃监测 → 上层重启重同步，§5.8）。返回解绑函数 */
  onExit(cb: (code: number | null) => void): () => void;
  /** 思考中的评估帧（胜率条/引擎面板）。返回解绑函数 */
  onEvaluation(cb: (evaluation: EngineEvaluation) => void): () => void;
}

/** 供 UI 显示的行棋方别名 */
export type { Player };
