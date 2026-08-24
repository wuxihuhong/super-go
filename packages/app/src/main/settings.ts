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

const DEFAULTS: AppSettings = {
  theme: 'system',
  view: { board3d: true, alwaysOnTop: false },
  xiangqi: { strength: {}, ponder: false },
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
    this.data = { ...DEFAULTS, xiangqi: { ...DEFAULTS.xiangqi }, ...this.read() };
    this.data.view = { ...DEFAULTS.view, ...this.data.view };
    this.data.xiangqi = { ...DEFAULTS.xiangqi, ...this.data.xiangqi };
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
    };
    this.write();
    return this.get();
  }

  private read(): Partial<AppSettings> {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings> & {
        /** 旧版字段（已迁移到 xiangqi） */
        engine?: { path?: string; thinkMs?: number };
      };
      if (raw === null || typeof raw !== 'object') return {};
      const { engine, ...rest } = raw;
      const migrated: Partial<AppSettings> = rest;
      if (engine !== undefined) {
        // 旧版迁移：engine.thinkMs → xiangqi.strength.movetime；engine.path → enginePath
        migrated.xiangqi = {
          ...raw.xiangqi,
          enginePath: raw.xiangqi?.enginePath ?? engine.path,
          strength: {
            ...raw.xiangqi?.strength,
            ...(engine.thinkMs !== undefined ? { movetime: engine.thinkMs } : {}),
          },
        };
      }
      return migrated;
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
