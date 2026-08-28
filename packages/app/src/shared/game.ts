/**
 * 对弈共享类型：快照 + 意图（main 生产、renderer 消费；禁止 Node/Electron 类型）。
 */
import type { EngineSide, GameKind, GameResult, GameSetup, Player, Point } from '@super-go/core';

export interface MainlineItem {
  nodeId: number;
  /** 象棋 ICCS / 围棋 GTP（复用字段名以免拆快照） */
  iccs: string;
  /** 中文纵线记谱 / GTP 坐标（领域数据，不随 UI 语言切换） */
  notation: string;
  /** 该着引擎评估（红方视角厘兵） */
  redCp?: number;
  /** 杀棋步数（红方视角：正 = 红方 N 步杀） */
  redMate?: number;
  /** 黑方视角胜率 0..1（围棋） */
  winRate?: number;
  /** 黑方视角目差（围棋） */
  lead?: number;
  depth?: number;
}

export interface GameSnapshot {
  /** 缺省 xiangqi：旧快照/测试不写此字段 */
  kind?: GameKind;
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
  /** 引擎已算出着法、拟人延迟中（秒）；无延迟则为 undefined */
  playDelaySec?: number;
  /** 暂停中（引擎不出招；互搏观战的主要控制） */
  paused: boolean;
  /** 当前行棋方被将（围棋恒 false） */
  inCheck: boolean;
  lastMove: { from: Point; to: Point } | null;
  /** 围棋最后一手；point=null 表示虚着 */
  lastPoint?: Point | null;
  /** 最新可用评估（红方视角，驱动胜率条） */
  redCp?: number;
  redMate?: number;
  winRate?: number;
  lead?: number;
  /** 最新可用搜索深度；无新帧时底栏沿用，未出现过才是空 */
  depth?: number;
  boardSize?: number;
  komi?: number;
}

export interface NewGameIntent {
  /** 引擎执方：'first'/'second' 单方，'both' = 引擎左右互搏（人观战）；null = 无引擎（连线观战/摆谱）。
   *  **缺省不设置引擎执方**（2026-08-26 定稿）：新开一局 = 引擎不上场，上场与否只由工具栏
   *  红/黑开关（setEngineSide）决定——开局的选项只定棋盘朝向；fromCursor 续弈/悔棋复活保留当前执方 */
  engineSide?: EngineSide;
  /** 从当前游标局面续弈；缺省从头开新局。棋力走固有配置（settings.xiangqi.strength） */
  fromCursor?: boolean;
  /** 自定义初始局面 FEN / 围棋局面串（连线重开一局：局面来自平台识别）；与 fromCursor 互斥 */
  initialFen?: string;
  /** 围棋开局：路数 / 贴目 / 让子 / 规则集 */
  goSetup?: GameSetup;
}

export interface PlayMoveIntent {
  /** 象棋：起点 → 终点 */
  from?: Point;
  to?: Point;
  /** 围棋：交叉点；显式 null = 虚着 */
  point?: Point | null;
}

export interface IntentError {
  ok: false;
  error: string;
}
export interface IntentOk {
  ok: true;
}
export type IntentResult = IntentOk | IntentError;

/** 思考中的实时评估帧（象棋红方视角 / 围棋黑方视角） */
export interface LiveEval {
  redCp?: number;
  redMate?: number;
  depth?: number;
  winRate?: number;
  lead?: number;
}
