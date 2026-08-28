/** GTP / KataGo 行解析容错（AGENTS.md：畸形 info 行降级不崩） */
import { describe, expect, it } from 'vitest';
import { gtpCommands, parseGtpLine, parseGtpScore, parseInfoLine, pickBestInfo } from './gtpProtocol';

describe('GTP 应答行', () => {
  it('成功 / 失败 / 空行结束', () => {
    expect(parseGtpLine('= KataGo')).toEqual({ type: 'success', text: 'KataGo' });
    expect(parseGtpLine('=2 1.18.0')).toEqual({ type: 'success', id: 2, text: '1.18.0' });
    expect(parseGtpLine('? unknown command')).toEqual({ type: 'error', text: 'unknown command' });
    expect(parseGtpLine('')).toEqual({ type: 'responseEnd' });
  });

  it('play 行（kata-genmove_analyze 收束）', () => {
    expect(parseGtpLine('play Q16')).toEqual({ type: 'play', move: 'Q16' });
    expect(parseGtpLine('play pass')).toEqual({ type: 'play', move: 'pass' });
  });

  it('无法识别的杂讯降级为 null', () => {
    expect(parseGtpLine('stderr junk')).toBeNull();
    expect(parseGtpLine('   ')).toEqual({ type: 'responseEnd' });
  });
});

describe('kata-analyze info 行', () => {
  it('标准字段：move / visits / winrate / scoreLead / pv', () => {
    const infos = parseInfoLine(
      'info move Q16 visits 120 winrate 0.55 scoreLead 1.25 prior 0.2 pv Q16 D4 C16',
    );
    expect(infos).toEqual([
      { move: 'Q16', visits: 120, winRate: 0.55, lead: 1.25, pv: ['Q16', 'D4', 'C16'] },
    ]);
  });

  it('一行多段 info：取 visits 最高者为最佳', () => {
    const infos = parseInfoLine(
      'info move Q16 visits 80 winrate 0.51 scoreLead 0.4 pv Q16 info move D4 visits 200 winrate 0.60 scoreLead 2.1 pv D4',
    );
    expect(infos).toHaveLength(2);
    expect(pickBestInfo(infos)?.move).toBe('D4');
  });

  it('畸形 / 半截字段：跳过坏段，不抛错', () => {
    expect(parseGtpLine('info')).toBeNull();
    expect(parseInfoLine('info move')).toEqual([]);
    expect(parseInfoLine('info visits not-a-number winrate')).toEqual([]);
    expect(parseInfoLine('info move D4 visits 3 winrate xyz scoreLead')).toEqual([
      { move: 'D4', visits: 3 },
    ]);
  });

  it('未知 key（ownership 等）忽略', () => {
    expect(parseInfoLine('info move D4 visits 5 ownership 0.1 0.2 winrate 0.4')).toEqual([
      { move: 'D4', visits: 5, winRate: 0.4 },
    ]);
  });
});

describe('final_score 文本', () => {
  it('目差 / 和棋 / 认输', () => {
    expect(parseGtpScore('B+3.5')).toEqual({ winner: 'first', reason: 'twoPasses' });
    expect(parseGtpScore('W+12.5')).toEqual({ winner: 'second', reason: 'twoPasses' });
    expect(parseGtpScore('0')).toEqual({ winner: null, reason: 'twoPasses' });
    expect(parseGtpScore('B+R')).toEqual({ winner: 'first', reason: 'resign' });
    expect(parseGtpScore('w+T')).toEqual({ winner: 'second', reason: 'timeout' });
    expect(parseGtpScore('junk')).toBeNull();
  });
});

describe('命令构造', () => {
  it('分析 / 出招只带 interval（厘秒）；强度走 set-param', () => {
    expect(gtpCommands.kataGenmoveAnalyze('B', 10)).toBe('kata-genmove_analyze B 10');
    expect(gtpCommands.kataAnalyze('W', 10)).toBe('kata-analyze W 10');
    expect(gtpCommands.kataSearchAnalyze('B')).toBe('kata-search_analyze B 10');
    expect(gtpCommands.play('B', 'Q16')).toBe('play B Q16');
    expect(gtpCommands.kataSetParam('ponderingEnabled', true)).toBe(
      'kata-set-param ponderingEnabled true',
    );
    expect(gtpCommands.kataSetParam('maxVisits', 25)).toBe('kata-set-param maxVisits 25');
  });
});
