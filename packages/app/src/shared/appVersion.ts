/** 产品主版本；build 日期以 `-yyyyMMdd` 附在后面（关于窗口 / 安装包名） */
export const APP_VERSION_BASE = '1.0.0';

/** `1.0.0-yyyyMMdd`，日期取本地日历（build 机时区） */
export function formatBuildVersion(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${APP_VERSION_BASE}-${y}${m}${d}`;
}

/** `APP_VERSION` 环境变量可覆盖（CI 指定同一天多次构建时用） */
export function resolveAppVersion(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): string {
  const override = env['APP_VERSION'];
  if (override !== undefined && override !== '') return override;
  return formatBuildVersion(now);
}
