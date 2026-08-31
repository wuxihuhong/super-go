/**
 * LinkerController：连线服务装配（main 进程）。
 *
 * 连线 = 以平台识别局面重开一局（用户模型）：对局本体在 MatchService，
 * 这里只管连线资源（native/模型）、IPC 命令、事件转发、急停热键、
 * mac 权限检查；扫描循环在 LinkerSession（经 LinkerMatchBridge 驱动对局）。
 * 引擎进程与强度生命周期复用 MatchService（连线启动前对弈须空闲）。
 *
 * 截图与点击一律复用 ElectronLinkerNative（§6.3：mac 前台/后台捕获 + nut.js；
 * win PrintWindow + PostMessage）。围棋只换识别器（经典 CV），不另开通路。
 */
import { globalShortcut } from 'electron';
import type {
  ActiveWindowPick,
  LinkerLogEntry,
  LinkerPermissionId,
  LinkerPermissionState,
  LinkerReason,
  LinkerResolution,
  LinkerSettings,
  LinkerStartIntent,
  LinkerStatus,
  TargetWindow,
} from '../../shared/linker';
import { ElectronLinkerNative } from './linkerService';
import { LinkerSession, type LinkerMatchBridge } from './linkerSession';
import { checkLinkerPermissions, askLinkerPermission } from './permissions';
import { YoloSession } from './yolo/session';

export interface LinkerControllerEvents {
  status(status: LinkerStatus): void;
  log(entry: LinkerLogEntry): void;
}

const STOP_SHORTCUT = 'CommandOrControl+Shift+X';

/** 权限中文名（错误提示用；mac 才会有缺失项） */
const PERMISSION_NAMES: Record<string, string> = {
  screen: '屏幕录制',
  accessibility: '辅助功能',
  'input-monitoring': '输入监控',
};

export class LinkerController {
  private readonly native = new ElectronLinkerNative(
    () => this.getSettings().backgroundCapture,
    () => this.getSettings().backgroundClick,
    (text) => this.events.log({ time: Date.now(), level: 'warn', text }),
  );
  private yolo: YoloSession | null = null;
  private session: LinkerSession | null = null;

  constructor(
    private readonly events: LinkerControllerEvents,
    private readonly getSettings: () => LinkerSettings,
    private readonly match: LinkerMatchBridge,
    private readonly modelLocator: () => string | null,
  ) {}

  get active(): boolean {
    return this.session?.isRunning === true;
  }

  async listWindows(): Promise<TargetWindow[]> {
    return this.native.listWindows();
  }

  /** "切换到目标窗口后确认"的选择模式：取当前前台窗口 */
  async activeWindow(): Promise<ActiveWindowPick> {
    return this.native.activeWindow();
  }

  permissions(): LinkerPermissionState[] {
    return checkLinkerPermissions();
  }

  askPermission(id: LinkerPermissionId): void {
    askLinkerPermission(id);
  }

  async start(intent: LinkerStartIntent): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.active) return { ok: false, error: '连线已在进行中' };

    // macOS 权限预检：缺权限直接明确报错（否则会无声卡在"定位棋盘"）
    const missing = checkLinkerPermissions().filter((p) => !p.granted);
    if (missing.length > 0) {
      const names = missing
        .map((p) => PERMISSION_NAMES[p.id] ?? p.id)
        .join('、');
      return {
        ok: false,
        error: `缺少系统权限（${names}）：请在连线面板点击"去授权"，在系统设置中开启后重试`,
      };
    }

    const windows = await this.native.listWindows();
    const win = windows.find((w) => w.id === intent.windowId) ?? null;
    if (win === null) return { ok: false, error: '目标窗口不存在' };

    const kind = intent.kind ?? 'xiangqi';
    const settings = this.getSettings();
    if (kind === 'xiangqi') {
      const modelPath = this.modelLocator();
      if (modelPath === null) {
        return { ok: false, error: '未找到识别模型（engines/vision/yolov11.onnx）' };
      }
      if (this.yolo === null) {
        try {
          this.yolo = await YoloSession.create(modelPath, settings.inferThreads);
        } catch (err) {
          return { ok: false, error: `识别模型加载失败: ${String(err)}` };
        }
      }
    }

    await this.match.setKind(kind);

    this.session = new LinkerSession({
      native: this.native,
      infer: kind === 'xiangqi' ? this.yolo ?? undefined : undefined,
      match: this.match,
      window: win,
      settings: this.getSettings,
      events: {
        status: (s) => this.events.status(s),
        log: (e) => this.events.log(e),
      },
      kind,
    });
    this.session.start();
    this.registerStopShortcut();
    return { ok: true };
  }

  stop(reason: LinkerReason = 'user'): void {
    this.session?.stop(reason);
    this.session = null;
    this.unregisterStopShortcut();
  }

  togglePause(): void {
    this.session?.togglePause();
  }

  /** 用户对"待人工介入"的决断（重试 / 以平台局面重开 / 转观战，§6.6） */
  resolve(resolution: LinkerResolution): Promise<void> {
    return this.session?.resolve(resolution) ?? Promise.resolve();
  }

  dispose(): void {
    this.unregisterStopShortcut();
    this.session?.stop('user');
    this.session = null;
    this.yolo?.dispose();
    this.yolo = null;
    this.native.dispose();
  }

  /** 连线激活时注册全局紧急停止热键（自动走棋操作真实鼠标，必须有急停） */
  private registerStopShortcut(): void {
    try {
      globalShortcut.register(STOP_SHORTCUT, () => this.stop('shortcut'));
    } catch {
      /* 热键被占用不阻塞连线 */
    }
  }

  private unregisterStopShortcut(): void {
    try {
      globalShortcut.unregister(STOP_SHORTCUT);
    } catch {
      /* 未注册时忽略 */
    }
  }
}
