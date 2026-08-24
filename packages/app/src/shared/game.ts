/**
 * 对弈共享类型：快照 + 意图（main 生产、renderer 消费；禁止 Node/Electron 类型）。
 */
import type { GameResult, Player, Point } from '@super-go/core';

export interface MainlineItem {
  nodeId: number;
  /** ICCS 坐标（h2e2） */
  iccs: string;
  /** 中文纵线记谱（领域数据，不随 UI 语言切换） */
  notation: string;
  /** 该着引擎评估（红方视角厘兵） */
  redCp?: number;
  /** 杀棋步数（红方视角：正 = 红方 N 步杀） */
  redMate?: number;
  depth?: number;
}

export interface GameSnapshot {
  phase: 'idle' | 'playing' | 'ended';
  /** 引擎执方；idle 复盘 / ended 保留终局时的执方 */
  engineSide: Player | null;
  strengthLabel: string | null;
  result: GameResult | null;
  turn: Player;
  fen: string;
  /** 根 → 当前游标的着法路径（复盘跳转即换游标） */
  moves: MainlineItem[];
  cursorNodeId: number;
  thinking: boolean;
  /** 当前行棋方被将 */
  inCheck: boolean;
  lastMove: { from: Point; to: Point } | null;
  /** 最新可用评估（红方视角，驱动胜率条） */
  redCp?: number;
  redMate?: number;
}

export interface NewGameIntent {
  /** 引擎执方 */
  engineSide: Player;
  /** null = 不设限（满强度） */
  elo: number | null;
  /** 从当前游标局面续弈（导入复盘后接着下）；缺省从头开新局 */
  fromCursor?: boolean;
}

export interface PlayMoveIntent {
  from: Point;
  to: Point;
}

export interface IntentError {
  ok: false;
  error: string;
}
export interface IntentOk {
  ok: true;
}
export type IntentResult = IntentOk | IntentError;

/** 思考中的实时评估帧（红方视角） */
export interface LiveEval {
  redCp?: number;
  redMate?: number;
  depth?: number;
}
