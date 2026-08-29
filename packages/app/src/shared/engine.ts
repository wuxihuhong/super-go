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
  | 'delaying' // 已算出着法，拟人延迟待落子
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
  maxVisits?: number;
  maxTimeSec?: number;
  /** GTP 行棋色（B/W）；缺省由适配器按上次 sync 推断 */
  color?: 'B' | 'W';
}

/** kata-analyze 一段 info（一手候选） */
export interface EngineCandidate {
  move: string;
  visits?: number;
  winRate?: number;
  lead?: number;
}

/** 引擎评估帧（info 行提炼；cp 为走子方视角厘兵；围棋为胜率+目差） */
export interface EngineEvaluation {
  depth?: number;
  cp?: number;
  mate?: number;
  pv?: string[];
  /** 走子方胜率 0..1（围棋） */
  winRate?: number;
  /** 走子方目差（围棋） */
  lead?: number;
  /** 本帧全部候选（按引擎 info 原序；围棋选点叠加） */
  candidates?: EngineCandidate[];
  /** kata-analyze 流代次；stop 之后的残余 info 仍带旧值，hint 通路用来丢弃 */
  streamId?: number;
}

/** 强度规格：null = 满强度（不下发任何弱化选项，§5.5 粘滞防线） */
export interface UciStrengthSpec {
  uciElo: number;
}

/** GTP 强度：visits / 时限；与 UciStrengthSpec 互斥字段 */
export interface GtpStrengthSpec {
  maxVisits?: number;
  maxTimeSec?: number;
}

export type StrengthSpec = UciStrengthSpec | GtpStrengthSpec;

/** KataGo 启动描述符（可执行 + config + 主模型） */
export interface GtpLaunchSpec {
  binaryPath: string;
  modelPath: string;
  configPath: string;
}

export type EngineLaunchSource = string | GtpLaunchSpec;

export interface AnalyzeRequest {
  maxVisits?: number;
  maxTimeSec?: number;
  intervalSec?: number;
  wideRootNoise?: number;
}

/** 引擎级资源（§5.7）：对局结束不随弱化档复位 */
export interface UciEngineResources {
  threads: number;
  hash: number;
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
  launch(source: EngineLaunchSource): Promise<void>;
  syncPosition(fen: string, moves: readonly string[]): void;
  genmove(req: GenMoveRequest): Promise<GenMoveResult>;
  setStrength(spec: StrengthSpec | null, resources?: UciEngineResources): Promise<void>;
  stopSearch(): void;
  quit(): void;
  getStatus(): EngineStatus;
  /** 引擎进程退出（崩溃监测 → 上层重启重同步，§5.8）。返回解绑函数 */
  onExit(cb: (code: number | null) => void): () => void;
  /** 思考中的评估帧（胜率条/引擎面板）。返回解绑函数 */
  onEvaluation(cb: (evaluation: EngineEvaluation) => void): () => void;
  startAnalysis?(opts: AnalyzeRequest): void;
  stopAnalysis?(): void;
  setPonder?(enabled: boolean): Promise<void>;
  finalScore?(): Promise<string | null>;
  analyzeOnce?(opts: AnalyzeRequest): Promise<EngineEvaluation | undefined>;
}

/** 供 UI 显示的行棋方别名 */
export type { Player };
