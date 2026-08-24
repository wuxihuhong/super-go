import { describe, expect, it } from 'vitest';
import { GameStateMachine, type StrengthProfile } from '../gameState.js';

const elo2200: StrengthProfile = { label: '2200', params: { uciElo: 2200 } };

function makeMachine(): GameStateMachine {
  return new GameStateMachine('xiangqi');
}

describe('GameStateMachine', () => {
  it('初始为 idle，无引擎执方、无强度档（满强度默认）', () => {
    const sm = makeMachine();
    expect(sm.snapshot).toEqual({
      phase: 'idle',
      engineSide: null,
      strength: null,
      result: null,
    });
  });

  it('start 进入 playing 并记录引擎执方与强度档', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'second', strength: elo2200 });
    expect(sm.phase).toBe('playing');
    expect(sm.engineSide).toBe('second');
    expect(sm.strength).toEqual(elo2200);
  });

  it('playing 中重复 start 抛错', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'first', strength: null });
    expect(() => sm.start({ engineSide: 'first', strength: null })).toThrow();
  });

  it('strength = null 表示满强度（不下发弱化选项），是合法开局形态', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'first', strength: null });
    expect(sm.strength).toBeNull();
  });

  it('end 记录终局结果并复位强度档与引擎执方（粘滞防线）', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'second', strength: elo2200 });
    sm.end({ winner: 'first', reason: 'resign' });
    expect(sm.phase).toBe('ended');
    expect(sm.result).toEqual({ winner: 'first', reason: 'resign' });
    expect(sm.strength).toBeNull();
    expect(sm.engineSide).toBeNull();
  });

  it('end/abort 只对 playing 有效', () => {
    const sm = makeMachine();
    expect(() => sm.end({ winner: null, reason: 'agreement' })).toThrow();
    expect(() => sm.abort()).toThrow();
  });

  it('abort（切回分析）回 idle 并复位——放水不残留进拆棋', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'second', strength: elo2200 });
    sm.abort();
    expect(sm.phase).toBe('idle');
    expect(sm.strength).toBeNull();
    expect(sm.engineSide).toBeNull();
    expect(sm.result).toBeNull();
  });

  it('reset 从 ended 回到全新 idle（再来一局）', () => {
    const sm = makeMachine();
    sm.start({ engineSide: 'first', strength: elo2200 });
    sm.end({ winner: 'second', reason: 'mate' });
    sm.reset();
    expect(sm.snapshot).toEqual({
      phase: 'idle',
      engineSide: null,
      strength: null,
      result: null,
    });
    // 复位后可重新开局
    sm.start({ engineSide: 'first', strength: null });
    expect(sm.phase).toBe('playing');
  });
});
