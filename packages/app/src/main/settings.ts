import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettings } from '../shared/ipc';

const DEFAULTS: AppSettings = { theme: 'system' };

/**
 * 设置持久化（userData/settings.json）：§5.6"静默给默认，设置留逃生口"的落点。
 * P0 只承载 theme / language 两键，为 P5 的切换 UI 预留；写盘原子替换。
 */
export class SettingsStore {
  private readonly file: string;
  private data: AppSettings;

  constructor() {
    this.file = join(app.getPath('userData'), 'settings.json');
    this.data = { ...DEFAULTS, ...this.read() };
  }

  get(): AppSettings {
    return { ...this.data };
  }

  patch(partial: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...partial };
    this.write();
    return this.get();
  }

  private read(): Partial<AppSettings> {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>;
      return raw && typeof raw === 'object' ? raw : {};
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
