import { defaultKomi } from '@super-go/core';
import { app } from 'electron';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettings } from '../shared/ipc';
import { GO_ANALYSIS_DEFAULT } from '../shared/ipc';
import { LINKER_SETTINGS_DEFAULT } from '../shared/linker';
import { MOVE_DELAY_DEFAULT } from '../shared/moveDelay';

const DEFAULTS: AppSettings = {
  theme: 'system',
  view: { board3d: true, alwaysOnTop: false },
  activeKind: 'xiangqi',
  xiangqi: {
    strength: {},
    ponder: false,
    moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
    moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
  },
  go: {
    strength: {},
    ponder: false,
    moveDelayMinSec: MOVE_DELAY_DEFAULT.minSec,
    moveDelayMaxSec: MOVE_DELAY_DEFAULT.maxSec,
    rules: 'chinese',
    komi: 7.5,
    boardSize: 19,
    analysis: { ...GO_ANALYSIS_DEFAULT },
  },
  linker: { ...LINKER_SETTINGS_DEFAULT },
};

/**
 * 设置持久化（userData/settings.json）：§5.6"静默给默认，设置留逃生口"的落点。
 * 分层：主题/语言为公有配置；象棋（引擎路径/棋力/闲时思考）独立持久化，围棋 P3 同构扩展（2026-08-25 批次调整后）。
 * 写盘原子替换；旧版 { engine: { thinkMs, path } } 迁移到象棋配置。
 */
export class SettingsStore {
  private readonly file: string;
  private data: AppSettings;

  constructor() {
    const userData = app.getPath('userData');
    this.file = join(userData, 'settings.json');
    // app.setName 后 dev 的 userData 从 '@super-go/app'(package name，Electron
    // 按字面拼接为嵌套目录) 变为 'Super Go'：首启无新文件时从旧目录一次性拷入，
    // 避免 dev 用户丢失引擎路径/棋力/主题
    if (!existsSync(this.file)) {
      for (const legacy of [join('@super-go', 'app'), 'Electron']) {
        const legacyFile = join(dirname(userData), legacy, 'settings.json');
        if (existsSync(legacyFile)) {
          try {
            mkdirSync(userData, { recursive: true });
            copyFileSync(legacyFile, this.file);
            console.log(`[settings] 已迁移旧配置: ${legacyFile}`);
            break;
          } catch {
            // 拷贝失败按全新配置起步
          }
        }
      }
    }
    this.data = { ...DEFAULTS, xiangqi: { ...DEFAULTS.xiangqi }, go: { ...DEFAULTS.go }, ...this.read() };
    this.data.view = { ...DEFAULTS.view, ...this.data.view };
    this.data.xiangqi = { ...DEFAULTS.xiangqi, ...this.data.xiangqi };
    this.data.go = {
      ...DEFAULTS.go,
      ...this.data.go,
      analysis: { ...DEFAULTS.go.analysis, ...this.data.go?.analysis },
    };
    this.data.linker = { ...DEFAULTS.linker, ...this.data.linker };
    if (this.data.activeKind !== 'go') this.data.activeKind = 'xiangqi';
    this.data.go.boardSize = 19;
  }

  get(): AppSettings {
    return JSON.parse(JSON.stringify(this.data)) as AppSettings;
  }

  patch(partial: Partial<AppSettings>): AppSettings {
    this.data = {
      ...this.data,
      ...partial,
      view: { ...this.data.view, ...partial.view },
      xiangqi: { ...this.data.xiangqi, ...partial.xiangqi },
      go: {
        ...this.data.go,
        ...partial.go,
        analysis: { ...this.data.go.analysis, ...partial.go?.analysis },
      },
      linker: { ...this.data.linker, ...partial.linker },
    };
    this.data.go.boardSize = 19;
    if (partial.go?.rules !== undefined && partial.go.komi === undefined) {
      this.data.go.komi = defaultKomi(this.data.go.rules ?? 'chinese');
    }
    this.write();
    return this.get();
  }

  private read(): Partial<AppSettings> {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      return migrateSettings(raw);
    } catch {
      return {};
    }
  }

  private write(): void {
    const dir = dirname(this.file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.file);
  }
}

/** 旧版配置结构（迁移用；字段都是历史遗留，勿在新代码里引用） */
type LegacySettings = Omit<Partial<AppSettings>, 'linker'> & {
  /** 旧版：引擎路径与思考时长曾是顶层字段 */
  engine?: { path?: string; thinkMs?: number };
  linker?: Partial<AppSettings['linker']> & {
    /** 旧版：后台模式合二为一，已拆成 backgroundCapture / backgroundClick */
    backMode?: boolean;
    /** 旧版：行棋延迟挂在连线下，已迁到 xiangqi */
    moveDelayMinSec?: number;
    moveDelayMaxSec?: number;
  };
};

/**
 * 配置迁移（纯函数，可单测）：把历史结构映射到当前结构。
 * 用户的配置文件是长期资产，迁移一旦悄悄写错，表现是"设置莫名其妙变回默认"，很难查。
 */
export function migrateSettings(raw: unknown): Partial<AppSettings> {
  if (raw === null || typeof raw !== 'object') return {};
  const { engine, ...rest } = raw as LegacySettings;
  const migrated: Partial<AppSettings> = rest as Partial<AppSettings>;
  const legacyLinker = (raw as LegacySettings).linker;

  if (engine !== undefined) {
    // engine.thinkMs → xiangqi.strength.movetime；engine.path → xiangqi.enginePath
    const xiangqi = (raw as LegacySettings).xiangqi;
    migrated.xiangqi = {
      ...xiangqi,
      enginePath: xiangqi?.enginePath ?? engine.path,
      strength: {
        ...xiangqi?.strength,
        ...(engine.thinkMs !== undefined ? { movetime: engine.thinkMs } : {}),
      },
    };
  }

  if (legacyLinker?.backMode !== undefined) {
    // 旧 backMode 名不副实：win32 的截图一直走 PrintWindow 与它无关，它实际只控制点击。
    // 故只映射到 backgroundClick，backgroundCapture 交给默认值。
    const { backMode, ...linkerRest } = legacyLinker;
    migrated.linker = { ...linkerRest, backgroundClick: backMode } as AppSettings['linker'];
  }

  const linkerNow = migrated.linker as
    | (Partial<AppSettings['linker']> & {
        moveDelayMinSec?: number;
        moveDelayMaxSec?: number;
      })
    | undefined;
  const minFromLinker = linkerNow?.moveDelayMinSec;
  const maxFromLinker = linkerNow?.moveDelayMaxSec;
  const xiangqiDelayUnset =
    migrated.xiangqi?.moveDelayMinSec === undefined &&
    migrated.xiangqi?.moveDelayMaxSec === undefined;
  // 只迁「显式非 0」的旧连线延迟。每个旧 settings 文件都写过 LINKER 默认 0–0，
  // 无法与「用户故意立即走」区分；迁 0–0 会让全员本机延迟被清零。未迁的走
  // xiangqi 默认 0.3–0.9（本机与连线共用）。
  if (
    xiangqiDelayUnset &&
    ((typeof minFromLinker === 'number' && minFromLinker > 0) ||
      (typeof maxFromLinker === 'number' && maxFromLinker > 0))
  ) {
    migrated.xiangqi = {
      ...migrated.xiangqi,
      strength: migrated.xiangqi?.strength ?? {},
      moveDelayMinSec: minFromLinker ?? 0,
      moveDelayMaxSec: maxFromLinker ?? 0,
    };
  }
  if (linkerNow !== undefined && ('moveDelayMinSec' in linkerNow || 'moveDelayMaxSec' in linkerNow)) {
    const { moveDelayMinSec: _min, moveDelayMaxSec: _max, ...linkerRest } = linkerNow;
    migrated.linker = linkerRest as AppSettings['linker'];
  }

  return migrated;
}
