/**
 * GtpAdapter：KataGo GTP 适配器（DESIGN.md §5.1 / §5.3）。
 *
 * 局面同步 = boardsize + 规则 + komi + clear_board +（让子或摆子）+ 重放，不依赖 undo。
 * 出招走 kata-genmove_analyze，评估帧为 winRate + 目差。
 * ponder / 强度均可 kata-set-param 运行时切换（本机 1.18 已核实）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import {
  goMoveToGtp,
  handicapPoints,
  parseGo,
  pointToGtp,
  type GoPosition,
  type Player,
} from '@super-go/core';
import type {
  AnalyzeRequest,
  EngineAdapter,
  EngineEvaluation,
  EngineLaunchSource,
  EngineStatus,
  GenMoveRequest,
  GenMoveResult,
  GtpLaunchSpec,
  GtpStrengthSpec,
  StrengthSpec,
} from '../../shared/engine';
import {
  gtpCommands,
  parseGtpLine,
  pickBestInfo,
  type GtpInfo,
} from './gtpProtocol';

const HANDSHAKE_TIMEOUT_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;
const ANALYZE_TIMEOUT_MS = 30_000;
/** 棋力只限一维时，把另一维拉到引擎哨兵，避免和分析/上一档粘在一起 */
const SEARCH_UNLIMITED_VISITS = 1_000_000_000;
const SEARCH_UNLIMITED_TIME_SEC = 1e20;

function isLaunchSpec(source: EngineLaunchSource): source is GtpLaunchSpec {
  return typeof source !== 'string';
}

function colorOf(player: Player): 'B' | 'W' {
  return player === 'first' ? 'B' : 'W';
}

function rulesToGtp(rules: string): string {
  if (rules === 'japanese') return 'japanese';
  if (rules === 'aga') return 'aga';
  return 'chinese';
}

export class GtpAdapter implements EngineAdapter {
  private proc: ChildProcess | null = null;
  private status: EngineStatus = 'not-found';
  private engineNameValue: string | null = null;
  private readonly exitListeners = new Set<(code: number | null) => void>();
  private readonly evaluationListeners = new Set<(evaluation: EngineEvaluation) => void>();
  private launched = false;
  private commands = new Set<string>();
  private latestInfo: GtpInfo | undefined;
  private latestInfos: GtpInfo[] = [];
  private waitMove: ((move: string | null) => void) | null = null;
  private pending: {
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    parts: string[];
    started: boolean;
  } | null = null;
  private nextColor: 'B' | 'W' = 'B';
  private analyzing = false;
  private rpcTail: Promise<void> = Promise.resolve();
  /** 对局强度：分析后需还原，避免 fastVisits 粘滞 */
  private lastStrength: GtpStrengthSpec | null = null;

  get engineName(): string | null {
    return this.engineNameValue;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  async launch(source: EngineLaunchSource): Promise<void> {
    if (this.proc !== null) throw new Error('引擎已在运行，重复 launch');
    if (!isLaunchSpec(source)) {
      throw new Error('KataGo 启动需要 binary + model + config');
    }
    this.status = 'launching';
    const args = ['gtp', '-model', source.modelPath, '-config', source.configPath];
    this.proc = spawn(source.binaryPath, args, {
      cwd: dirname(source.configPath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const proc = this.proc;
    proc.on('error', (err) => {
      this.status = 'not-found';
      this.failPending(new Error(`KataGo 启动失败: ${String(err)}`));
    });
    proc.on('exit', (code) => {
      const wasLaunched = this.launched;
      this.proc = null;
      this.launched = false;
      if (this.status !== 'quit') this.status = 'crashed';
      this.failPending(new Error(`KataGo 已退出（code=${code}）`));
      if (wasLaunched) {
        for (const cb of this.exitListeners) cb(code);
      }
    });
    createInterface({ input: proc.stdout! }).on('line', (line) => this.handleLine(line));
    proc.stderr?.on('data', () => {
      /* 启动 banner / Metal 日志 */
    });

    const name = await this.rpc(gtpCommands.name(), HANDSHAKE_TIMEOUT_MS);
    this.engineNameValue = name.length > 0 ? name : 'KataGo';
    await this.rpc(gtpCommands.version(), HANDSHAKE_TIMEOUT_MS);
    const listed = await this.rpc(gtpCommands.listCommands(), HANDSHAKE_TIMEOUT_MS);
    this.commands = new Set(listed.split(/\s+/).filter((c) => c.length > 0));
    this.launched = true;
    this.status = 'ready';
  }

  syncPosition(serialized: string, moves: readonly string[]): void {
    this.assertRunning();
    const root = parseGo(serialized);
    const size = root.size;
    void this.enqueue(async () => {
      await this.rpc(gtpCommands.boardsize(size));
      if (this.commands.has('kata-set-rules')) {
        await this.rpc(gtpCommands.kataSetRules(rulesToGtp(root.rules)));
      }
      await this.rpc(gtpCommands.komi(root.komi));
      await this.rpc(gtpCommands.clearBoard());
      const usedHandicap = await this.placeRoot(root);
      let color: Player = usedHandicap ? 'second' : 'first';
      for (const coord of moves) {
        await this.rpc(gtpCommands.play(colorOf(color), coord));
        color = color === 'first' ? 'second' : 'first';
      }
      this.nextColor = colorOf(color);
    });
  }

  async setStrength(spec: StrengthSpec | null): Promise<void> {
    this.assertRunning();
    await this.enqueue(async () => {
      if (spec === null || !('maxVisits' in spec || 'maxTimeSec' in spec)) {
        this.lastStrength = null;
        await this.applySearchParams({ exclusive: true });
        return;
      }
      this.lastStrength = { maxVisits: spec.maxVisits, maxTimeSec: spec.maxTimeSec };
      await this.applySearchParams({ ...this.lastStrength, exclusive: true });
    });
  }

  async setPonder(enabled: boolean): Promise<void> {
    this.assertRunning();
    await this.enqueue(async () => {
      if (!this.commands.has('kata-set-param')) return;
      await this.rpc(gtpCommands.kataSetParam('ponderingEnabled', enabled));
    });
  }

  async genmove(req: GenMoveRequest): Promise<GenMoveResult> {
    this.assertRunning();
    if (this.waitMove !== null) throw new Error('上一次 genmove 尚未结束');
    await this.enqueue(async () => {
      await this.applySearchParams({
        maxVisits: req.maxVisits,
        maxTimeSec: req.maxTimeSec ?? (req.movetimeMs !== undefined ? req.movetimeMs / 1000 : undefined),
        exclusive: true,
      });
    });
    this.status = 'thinking';
    this.latestInfo = undefined;
    this.latestInfos = [];
    const color = req.color ?? this.nextColor;
    const cmd = this.commands.has('kata-genmove_analyze')
      ? gtpCommands.kataGenmoveAnalyze(color)
      : gtpCommands.genmove(color);
    const thinkSec = req.maxTimeSec ?? (req.movetimeMs !== undefined ? req.movetimeMs / 1000 : undefined);
    const timeoutMs =
      thinkSec !== undefined
        ? Math.min(120_000, Math.max(ANALYZE_TIMEOUT_MS, (thinkSec + 20) * 1000))
        : 120_000;
    const move = await new Promise<string | null>((resolve) => {
      this.waitMove = resolve;
      this.send(cmd);
      setTimeout(() => {
        if (this.waitMove === resolve) {
          this.waitMove = null;
          resolve(null);
        }
      }, timeoutMs);
    });
    this.waitMove = null;
    if (this.status === 'thinking') this.status = 'ready';
    if (move === null || move.toLowerCase() === 'resign') return { move: null };
    this.nextColor = color === 'B' ? 'W' : 'B';
    return {
      move: move.toLowerCase() === 'pass' ? 'pass' : move,
      evaluation:
        this.latestInfo === undefined ? undefined : this.toEvaluation(this.latestInfo, this.latestInfos),
    };
  }

  startAnalysis(opts: AnalyzeRequest): void {
    if (this.proc === null) return;
    this.analyzing = true;
    void this.enqueue(async () => {
      if (!this.analyzing) return;
      await this.applySearchParams({
        maxVisits: opts.maxVisits,
        maxTimeSec: opts.maxTimeSec,
        wideRootNoise: opts.wideRootNoise,
      });
      if (!this.analyzing) return;
      this.send(gtpCommands.kataAnalyze(this.nextColor));
    });
  }

  stopAnalysis(): void {
    if (!this.analyzing) return;
    this.analyzing = false;
    this.send(gtpCommands.stop());
    void this.enqueue(async () => {
      await this.restoreStrength();
    });
  }

  async analyzeOnce(opts: AnalyzeRequest): Promise<EngineEvaluation | undefined> {
    this.assertRunning();
    return this.enqueue(async () => {
      this.latestInfo = undefined;
      await this.applySearchParams({
        maxVisits: opts.maxVisits,
        maxTimeSec: opts.maxTimeSec,
        wideRootNoise: opts.wideRootNoise,
      });
      const useSearch = this.commands.has('kata-search_analyze');
      const cmd = useSearch
        ? gtpCommands.kataSearchAnalyze(this.nextColor)
        : gtpCommands.kataAnalyze(this.nextColor);
      this.analyzing = !useSearch;
      this.status = 'thinking';
      try {
        if (useSearch) {
          await this.rpc(cmd, ANALYZE_TIMEOUT_MS);
        } else {
          this.send(cmd);
          const deadline = Date.now() + Math.min(ANALYZE_TIMEOUT_MS, (opts.maxTimeSec ?? 2) * 1000 + 500);
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
            const visits = (this.latestInfo as GtpInfo | undefined)?.visits ?? 0;
            if (visits >= (opts.maxVisits ?? 1)) break;
          }
          this.send(gtpCommands.stop());
          this.analyzing = false;
          await this.rpcWaitOptional();
        }
      } finally {
        this.analyzing = false;
        if (this.status === 'thinking') this.status = 'ready';
        await this.restoreStrength();
      }
      return this.latestInfo === undefined
        ? undefined
        : this.toEvaluation(this.latestInfo, this.latestInfos);
    });
  }

  async finalScore(): Promise<string | null> {
    this.assertRunning();
    try {
      return await this.enqueue(() => this.rpc(gtpCommands.finalScore()));
    } catch {
      return null;
    }
  }

  stopSearch(): void {
    if (this.proc === null) return;
    this.send(gtpCommands.stop());
    const resolve = this.waitMove;
    if (resolve !== null) {
      this.waitMove = null;
      resolve(null);
    }
  }

  quit(): void {
    if (this.proc === null) return;
    this.status = 'quit';
    this.send(gtpCommands.quit());
  }

  onExit(cb: (code: number | null) => void): () => void {
    this.exitListeners.add(cb);
    return () => this.exitListeners.delete(cb);
  }

  onEvaluation(cb: (evaluation: EngineEvaluation) => void): () => void {
    this.evaluationListeners.add(cb);
    return () => this.evaluationListeners.delete(cb);
  }

  // -------------------------------------------------------------------------

  private async placeRoot(root: GoPosition): Promise<boolean> {
    const stones: Array<{ color: Player; gtp: string }> = [];
    for (let i = 0; i < root.cells.length; i++) {
      const cell = root.cells[i];
      if (cell === null || cell === undefined) continue;
      const y = Math.floor(i / root.size);
      const x = i % root.size;
      stones.push({ color: cell, gtp: pointToGtp({ x, y }, root.size) });
    }
    if (stones.length === 0) return false;
    const hc = root.handicap;
    if (hc >= 2 && hc <= 9) {
      const expected = new Set(handicapPoints(root.size, hc).map((p) => pointToGtp(p, root.size)));
      const blacks = stones.filter((s) => s.color === 'first').map((s) => s.gtp);
      const whites = stones.filter((s) => s.color === 'second');
      if (whites.length === 0 && blacks.length === expected.size && blacks.every((g) => expected.has(g))) {
        await this.rpc(gtpCommands.fixedHandicap(hc));
        return true;
      }
    }
    for (const s of stones) {
      await this.rpc(gtpCommands.play(colorOf(s.color), s.gtp));
    }
    return root.turn === 'second';
  }

  private handleLine(line: string): void {
    const event = parseGtpLine(line);
    if (event === null) {
      if (this.pending?.started) this.pending.parts.push(line);
      return;
    }
    switch (event.type) {
      case 'info': {
        const best = pickBestInfo(event.infos);
        if (best !== undefined) {
          this.latestInfos = event.infos;
          this.latestInfo = best;
          const evaluation = this.toEvaluation(best, event.infos);
          for (const cb of this.evaluationListeners) cb(evaluation);
        }
        break;
      }
      case 'play': {
        const resolve = this.waitMove;
        this.waitMove = null;
        resolve?.(event.move);
        break;
      }
      case 'success':
        if (this.waitMove !== null && event.text !== '') {
          const resolve = this.waitMove;
          this.waitMove = null;
          resolve(event.text);
        }
        if (this.pending !== null) {
          this.pending.started = true;
          if (event.text !== '') this.pending.parts.push(event.text);
        }
        break;
      case 'error':
        if (this.pending !== null) {
          const { reject } = this.pending;
          this.pending = null;
          reject(new Error(event.text || 'GTP 错误'));
        }
        if (this.waitMove !== null) {
          const resolve = this.waitMove;
          this.waitMove = null;
          resolve(null);
        }
        break;
      case 'responseEnd':
        if (this.pending?.started) {
          const { resolve, parts } = this.pending;
          this.pending = null;
          resolve(parts.join('\n'));
        }
        break;
    }
  }

  private toEvaluation(info: GtpInfo, infos: readonly GtpInfo[] = []): EngineEvaluation {
    const list = infos.length > 0 ? infos : info.move !== undefined ? [info] : [];
    return {
      depth: info.visits,
      winRate: info.winRate,
      lead: info.lead,
      pv: info.pv ?? (info.move !== undefined ? [info.move] : undefined),
      candidates: list
        .filter((row): row is GtpInfo & { move: string } => row.move !== undefined)
        .map((row) => ({
          move: row.move,
          visits: row.visits,
          winRate: row.winRate,
          lead: row.lead,
        })),
    };
  }

  private rpc(command: string, timeoutMs = RPC_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending !== null) this.pending = null;
        reject(new Error(`GTP 等待超时: ${command}`));
      }, timeoutMs);
      this.pending = {
        started: false,
        parts: [],
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.send(command);
    });
  }

  private async rpcWaitOptional(): Promise<void> {
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
    } catch {
      /* ignore */
    }
  }

  private async applySearchParams(opts: {
    maxVisits?: number;
    maxTimeSec?: number;
    wideRootNoise?: number;
    /** 出招：只限 visits 或只限时间，另一维拉到无上限，避免和分析抢同一套参数 */
    exclusive?: boolean;
  }): Promise<void> {
    if (!this.commands.has('kata-set-param')) return;
    if (opts.exclusive === true) {
      const visits = opts.maxVisits ?? SEARCH_UNLIMITED_VISITS;
      const timeSec = opts.maxTimeSec ?? SEARCH_UNLIMITED_TIME_SEC;
      await this.rpc(gtpCommands.kataSetParam('maxVisits', Math.max(1, Math.round(visits))));
      await this.rpc(gtpCommands.kataSetParam('maxTime', timeSec));
    } else {
      if (opts.maxVisits !== undefined) {
        await this.rpc(gtpCommands.kataSetParam('maxVisits', Math.max(1, Math.round(opts.maxVisits))));
      }
      if (opts.maxTimeSec !== undefined) {
        await this.rpc(gtpCommands.kataSetParam('maxTime', opts.maxTimeSec));
      }
    }
    if (opts.wideRootNoise !== undefined) {
      await this.rpc(gtpCommands.kataSetParam('analysisWideRootNoise', opts.wideRootNoise));
    }
  }

  private async restoreStrength(): Promise<void> {
    if (this.lastStrength === null) {
      await this.applySearchParams({ exclusive: true });
      return;
    }
    await this.applySearchParams({ ...this.lastStrength, exclusive: true });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.rpcTail.then(job, job);
    this.rpcTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private drain(): Promise<void> {
    return this.rpcTail.catch(() => undefined);
  }

  private failPending(err: Error): void {
    if (this.pending !== null) {
      const { reject } = this.pending;
      this.pending = null;
      reject(err);
    }
    const resolve = this.waitMove;
    if (resolve !== null) {
      this.waitMove = null;
      resolve(null);
    }
  }

  private send(command: string): void {
    this.proc?.stdin?.write(`${command}\n`);
  }

  private assertRunning(): void {
    if (this.proc === null) throw new Error('KataGo 未运行（已退出或未 launch）');
  }
}

export function goMoveCoord(move: { point: { x: number; y: number } | null }, size: number): string {
  return goMoveToGtp({ kind: 'go', point: move.point }, size);
}
