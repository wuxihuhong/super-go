/**
 * 对弈共享类型：快照 + 意图（main 生产、renderer 消费；禁止 Node/Electron 类型）。
 */
import type { EngineSide, GameResult, Player, Point } from '@super-go/core';

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
  /** 引擎执方；'both' = 互搏观战；idle 复盘 / ended 保留终局时的执方 */
  engineSide: EngineSide;
  strengthLabel: string | null;
  result: GameResult | null;
  turn: Player;
  fen: string;
  /** 根 → 当前游标的着法路径（复盘跳转即换游标） */
  moves: MainlineItem[];
  cursorNodeId: number;
  thinking: boolean;
  /** 暂停中（引擎不出招；互搏观战的主要控制） */
  paused: boolean;
  /** 当前行棋方被将 */
  inCheck: boolean;
  lastMove: { from: Point; to: Point } | null;
  /** 最新可用评估（红方视角，驱动胜率条） */
  redCp?: number;
  redMate?: number;
}

export interface NewGameIntent {
  /** 引擎执方：'first'/'second' 单方，'both' = 引擎左右互搏（人观战）；null = 无引擎（连线观战/摆谱） */
  engineSide: EngineSide;
  /** 从当前游标局面续弈；缺省从头开新局。棋力走固有配置（settings.xiangqi.strength） */
  fromCursor?: boolean;
  /** 自定义初始局面 FEN（连线重开一局：局面来自平台识别）；与 fromCursor 互斥 */
  initialFen?: string;
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
