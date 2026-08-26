/**
 * 象棋棋力模型（DESIGN.md §5.5 + 固有配置化）。
 *
 * 棋力属棋种固有配置（一次配置全局保存），不是开局参数；对局中可实时调整。
 * 五种模式：
 * - elo：UCI_Elo 天梯档（1280–3133，拟人弱棋正道）
 * - depth：满强度 + 搜索深度限制
 * - time：满强度 + 每步思考时长限制
 * - nodes：满强度 + 思考节点数限制
 * - unlimited：不设限（满强度，时长仅作节奏上限）
 *
 * Pikafish 官方标尺：UCI_Elo 1280–3133（1280=SL0、3133=SL19）。
 * null / unlimited = 满强度——不下发任何弱化 setoption（粘滞防线：默认即干净）。
 * Threads / Hash 是引擎级资源（§5.7），跟棋力一起持久化、对局结束不复位。
 */
import type { StrengthProfile } from '../gameState.js';

export const XIANGQI_ELO_MIN = 1280;
export const XIANGQI_ELO_MAX = 3133;

/** 搜索线程下限（出厂默认 1） */
export const XIANGQI_THREADS_MIN = 1;
/** 引擎协议上限；实际可设上限 = min(此值, 本机 CPU 核数) */
export const XIANGQI_THREADS_MAX = 1024;

/** 本机可设线程上限：不超过 CPU 核数，至少 1 */
export function xiangqiThreadCap(cpuThreads?: number): number {
  if (typeof cpuThreads !== 'number' || !Number.isFinite(cpuThreads)) {
    return XIANGQI_THREADS_MAX;
  }
  return Math.max(XIANGQI_THREADS_MIN, Math.min(XIANGQI_THREADS_MAX, Math.round(cpuThreads)));
}

/** 置换表 MB（引擎上限极大；UI 钳到 32GB，出厂默认 16） */
export const XIANGQI_HASH_MIN = 1;
export const XIANGQI_HASH_MAX = 32_768;

/** Elo 预设档（§5.5）；另加"不设限"与自定义直填 */
export const XIANGQI_ELO_PRESETS: readonly number[] = [1400, 1800, 2200, 2600, 2900];

export type XiangqiStrengthMode = 'elo' | 'depth' | 'time' | 'nodes' | 'unlimited';

/** 象棋棋力固有配置（持久化于 settings.xiangqi.strength） */
export interface XiangqiStrengthConfig {
  mode: XiangqiStrengthMode;
  /** elo 模式：目标等级分（越界自动钳制） */
  elo: number;
  /** depth 模式：搜索深度（1–30） */
  depth: number;
  /** 每步思考时长 ms：time 模式即棋力本体，其余模式为出招节奏上限 */
  movetime: number;
  /** nodes 模式：思考节点数 */
  nodes: number;
  /**
   * 搜索线程（UCI Threads）。引擎级资源，对局结束不随弱化档复位（§5.7）。
   */
  threads: number;
  /**
   * 置换表大小 MB（UCI Hash）。引擎级资源，对局结束不随弱化档复位（§5.7）。
   */
  hash: number;
}

export const XIANGQI_STRENGTH_DEFAULT: XiangqiStrengthConfig = {
  mode: 'elo',
  elo: 1800,
  depth: 12,
  movetime: 1000,
  nodes: 400_000,
  threads: 1,
  hash: 16,
};

/** 兜底修正畸形配置（缺字段/越界钳回默认或边界） */
export function normalizeXiangqiStrength(
  config: Partial<XiangqiStrengthConfig> | undefined,
  cpuThreads?: number,
): XiangqiStrengthConfig {
  const c = { ...XIANGQI_STRENGTH_DEFAULT, ...config };
  return {
    mode: (['elo', 'depth', 'time', 'nodes', 'unlimited'] as const).includes(
      c.mode as XiangqiStrengthMode,
    )
      ? (c.mode as XiangqiStrengthMode)
      : XIANGQI_STRENGTH_DEFAULT.mode,
    elo: clampInt(c.elo, XIANGQI_ELO_MIN, XIANGQI_ELO_MAX, XIANGQI_STRENGTH_DEFAULT.elo),
    depth: clampInt(c.depth, 1, 30, XIANGQI_STRENGTH_DEFAULT.depth),
    movetime: clampInt(c.movetime, 100, 60_000, XIANGQI_STRENGTH_DEFAULT.movetime),
    nodes: clampInt(c.nodes, 1_000, 100_000_000, XIANGQI_STRENGTH_DEFAULT.nodes),
    threads: clampInt(
      c.threads,
      XIANGQI_THREADS_MIN,
      xiangqiThreadCap(cpuThreads),
      XIANGQI_STRENGTH_DEFAULT.threads,
    ),
    hash: clampInt(c.hash, XIANGQI_HASH_MIN, XIANGQI_HASH_MAX, XIANGQI_STRENGTH_DEFAULT.hash),
  };
}

/** 目标分 → StrengthProfile；越界钳制到引擎支持区间 */
export function chessStrengthFromElo(elo: number | null): StrengthProfile | null {
  if (elo === null) return null;
  const clamped = Math.max(XIANGQI_ELO_MIN, Math.min(XIANGQI_ELO_MAX, Math.round(elo)));
  return { label: String(clamped), params: { uciElo: clamped } };
}

/** 棋力配置 → 强度档（null = 满强度） */
export function chessStrengthFromConfig(config: XiangqiStrengthConfig): StrengthProfile | null {
  switch (config.mode) {
    case 'elo':
      return chessStrengthFromElo(config.elo);
    case 'depth':
      return { label: `深度 ${config.depth}`, params: { depth: config.depth } };
    case 'time':
      return {
        label: `${(config.movetime / 1000).toLocaleString('en-US')}s`,
        params: { movetime: config.movetime },
      };
    case 'nodes':
      return {
        label: `${Math.round(config.nodes / 1000)}k 节点`,
        params: { nodes: config.nodes },
      };
    case 'unlimited':
      return null;
  }
}

/** genmove 搜索约束：depth/nodes 模式以对应限制出招；其余以思考时长为节奏 */
export interface GenmoveConstraint {
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
}

export function genmoveConstraintFromConfig(config: XiangqiStrengthConfig): GenmoveConstraint {
  switch (config.mode) {
    case 'depth':
      return { depth: config.depth, movetimeMs: config.movetime * 4 };
    case 'time':
      return { movetimeMs: config.movetime };
    case 'nodes':
      return { nodes: config.nodes, movetimeMs: config.movetime * 4 };
    default:
      return { movetimeMs: config.movetime };
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
