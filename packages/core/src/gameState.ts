import type { GameKind, GameResult, Player } from './types.js';

/**
 * 强度档（DESIGN.md §5.5）。
 * 生命周期绑定对局而非引擎：默认满强度（null，不下发弱化选项）；
 * 对局结束 / 中止 / 切回分析必须立即复位——放水选项是粘滞的，
 * 忘记复位会污染分析数据（AGENTS.md 特殊注意点，本状态机统一管理时机）。
 */
export interface StrengthProfile {
  /** 展示标签：象棋 "2200"（等级分）/ 围棋 "3段"（段位直选） */
  label: string;
  /** 棋种相关参数负载。P1: { uciElo } 等；P2: { humanRank } 等 */
  params: Readonly<Record<string, number | string | boolean>>;
}

export type GamePhase = 'idle' | 'playing' | 'ended';

export interface GameStartOptions {
  /** 引擎执方；null = 无人机（纯摆谱 / 分析） */
  engineSide: Player | null;
  /** 强度档；null = 满强度（§5.5 默认） */
  strength: StrengthProfile | null;
}

export interface GameStateSnapshot {
  phase: GamePhase;
  engineSide: Player | null;
  strength: StrengthProfile | null;
  result: GameResult | null;
}

/**
 * 对弈状态机骨架（DESIGN.md §4.3）。
 * 管理对局元状态：阶段、引擎执方、强度档生命周期、终局结果。
 * 局面本体在 MoveTree，行棋合法性在 Game——本机不做规则判断。
 *
 * 时钟 / 认输 / 求和 / 让先等交互入口在 P1 接入对弈 UI 时扩展；
 * P0 立住的是强度档生命周期这条最容易出错的转移规则（见 __tests__/gameState.test.ts）。
 */
export class GameStateMachine {
  private _phase: GamePhase = 'idle';
  private _engineSide: Player | null = null;
  private _strength: StrengthProfile | null = null;
  private _result: GameResult | null = null;

  get phase(): GamePhase {
    return this._phase;
  }

  get engineSide(): Player | null {
    return this._engineSide;
  }

  get strength(): StrengthProfile | null {
    return this._strength;
  }

  get result(): GameResult | null {
    return this._result;
  }

  get snapshot(): GameStateSnapshot {
    return {
      phase: this._phase,
      engineSide: this._engineSide,
      strength: this._strength,
      result: this._result,
    };
  }

  constructor(readonly kind: GameKind) {}

  /** 开局。playing 中重复 start 抛错——要么 end 要么 abort。 */
  start(options: GameStartOptions): void {
    if (this._phase === 'playing') {
      throw new Error('对局已在进行，不能重复 start');
    }
    this._phase = 'playing';
    this._engineSide = options.engineSide;
    this._strength = options.strength;
    this._result = null;
  }

  /** 正常终局（绝杀 / 认输 / 双虚着……）。记录结果并复位强度档与引擎执方。 */
  end(result: GameResult): void {
    if (this._phase !== 'playing') {
      throw new Error('没有进行中的对局');
    }
    this._result = result;
    this._phase = 'ended';
    this.resetEngineOverrides();
  }

  /** 中止对局（切回分析 / 用户放弃）：无结果，直接回 idle 并复位。 */
  abort(): void {
    if (this._phase !== 'playing') {
      throw new Error('没有进行中的对局');
    }
    this._phase = 'idle';
    this.resetEngineOverrides();
  }

  /** 从任意阶段回到全新 idle（对局结束后的"再来一局"） */
  reset(): void {
    this._phase = 'idle';
    this._result = null;
    this.resetEngineOverrides();
  }

  /**
   * 强度档/引擎执方复位——粘滞防线。P1 在此处挂接引擎侧
   * setStrength(null)（等价 UCI_LimitStrength 关、Skill Level 不碰，§5.5）。
   */
  private resetEngineOverrides(): void {
    this._strength = null;
    this._engineSide = null;
  }
}
