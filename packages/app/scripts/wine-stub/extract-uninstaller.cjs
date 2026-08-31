/**
 * 冒充 wine：electron-builder 在 Linux 上会把刚打出的 NSIS 安装包当 exe 跑一遍，
 * 好抽出卸载器。Wine 11 包在不少环境会 ntdll c0000135。
 * 这里改走 app-builder-lib 的 UninstallerReader（Catalina 同款纯 JS 解析）。
 */
const { createRequire } = require('node:module');
const { basename, dirname, join } = require('node:path');

/** 与 app-builder-lib NsisTarget.computeScriptAndSignUninstaller 同一规则 */
function uninstallerPathFor(installerPath) {
  return join(dirname(installerPath), `${basename(installerPath, 'exe')}__uninstaller.exe`);
}

function loadUninstallerReader() {
  const appDir = join(__dirname, '../..');
  const fromApp = createRequire(join(appDir, 'package.json'));
  const fromBuilder = createRequire(fromApp.resolve('electron-builder/package.json'));
  return fromBuilder('app-builder-lib/out/targets/nsis/nsisUtil.js').UninstallerReader;
}

async function extractUninstaller(installerPath) {
  if (installerPath === undefined || installerPath === '') {
    throw new Error('wine-stub: 缺少安装包路径');
  }
  const dest = uninstallerPathFor(installerPath);
  const UninstallerReader = loadUninstallerReader();
  await UninstallerReader.exec(installerPath, dest);
  return dest;
}

module.exports = { uninstallerPathFor, extractUninstaller, loadUninstallerReader };

if (require.main === module) {
  extractUninstaller(process.argv[2]).catch((err) => {
    console.error(`[wine-stub] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
