/**
 * KataGo 默认 GTP 配置模板（基于官方 gtp_example.cfg 精简）。
 * 用户指定 configPath 时不写此文件（§5.6 用户值优先）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function defaultGtpConfig(opts: {
  logDir: string;
  numSearchThreads: number;
  analysisWideRootNoise?: number;
}): string {
  const noise = opts.analysisWideRootNoise ?? 0.04;
  return `# Super Go — KataGo GTP（由应用生成，可在设置中改用自定义文件）
logDir = ${opts.logDir}
logAllGTPCommunication = false
logSearchInfo = false
logToStderr = false
rules = chinese
allowResignation = true
resignThreshold = -0.90
resignConsecTurns = 3
ponderingEnabled = false
maxTimePondering = 60.0
lagBuffer = 1.0
numSearchThreads = ${Math.max(1, Math.round(opts.numSearchThreads))}
analysisWideRootNoise = ${noise}
reportAnalysisWinratesAs = SIDETOMOVE
startupPrintMessageToStderr = false
`;
}

/** 确保默认 config 落在 userData；已存在则不覆盖 */
export function ensureDefaultGtpConfig(opts: {
  userDataDir: string;
  numSearchThreads: number;
  analysisWideRootNoise?: number;
}): string {
  const dir = join(opts.userDataDir, 'engines', 'go');
  const file = join(dir, 'gtp.cfg');
  if (existsSync(file)) return file;
  mkdirSync(dir, { recursive: true });
  const logDir = join(dir, 'gtp_logs');
  mkdirSync(logDir, { recursive: true });
  writeFileSync(
    file,
    defaultGtpConfig({
      logDir,
      numSearchThreads: opts.numSearchThreads,
      analysisWideRootNoise: opts.analysisWideRootNoise,
    }),
    'utf8',
  );
  return file;
}

export function resolveKatagoConfig(opts: {
  userPath?: string;
  userDataDir: string;
  numSearchThreads: number;
  analysisWideRootNoise?: number;
}): string {
  if (opts.userPath !== undefined && opts.userPath !== '' && existsSync(opts.userPath)) {
    return opts.userPath;
  }
  return ensureDefaultGtpConfig(opts);
}

export function configDirOf(configPath: string): string {
  return dirname(configPath);
}
