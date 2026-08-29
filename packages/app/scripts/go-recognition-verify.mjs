/**
 * 围棋识别校验：合成盘（含 KaTrain 风格：坐标 / 星位 / 最后一手标记）走同源 TS。
 * 不在此内联复刻 goGrid / goClassify——口径以 packages/app/src/main/linker/go 为准。
 *
 * 用法（仓库根或 app 包）：
 *   node packages/app/scripts/go-recognition-verify.mjs
 *   pnpm --filter @super-go/app exec vitest run src/main/linker/go
 *
 * 真机 KaTrain 截图（窗口裁剪 PNG）可另存到
 *   packages/app/src/main/linker/__fixtures__/go/
 * 再交给 recognize.e2e.test.ts 加用例。截图通路与象棋相同（LinkerNative Win/mac）。
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', 'src/main/linker/go'],
  { cwd: appRoot, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
