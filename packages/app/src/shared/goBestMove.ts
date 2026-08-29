import { gtpToPoint, type Point } from '@super-go/core';
import type { EngineCandidate } from './engine';
import type { GoHintPoint } from './game';

const MAX_HINTS = 32;

/** 从引擎 PV 取第一手交叉点；虚着或畸形坐标返回 undefined */
export function bestPointFromPv(pv: readonly string[] | undefined, size: number): Point | undefined {
  return pointFromGtp(pv?.[0], size);
}

/** 盘上写成 +0.0 才算正手；+0.4 绝不能当最优 */
export function isDisplayedBestLoss(loss: number): boolean {
  return formatHintLoss(loss) === '+0.0';
}

/** 蓝色只给「写成 +0.0 且访问量最高」的那一个；忽略错误的 best 旗标 */
export function uniqueBestHint(hints: readonly GoHintPoint[]): GoHintPoint | undefined {
  let best: GoHintPoint | undefined;
  for (const hint of hints) {
    if (hint.faint || !isDisplayedBestLoss(hint.loss)) continue;
    if (best === undefined || hint.visits > best.visits) best = hint;
  }
  return best;
}

export function sameHintPoint(a: GoHintPoint, b: GoHintPoint): boolean {
  return a.point.x === b.point.x && a.point.y === b.point.y;
}

/** kata-analyze 多段 info → 盘上选点（相对搜得最深那手的目损；0 = 正手） */
export function hintPointsFromCandidates(
  candidates: readonly EngineCandidate[] | undefined,
  size: number,
  faintBelowVisits: number,
  maxPoints = MAX_HINTS,
): GoHintPoint[] {
  if (candidates === undefined || candidates.length === 0) return [];
  const seen = new Set<string>();
  const parsed: Array<{ point: Point; visits: number; lead?: number }> = [];
  for (const c of candidates) {
    const point = pointFromGtp(c.move, size);
    if (point === undefined) continue;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ point, visits: c.visits ?? 0, lead: c.lead });
  }
  parsed.sort((a, b) => b.visits - a.visits || (b.lead ?? 0) - (a.lead ?? 0));
  const top = parsed.slice(0, maxPoints);
  if (top.length === 0) return [];
  /** 目损锚在访问量最高且搜够的点，避免 34 visits 的噪声 scoreLead 当基准 */
  const champ =
    top.find((p) => p.visits >= faintBelowVisits && p.lead !== undefined) ??
    top.find((p) => p.lead !== undefined);
  const bestLead = champ?.lead;
  const points: GoHintPoint[] = top.map((p) => {
    const scored = bestLead !== undefined && p.lead !== undefined;
    const loss = scored ? Math.max(0, bestLead - p.lead) : 0;
    return {
      point: p.point,
      loss,
      visits: p.visits,
      faint: p.visits < faintBelowVisits || !scored,
      best: false,
    };
  });
  const painted = uniqueBestHint(points);
  if (painted !== undefined) painted.best = true;
  return points;
}

/** 无 candidates 时用 PV 首着兜成单点 */
export function candidatesFromEvaluation(evaluation: {
  candidates?: readonly EngineCandidate[];
  pv?: readonly string[];
  depth?: number;
  winRate?: number;
  lead?: number;
}): EngineCandidate[] {
  if (evaluation.candidates !== undefined && evaluation.candidates.length > 0) {
    return [...evaluation.candidates];
  }
  const move = evaluation.pv?.[0];
  if (move === undefined) return [];
  return [{ move, visits: evaluation.depth, winRate: evaluation.winRate, lead: evaluation.lead }];
}

export function hintsSignature(points: readonly GoHintPoint[]): string {
  return points
    .map(
      (p) =>
        `${p.point.x},${p.point.y}:${p.loss.toFixed(1)}:${visitBucket(p.visits)}:${p.faint ? 1 : 0}:${p.best ? 1 : 0}`,
    )
    .join('|');
}

/** 相对最佳手的目损（截图 "+0.0"） */
export function formatHintLoss(loss: number): string {
  return `+${Math.max(0, loss).toFixed(1)}`;
}

/** 访问量：2800 → 2.8k */
export function formatHintVisits(visits: number): string {
  if (visits >= 1000) {
    const k = visits / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(Math.max(0, Math.round(visits)));
}

function pointFromGtp(coord: string | undefined, size: number): Point | undefined {
  if (coord === undefined || coord.toLowerCase() === 'pass') return undefined;
  try {
    return gtpToPoint(coord, size);
  } catch {
    return undefined;
  }
}

function visitBucket(n: number): number {
  if (n >= 1000) return Math.round(n / 100);
  if (n >= 100) return Math.round(n / 20);
  return n;
}
