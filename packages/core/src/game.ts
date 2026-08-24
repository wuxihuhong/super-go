import type {
  GameKind,
  GameResult,
  GameSetup,
  Move,
  Player,
  Point,
  PositionDiff,
  Position,
} from './types.js';

/** apply 的返回：新局面 + 提子列表（围棋；象棋为空） */
export interface ApplyResult<P extends Position> {
  position: P;
  /** 围棋提子列表 */
  captured?: Point[];
}

/**
 * 双棋种共同实现的博弈接口（DESIGN.md §4.1）。
 *
 * 接口设计必须同时对着两个棋种验证——只按象棋设计、围棋一进来就崩，
 * 是此类重构最常见的失败模式（AGENTS.md 铁律）。P1 挂 XiangqiGame、
 * P2 挂 GoGame，两者都跑 gameContractTests()（./contractTests.ts）。
 */
export interface Game<M extends Move, P extends Position> {
  readonly kind: GameKind;
  readonly boardSize: { width: number; height: number };

  /** 开局局面（围棋携带路数/贴目/让子/规则集） */
  initialPosition(setup?: GameSetup): P;

  /** 全部合法着法 */
  legalMoves(pos: P): M[];

  isLegal(pos: P, move: M): boolean;

  /**
   * 执行着法。pos 不可变（不得原地修改）；非法着法必须抛错而不是返回原局面。
   */
  apply(pos: P, move: M): ApplyResult<P>;

  /** FEN（象棋）/ 紧凑局面串（围棋），须满足 parse(serialize(pos)) 与 pos 深度相等 */
  serialize(pos: P): string;

  parse(text: string): P;

  /** 记谱：中文纵线格式（象棋）/ GTP 坐标（围棋）。领域数据，不随 UI 语言变（§7.5） */
  moveToNotation(pos: P, move: M): string;

  /**
   * 局面差异（§6.4）：连线识别的核心原语。
   * 象棋 = 一子两格；围棋 = 落一子 + 提子消失（removed 非空是常态）。
   */
  diffPositions(before: P, after: P): PositionDiff;

  /**
   * 终局判定（象棋绝杀/困毙；围棋双虚着）。
   * history 按时间序提供局面快照（含 pos），供重复局面类判定（长将 / superko）使用。
   * 返回 null 表示对局继续。
   */
  isGameOver(pos: P, history: readonly P[]): GameResult | null;

  /** 当前行棋方（等价于 pos.turn 的便捷读取，供状态机/引擎同步用） */
  turnOf(pos: P): Player;
}
