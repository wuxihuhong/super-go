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

// ---------------------------------------------------------------------------
// 象棋（P1）
// ---------------------------------------------------------------------------
export type { PieceType, XiangqiPiece } from './xiangqi/pieces.js';
export { pieceChar, pieceSide, pieceTypeOf, makePiece, ALL_PIECES } from './xiangqi/pieces.js';
export type { XiangqiPosition } from './xiangqi/position.js';
export {
  boardIndex,
  crossedRiver,
  inBoard,
  inOwnHalf,
  inPalace,
  makePosition,
  pieceAt,
  pointOfIndex,
  opponentOf,
  XIANGQI_HEIGHT,
  XIANGQI_WIDTH,
} from './xiangqi/position.js';
export {
  applyMove,
  diffXiangqi,
  findKing,
  isGameOver,
  isInCheck,
  isLegalMove,
  legalMoves,
  pseudoLegalMoves,
} from './xiangqi/rules.js';
export { INITIAL_FEN, parseFen, toFen } from './xiangqi/fen.js';
export { chineseNotation } from './xiangqi/notation.js';
export { iccsToMove, iccsToPoint, moveToIccs, pointToIccs } from './xiangqi/iccs.js';
export { xiangqiZobrist } from './xiangqi/zobrist.js';
export { XiangqiGame } from './xiangqi/xiangqiGame.js';
export type { PgnMeta, PgnParseResult, PgnResult } from './xiangqi/pgn.js';
export { exportPgn, parsePgn } from './xiangqi/pgn.js';
export {
  chessStrengthFromElo,
  XIANGQI_ELO_MAX,
  XIANGQI_ELO_MIN,
  XIANGQI_ELO_PRESETS,
} from './xiangqi/strength.js';
