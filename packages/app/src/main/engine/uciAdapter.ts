/**
 * UciAdapter：UCI 引擎子进程适配器（Pikafish，DESIGN.md §5.1/§5.4）。
 *
 * - stdout 按行解析全走 uciProtocol（保护性编程）；
 * - 局面同步 = 快照式全量重发（不依赖 undo）；
 * - 强度 = UCI_LimitStrength/UCI_Elo（§5.5），null 立即复位为满强度；
 * - 进程退出对外广播（上层做自动重启 + 重同步，§5.8 设计内行为）；
 * - 启动即设 ScoreType=Raw：厘兵口径（§5.4），避免默认 Elo 归一化污染分数。
 *
 * 仅依赖 node 内置模块（child_process / path / readline），不引 Electron——可在 Node 集成测试中直跑。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  EngineAdapter,
  EngineEvaluation,
  EngineStatus,
  GenMoveRequest,
  GenMoveResult,
  UciStrengthSpec,
} from '../../shared/engine';
import { parseUciLine, uciCommands, type UciInfo, type UciOption } from './uciProtocol';

const HANDSHAKE_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 10_000;

export class UciAdapter implements EngineAdapter {
  private proc: ChildProcess | null = null;
  private status: EngineStatus = 'not-found';
  private engineNameValue: string | null = null;
  private readonly optionsMap = new Map<string, UciOption>();
  private readonly exitListeners = new Set<(code: number | null) => void>();
  private readonly evaluationListeners = new Set<(evaluation: EngineEvaluation) => void>();

  /** 当前 genmove 期间最深的一帧评估（multipv=1） */
  private latestInfo: UciInfo | undefined;
  private waitBestmove: ((move: string | null) => void) | null = null;
  private launched = false;

  get engineName(): string | null {
    return this.engineNameValue;
  }

  get options(): ReadonlyMap<string, UciOption> {
    return this.optionsMap;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  async launch(binaryPath: string): Promise<void> {
    if (this.proc !== null) {
      throw new Error('引擎已在运行，重复 launch');
    }
    this.status = 'launching';
    this.proc = spawn(binaryPath, [], {
      // 引擎同目录常放 NNUE / 权重，cwd 必须落在可执行文件旁（Windows 反斜杠路径同样要算对）
      cwd: dirname(binaryPath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const proc = this.proc;

    proc.on('error', (err) => {
      this.status = 'not-found';
      this.failPending(new Error(`引擎进程启动失败: ${String(err)}`));
    });
    proc.on('exit', (code) => {
      const wasLaunched = this.launched;
      this.proc = null;
      this.launched = false;
      if (this.status !== 'quit') this.status = 'crashed';
      this.failPending(new Error(`引擎进程已退出（code=${code}）`));
      if (wasLaunched) {
        for (const cb of this.exitListeners) cb(code);
      }
    });

    const onLine = (line: string): void => {
      this.handleLine(line);
    };
    createInterface({ input: proc.stdout! }).on('line', onLine);
    proc.stderr?.on('data', () => {
      /* NNUE 加载等杂讯走 stderr，忽略 */
    });

    // 握手：uci → 等待 uciok
    await this.waitFor('uciok', () => this.send(uciCommands.handshake()), HANDSHAKE_TIMEOUT_MS);
    this.send(uciCommands.newGame());
    // 厘兵口径（引擎默认 ScoreType=Elo 会归一化分数）
    this.send(uciCommands.setOption('ScoreType', 'Raw'));
    await this.waitFor('readyok', () => this.send(uciCommands.isReady()), READY_TIMEOUT_MS);
    this.launched = true;
    this.status = 'ready';
  }

  syncPosition(fen: string, moves: readonly string[]): void {
    this.assertRunning();
    this.send(uciCommands.position(fen, moves));
  }

  async setStrength(spec: UciStrengthSpec | null): Promise<void> {
    this.assertRunning();
    if (spec === null) {
      // 复位为满强度：只关 LimitStrength，不碰 Skill Level（§5.5）
      this.send(uciCommands.setOption('UCI_LimitStrength', false));
    } else {
      this.send(uciCommands.setOption('UCI_Elo', spec.uciElo));
      this.send(uciCommands.setOption('UCI_LimitStrength', true));
    }
    await this.waitFor('readyok', () => this.send(uciCommands.isReady()), READY_TIMEOUT_MS);
  }

  async genmove(req: GenMoveRequest): Promise<GenMoveResult> {
    this.assertRunning();
    if (this.waitBestmove !== null) {
      throw new Error('上一次 genmove 尚未结束');
    }
    this.status = 'thinking';
    this.latestInfo = undefined;
    const move = await new Promise<string | null>((resolve) => {
      this.waitBestmove = resolve;
      this.send(uciCommands.go(req));
    });
    this.waitBestmove = null;
    if (this.status === 'thinking') this.status = 'ready';
    if (move === null) return { move: null };
    const evaluation =
      this.latestInfo === undefined ? undefined : this.toEvaluation(this.latestInfo);
    return { move: move === '' ? null : move, evaluation };
  }

  stopSearch(): void {
    if (this.proc !== null) this.send(uciCommands.stop());
  }

  quit(): void {
    if (this.proc === null) return;
    this.status = 'quit';
    this.send(uciCommands.quit());
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

  private handleLine(line: string): void {
    const event = parseUciLine(line);
    if (event === null) return; // 变体/畸形行：降级丢弃（AGENTS.md）
    switch (event.type) {
      case 'id':
        if (event.field === 'name') this.engineNameValue = event.value;
        break;
      case 'option':
        this.optionsMap.set(event.option.name, event.option);
        break;
      case 'info': {
        // 思考期间取 multipv=1（或未标注）的最深帧作当步评估
        if (event.info.multipv === undefined || event.info.multipv === 1) {
          this.latestInfo = event.info;
          const evaluation = this.toEvaluation(event.info);
          for (const cb of this.evaluationListeners) cb(evaluation);
        }
        break;
      }
      case 'bestmove': {
        const resolve = this.waitBestmove;
        this.waitBestmove = null;
        resolve?.(event.move);
        break;
      }
      default:
        break;
    }
    this.pendingResolvers(event);
  }

  private toEvaluation(info: UciInfo): EngineEvaluation {
    return {
      depth: info.depth,
      cp: info.cp,
      mate: info.mate,
      pv: info.pv,
    };
  }

  // 简易事件屏障：waitFor(kind) 在 handleLine 尾部统一唤醒；进程错误立即失败
  private pending: { kind: string; resolve: () => void; reject: (err: Error) => void } | null =
    null;

  private pendingResolvers(event: { type: string }): void {
    if (this.pending !== null && event.type === this.pending.kind) {
      const { resolve } = this.pending;
      this.pending = null;
      resolve();
    }
  }

  private failPending(err: Error): void {
    if (this.pending !== null) {
      const { reject } = this.pending;
      this.pending = null;
      reject(err);
    }
    const resolve = this.waitBestmove;
    if (resolve !== null) {
      this.waitBestmove = null;
      resolve(null);
    }
  }

  private waitFor(kind: 'uciok' | 'readyok', send: () => void, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending !== null && this.pending.kind === kind) this.pending = null;
        reject(new Error(`引擎 ${kind} 等待超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.pending = {
        kind,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      send();
    });
  }

  private send(command: string): void {
    this.proc?.stdin?.write(`${command}\n`);
  }

  private assertRunning(): void {
    if (this.proc === null) {
      throw new Error('引擎未运行（已退出或未 launch）');
    }
  }
}
