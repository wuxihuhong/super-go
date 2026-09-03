import type { GameSnapshot, LiveEval, MainlineItem } from '@shared/game';
import type { EngineStatusPayload } from '@shared/ipc';
import { estimateAreaScores, formatScoreNumber } from '../../shared/goScoreFormat';
import { delayingBannerText, engineStatusText } from './engineStatusText';
import {
  evalProportion,
  evalValueText,
  goLeadText,
  goWinRateText,
  resolveDisplayedEval,
  resolveGoEval,
} from './eval';
import type { MessageKey, TFunction } from '../i18n';

export interface GaugeModel {
  kind: 'go' | 'xiangqi';
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  /** 左侧填充 0–1 */
  barRatio: number;
  leftTone: 'acc' | 'pink';
}

export interface TelemetryRow {
  id: string;
  label: string;
  value: string;
  bar?: 'acc' | 'pink' | 'ok';
  barRatio?: number;
}

export interface MoveEvalCell {
  text: string;
  tone: 'pos' | 'neg' | 'none';
}

export function buildGauge(
  t: TFunction,
  snapshot: GameSnapshot | null,
  liveEval: LiveEval | null,
): GaugeModel {
  if (snapshot?.kind === 'go') {
    const go = resolveGoEval(liveEval, snapshot);
    const black = go.winRate;
    const blackPct = black === undefined ? undefined : black * 100;
    const whitePct = blackPct === undefined ? undefined : 100 - blackPct;
    return {
      kind: 'go',
      leftLabel: t('panel.gauge.blackWin'),
      leftValue: goWinRateText(black).replace('%', ''),
      rightLabel: t('panel.gauge.whiteWin'),
      rightValue:
        whitePct === undefined ? '—' : (Math.round(whitePct * 10) / 10).toFixed(1),
      barRatio: black ?? 0.5,
      leftTone: 'acc',
    };
  }
  const shown = resolveDisplayedEval(liveEval, snapshot);
  const ev = evalValueText(t, shown.redCp, shown.redMate, false);
  return {
    kind: 'xiangqi',
    leftLabel: t('panel.gauge.redAdvantage'),
    leftValue: ev.text,
    rightLabel: t('panel.gauge.depth'),
    rightValue: shown.depth !== undefined ? String(shown.depth) : '—',
    barRatio: evalProportion(shown.redCp, shown.redMate),
    leftTone: 'pink',
  };
}

export function buildTelemetry(
  t: TFunction,
  snapshot: GameSnapshot | null,
  engineStatus: EngineStatusPayload | null,
  liveEval: LiveEval | null,
): TelemetryRow[] {
  const isGo = snapshot?.kind === 'go';
  const shown = resolveDisplayedEval(liveEval, snapshot);
  const go = resolveGoEval(liveEval, snapshot);
  const depth = isGo ? go.depth : shown.depth;
  const rows: TelemetryRow[] = [
    { id: 'engine', label: t('panel.engine'), value: engineStatus?.name ?? '—' },
    {
      id: 'status',
      label: t('panel.status'),
      value: engineStatusText(t, engineStatus, snapshot?.playDelaySec),
    },
    {
      id: 'strength',
      label: t('panel.engine.strength'),
      value: snapshot?.strengthLabel ?? t('panel.engine.unlimited'),
    },
    {
      id: 'depth',
      label: t(isGo ? 'settings.go.strength.visits' : 'panel.engine.depth'),
      value: depth !== undefined ? String(depth) : '—',
    },
  ];
  if (isGo) {
    const area =
      go.lead === undefined
        ? undefined
        : estimateAreaScores(go.lead, snapshot?.komi ?? 7.5, snapshot?.boardSize ?? 19);
    rows.push(
      {
        id: 'blackArea',
        label: t('panel.area.black'),
        value: area === undefined ? '—' : formatScoreNumber(area.black),
      },
      {
        id: 'whiteArea',
        label: t('panel.area.white'),
        value: area === undefined ? '—' : formatScoreNumber(area.white),
      },
    );
    return rows;
  }
  rows.push({
    id: 'eval',
    label: t('panel.engine.eval'),
    value: evalValueText(t, shown.redCp, shown.redMate, false).text,
    bar: 'acc',
    barRatio: evalProportion(shown.redCp, shown.redMate),
  });
  return rows;
}

export function moveEvalCell(item: MainlineItem, kind: 'go' | 'xiangqi'): MoveEvalCell {
  if (kind === 'go') {
    if (item.lead === undefined) return { text: '—', tone: 'none' };
    const text = goLeadText(item.lead);
    return { text, tone: item.lead > 0 ? 'pos' : item.lead < 0 ? 'neg' : 'none' };
  }
  if (item.redMate !== undefined) {
    return {
      text: `#${Math.abs(item.redMate)}`,
      tone: item.redMate > 0 ? 'pos' : 'neg',
    };
  }
  if (item.redCp === undefined) return { text: '—', tone: 'none' };
  const n = Math.round(item.redCp);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return {
    text: `${sign}${Math.abs(n)}`,
    tone: n > 0 ? 'pos' : n < 0 ? 'neg' : 'none',
  };
}

export function windowSubtitle(t: TFunction, snapshot: GameSnapshot | null, kind: 'go' | 'xiangqi'): string {
  if (kind === 'go') {
    const size = snapshot?.boardSize ?? 19;
    return t('window.subtitle.go')
      .replaceAll('{size}', String(size))
      .replaceAll('{n}', String(snapshot?.moves.length ?? 0));
  }
  const plies = snapshot?.moves.length ?? 0;
  const rounds = plies === 0 ? 0 : Math.ceil(plies / 2);
  return t('window.subtitle.xiangqi').replaceAll('{n}', String(rounds));
}

export function statusBanner(t: TFunction, snapshot: GameSnapshot | null): {
  text: string;
  tone: 'neutral' | 'busy' | 'danger';
  check?: string;
} {
  if (snapshot === null) return { text: t('status.idle'), tone: 'neutral' };
  if (snapshot.phase === 'ended' && snapshot.result !== null) {
    const go = snapshot.kind === 'go';
    const winner =
      snapshot.result.winner === 'first'
        ? t(go ? 'status.result.blackWinGo' : 'status.result.redWin')
        : snapshot.result.winner === 'second'
          ? t(go ? 'status.result.whiteWinGo' : 'status.result.blackWin')
          : t('status.result.draw');
    const reasonKey: MessageKey | null =
      snapshot.result.reason === 'mate'
        ? 'status.reason.mate'
        : snapshot.result.reason === 'stalemate'
          ? 'status.reason.stalemate'
          : snapshot.result.reason === 'resign'
            ? 'status.reason.resign'
            : snapshot.result.reason === 'twoPasses'
              ? 'status.reason.twoPasses'
              : null;
    const reason = reasonKey !== null ? ` · ${t(reasonKey)}` : '';
    return { text: `${winner}${reason}`, tone: 'neutral' };
  }
  if (snapshot.phase !== 'playing') {
    return { text: t('status.reviewing'), tone: 'neutral' };
  }
  if (snapshot.playDelaySec !== undefined) {
    return { text: delayingBannerText(t, snapshot.playDelaySec), tone: 'busy' };
  }
  if (snapshot.thinking) {
    return { text: t('status.thinking'), tone: 'busy' };
  }
  return {
    text: t(
      snapshot.kind === 'go'
        ? snapshot.turn === 'first'
          ? 'status.turn.blackGo'
          : 'status.turn.whiteGo'
        : snapshot.turn === 'first'
          ? 'status.turn.red'
          : 'status.turn.black',
    ),
    tone: 'neutral',
    check: snapshot.inCheck ? t('status.check') : undefined,
  };
}
