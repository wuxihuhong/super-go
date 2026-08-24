/** UCI 协议解析容错测试（AGENTS.md：含变体/畸形 info 行，解析失败降级不崩） */
import { describe, expect, it } from 'vitest';
import { parseUciLine, uciCommands } from './uciProtocol';

describe('UCI 行解析', () => {
  it('id / uciok / readyok', () => {
    expect(parseUciLine('id name Pikafish 2026-01-31')).toEqual({
      type: 'id',
      field: 'name',
      value: 'Pikafish 2026-01-31',
    });
    expect(parseUciLine('id author the Pikafish developers')).toEqual({
      type: 'id',
      field: 'author',
      value: 'the Pikafish developers',
    });
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ type: 'readyok' });
  });

  it('option 行：四类型 + 空格名 + min/max/var', () => {
    expect(parseUciLine('option name Threads type spin default 1 min 1 max 1024')).toEqual({
      type: 'option',
      option: { name: 'Threads', type: 'spin', default: '1', min: 1, max: 1024 },
    });
    expect(parseUciLine('option name UCI_LimitStrength type check default false')).toEqual({
      type: 'option',
      option: { name: 'UCI_LimitStrength', type: 'check', default: 'false' },
    });
    expect(
      parseUciLine(
        'option name Repetition Rule type combo default AsianRule var AsianRule var ChineseRule var SkyRule',
      ),
    ).toEqual({
      type: 'option',
      option: {
        name: 'Repetition Rule',
        type: 'combo',
        default: 'AsianRule',
        vars: ['AsianRule', 'ChineseRule', 'SkyRule'],
      },
    });
    expect(parseUciLine('option name Debug Log File type string default ')).toEqual({
      type: 'option',
      option: { name: 'Debug Log File', type: 'string', default: '' },
    });
    expect(parseUciLine('option name Clear Hash type button')).toEqual({
      type: 'option',
      option: { name: 'Clear Hash', type: 'button' },
    });
  });

  it('info 行常见变体：cp / mate / multipv / pv / nodes', () => {
    expect(parseUciLine('info depth 18 score cp 35 pv h2e2 h9g7 g0g2')).toEqual({
      type: 'info',
      info: { depth: 18, cp: 35, pv: ['h2e2', 'h9g7', 'g0g2'] },
    });
    expect(parseUciLine('info depth 12 score mate 3')).toEqual({
      type: 'info',
      info: { depth: 12, mate: 3 },
    });
    expect(
      parseUciLine('info multipv 2 depth 9 score cp -12 nodes 3000 nps 150000 pv a0a1'),
    ).toEqual({
      type: 'info',
      info: { multipv: 2, depth: 9, cp: -12, nodes: 3000, nps: 150000, pv: ['a0a1'] },
    });
    // 无 pv、无 score 的残缺 info 仍是合法 info
    expect(parseUciLine('info depth 5 currmove h2e2 currmovenumber 1')).toEqual({
      type: 'info',
      info: { depth: 5 },
    });
    // info string 降级为 log
    expect(parseUciLine('info string Available processors: 0-9')).toEqual({
      type: 'log',
      text: 'Available processors: 0-9',
    });
  });

  it('bestmove：带/不带 ponder、(none)', () => {
    expect(parseUciLine('bestmove h2e2')).toEqual({ type: 'bestmove', move: 'h2e2' });
    expect(parseUciLine('bestmove g3g4 ponder h7g7')).toEqual({
      type: 'bestmove',
      move: 'g3g4',
      ponder: 'h7g7',
    });
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: '' });
  });

  it('畸形/变体行一律 null 降级不抛错', () => {
    const malformed = [
      '',
      '   ',
      'random garbage',
      'info',
      'info depth',
      'info score cp',
      'info score weird 5',
      'info nodes notanumber',
      'option without-type-keyword',
      'option name Broken type unknownkind default x',
      'bestmove',
      'id',
    ];
    for (const line of malformed) {
      expect(() => parseUciLine(line), `line=${JSON.stringify(line)}`).not.toThrow();
      expect(parseUciLine(line), `line=${JSON.stringify(line)}`).toBeNull();
    }
  });
});

describe('UCI 命令构造', () => {
  it('setoption / position / go', () => {
    expect(uciCommands.setOption('UCI_Elo', 1800)).toBe('setoption name UCI_Elo value 1800');
    expect(uciCommands.setOption('UCI_LimitStrength', false)).toBe(
      'setoption name UCI_LimitStrength value false',
    );
    expect(uciCommands.position('rnbakabnr/9 w - - 0 1', [])).toBe(
      'position fen rnbakabnr/9 w - - 0 1',
    );
    expect(uciCommands.position('FEN w', ['h2e2', 'h9g7'])).toBe(
      'position fen FEN w moves h2e2 h9g7',
    );
    expect(uciCommands.goMovetime(1000)).toBe('go movetime 1000');
    expect(uciCommands.goMovetime(0.4)).toBe('go movetime 1'); // 钳到 ≥1ms
  });
});
