/**
 * afterPack：剥掉装进安装包的「别的平台」原生库。
 * YOLO 只走 CPU，DirectML / dxcompiler 也不带。
 */
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** electron-builder Arch 枚举 → onnxruntime / libnut 目录名 */
const ARCH_NAME = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' };

const GPU_DLLS = new Set(['DirectML.dll', 'dxcompiler.dll', 'dxil.dll']);

export function archName(arch) {
  return ARCH_NAME[arch] ?? String(arch);
}

/**
 * @param {string[]} relPaths 相对 onnxruntime-node/bin 的 posix 路径
 * @param {'darwin'|'win32'|'linux'} platform
 * @param {string} arch
 * @returns {string[]} 应删除的相对路径
 */
export function planOrtRemovals(relPaths, platform, arch) {
  const drop = [];
  for (const rel of relPaths) {
    const parts = rel.split('/').filter((p) => p.length > 0);
    // napi-vN / <plat> / <cpu> / file
    if (parts.length < 3) continue;
    const plat = parts[1];
    const cpu = parts[2];
    const file = parts[parts.length - 1] ?? '';
    if (plat !== platform) {
      drop.push(rel);
      continue;
    }
    if (cpu !== arch) {
      drop.push(rel);
      continue;
    }
    if (platform === 'win32' && GPU_DLLS.has(file)) {
      drop.push(rel);
      continue;
    }
    // npm 包里 1.dylib 与 1.29.0.dylib 是同一份；binding 只加载 libonnxruntime.1.dylib
    if (platform === 'darwin' && /^libonnxruntime\.\d+\.\d+\.\d+\.dylib$/.test(file)) {
      drop.push(rel);
    }
  }
  return drop;
}

/**
 * @param {string[]} packageNames @nut-tree/libnut-* 目录名
 * @param {'darwin'|'win32'|'linux'} platform
 */
export function planLibnutRemovals(packageNames, platform) {
  const keep = `libnut-${platform}`;
  return packageNames.filter((name) => name.startsWith('libnut-') && name !== keep);
}

export function resolveUnpackedRoot(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  if (electronPlatformName === 'darwin') {
    const name = packager?.appInfo?.productFilename ?? 'Super-Go';
    const p = join(appOutDir, `${name}.app`, 'Contents', 'Resources', 'app.asar.unpacked');
    return existsSync(p) ? p : null;
  }
  const p = join(appOutDir, 'resources', 'app.asar.unpacked');
  return existsSync(p) ? p : null;
}

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(root);
  return out;
}

async function removePath(target, removed) {
  if (!existsSync(target)) return;
  const info = await stat(target);
  await rm(target, { recursive: true, force: true });
  removed.push({ path: target, bytes: info.isDirectory() ? 0 : info.size });
}

export default async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = archName(context.arch);
  const unpacked = resolveUnpackedRoot(context);
  if (unpacked === null) {
    console.warn('[slim] 找不到 app.asar.unpacked，跳过');
    return;
  }

  const removed = [];
  const ortBin = join(unpacked, 'node_modules', 'onnxruntime-node', 'bin');
  if (existsSync(ortBin)) {
    const files = await listFiles(ortBin);
    const rels = files.map((f) => relative(ortBin, f).split(sep).join('/'));
    const drop = new Set(planOrtRemovals(rels, platform, arch));
    for (const file of files) {
      const rel = relative(ortBin, file).split(sep).join('/');
      if (drop.has(rel)) await removePath(file, removed);
    }
    await pruneEmptyDirs(ortBin);
  }

  const nutRoot = join(unpacked, 'node_modules', '@nut-tree');
  if (existsSync(nutRoot)) {
    const names = await readdir(nutRoot);
    for (const name of planLibnutRemovals(names, platform)) {
      await removePath(join(nutRoot, name), removed);
    }
  }

  const bytes = removed.reduce((sum, row) => sum + row.bytes, 0);
  console.log(
    `[slim] ${platform}/${arch} 删除 ${removed.length} 个文件（约 ${(bytes / 1024 / 1024).toFixed(1)} MB）`,
  );
}

async function pruneEmptyDirs(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    await pruneEmptyDirs(full);
    const left = await readdir(full);
    if (left.length === 0) await rm(full, { recursive: true, force: true });
  }
}
