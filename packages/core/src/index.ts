/**
 * @super-go/core 公共出口。core 零运行时依赖、零 Electron 依赖（AGENTS.md 分层铁律）。
 */
export type {
  CpScore,
  EvalRecord,
  GameEndReason,
  GameKind,
  GameResult,
  GameSetup,
  GoMove,
  Move,
  Player,
  Point,
  Position,
  PositionDiff,
  RuleSet,
  ScoreKind,
  WinRateScore,
  XiangqiMove,
} from './types.js';
export { isSameMove } from './types.js';

export type { ApplyResult, Game } from './game.js';
export { MoveNode, MoveTree } from './moveTree.js';
export {
  GameStateMachine,
  type GamePhase,
  type GameStartOptions,
  type GameStateSnapshot,
  type StrengthProfile,
} from './gameState.js';
export { gameContractTests } from './contractTests.js';
export { splitmix64, toSigned64, type ZobristHash } from './zobrist.js';
