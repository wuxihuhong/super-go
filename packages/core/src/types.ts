/**
 * 领域内核公共类型（DESIGN.md §4.1 / §5.2 / §6.4）。
 *
 * 多态原则：Move / Position / 评估分都是双棋种联合/泛型，
 * 任何结构只按单一棋种设计即违反 AGENTS.md 铁律。
 */

/** 棋种标识 */
export type GameKind = 'xiangqi' | 'go';

/**
 * 中立方：先手 / 后手。
 * 棋种内自行映射到具体颜色（象棋 first=红 second=黑；围棋 first=黑 second=白），
 * core 层与对弈状态机只认中立方。
 */
export type Player = 'first' | 'second';

/** 平面坐标点。象棋 9×10（x: 0-8 列, y: 0-9 行）；围棋 9/13/19 路 */
export interface Point {
  /** 列 */
  x: number;
  /** 行 */
  y: number;
}

// ---------------------------------------------------------------------------
// Move（多态）
// ---------------------------------------------------------------------------

/** 象棋着法：起点 → 终点两坐标 */
export interface XiangqiMove {
  kind: 'xiangqi';
  from: Point;
  to: Point;
}

/** 围棋着法：单点落子；point = null 表示 pass（虚着） */
export interface GoMove {
  kind: 'go';
  point: Point | null;
}

export type Move = XiangqiMove | GoMove;

/** 着法结构相等（不含语义合法性，供 MoveTree 复用子节点判断） */
export function isSameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'xiangqi' && b.kind === 'xiangqi') {
    return a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y;
  }
  if (a.kind === 'go' && b.kind === 'go') {
    const pa = a.point;
    const pb = b.point;
    if (pa === null || pb === null) return pa === pb;
    return pa.x === pb.x && pa.y === pb.y;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 评估（§5.2：评估语义不对称，做成多态 ScoreKind）
// ---------------------------------------------------------------------------

/** 象棋：厘兵（centipawn），走子方视角 */
export interface CpScore {
  kind: 'cp';
  value: number;
}

/** 围棋：胜率（0..1）+ 目差 */
export interface WinRateScore {
  kind: 'winRate';
  winRate: number;
  /** 领先目数 */
  lead?: number;
}

export type ScoreKind = CpScore | WinRateScore;

/** 挂在 MoveTree 节点上的评估记录（§4.2：人机/连线/胜率条数据统一挂点） */
export interface EvalRecord {
  score: ScoreKind;
  /** 搜索深度 / 访问量等元信息 */
  depth?: number;
  /** 数据来源标记（引擎名、库招等） */
  source?: string;
}

// ---------------------------------------------------------------------------
// 局面差异（§6.4：连线识别核心原语）
// ---------------------------------------------------------------------------

/**
 * 局面差异：新增点 + 消失点。
 * 象棋 = 一子两格（added=[终点]）；围棋 = 落一子 + 提子消失（removed=提子列表）。
 */
export interface PositionDiff {
  added: Point[];
  removed: Point[];
}

// ---------------------------------------------------------------------------
// 终局
// ---------------------------------------------------------------------------

/** 终局原因（双棋种并集语义，P1/P2 实现时按需收敛） */
export type GameEndReason =
  | 'mate' // 绝杀
  | 'stalemate' // 困毙（无子可动）
  | 'resign' // 认输
  | 'timeout' // 超时
  | 'twoPasses' // 围棋双虚着
  | 'agreement'; // 协议结果（和棋 / 目数协议）

/** 终局结果。winner = null 表示和局/无胜者 */
export interface GameResult {
  winner: Player | null;
  reason: GameEndReason;
}

// ---------------------------------------------------------------------------
// 开局参数（§4.1 initialPosition setup）
// ---------------------------------------------------------------------------

/** 规则集（影响围棋劫与终局；象棋侧映射到 Repetition Rule 类选项） */
export type RuleSet = 'chinese' | 'japanese' | 'aga';

/** 开局参数：围棋用路数/贴目/让子/规则集；象棋默认忽略 */
export interface GameSetup {
  /** 围棋路数：9 | 13 | 19（缺省 19） */
  boardSize?: number;
  /** 贴目（缺省 7.5，中式） */
  komi?: number;
  /** 让子数（缺省 0） */
  handicap?: number;
  rules?: RuleSet;
}

// ---------------------------------------------------------------------------
// Position 基约束
// ---------------------------------------------------------------------------

/**
 * 局面基标记：不可变值对象（apply 返回新局面，不原地修改），具体结构由棋种定义。
 * turn 必备——FEN / GTP / 引擎同步都依赖行棋方。
 */
export interface Position {
  readonly kind: GameKind;
  /** 轮到谁走 */
  readonly turn: Player;
}
