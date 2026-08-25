/**
 * macOS 连线权限检测与引导（DESIGN.md §6.3 / §10 风险#4）。
 * 三权限：屏幕录制（截屏）、辅助功能（窗口枚举/鼠标注入）、输入监控（部分注入路径）。
 * Windows 无权限门槛，恒为已授权。
 */
import type { LinkerPermissionId, LinkerPermissionState } from '../../shared/linker';

export function checkLinkerPermissions(): LinkerPermissionState[] {
  if (process.platform !== 'darwin') {
    return [];
  }
  // 动态 import：原生模块仅 mac 存在（打包 win 时不进 bundle）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const macPermissions = require('@nut-tree/node-mac-permissions') as {
    getAuthStatus(t: string): string;
  };
  const items: ReadonlyArray<[LinkerPermissionId, string]> = [
    ['screen', 'screen'],
    ['accessibility', 'accessibility'],
    ['input-monitoring', 'input-monitoring'],
  ];
  return items.map(([id, authType]) => ({
    id,
    granted: macPermissions.getAuthStatus(authType) === 'authorized',
    settingsUrl: settingsUrlOf(id),
  }));
}

export function askLinkerPermission(id: LinkerPermissionId): void {
  if (process.platform !== 'darwin') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const macPermissions = require('@nut-tree/node-mac-permissions') as {
    askForAccessibilityAccess(): void;
    askForScreenCaptureAccess(): void;
    askForInputMonitoringAccess(): Promise<unknown>;
  };
  if (id === 'accessibility') macPermissions.askForAccessibilityAccess();
  else if (id === 'screen') macPermissions.askForScreenCaptureAccess();
  else void macPermissions.askForInputMonitoringAccess();
}

function settingsUrlOf(id: LinkerPermissionId): string {
  switch (id) {
    case 'screen':
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    case 'accessibility':
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
    case 'input-monitoring':
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent';
  }
}
