import { describe, expect, it } from 'vitest';
import { planLibnutRemovals, planOrtRemovals } from './slim-unpacked.mjs';

const ortInventory = [
  'napi-v6/darwin/arm64/libonnxruntime.1.dylib',
  'napi-v6/darwin/arm64/libonnxruntime.1.29.0.dylib',
  'napi-v6/darwin/arm64/onnxruntime_binding.node',
  'napi-v6/linux/x64/libonnxruntime.so.1',
  'napi-v6/linux/arm64/libonnxruntime.so.1',
  'napi-v6/win32/x64/onnxruntime.dll',
  'napi-v6/win32/x64/onnxruntime_binding.node',
  'napi-v6/win32/x64/DirectML.dll',
  'napi-v6/win32/x64/dxcompiler.dll',
  'napi-v6/win32/x64/dxil.dll',
  'napi-v6/win32/arm64/onnxruntime.dll',
];

describe('planOrtRemovals', () => {
  it('mac arm64：只留 darwin/arm64，去掉版本号重复 dylib', () => {
    const drop = planOrtRemovals(ortInventory, 'darwin', 'arm64');
    expect(drop).toEqual(
      expect.arrayContaining([
        'napi-v6/darwin/arm64/libonnxruntime.1.29.0.dylib',
        'napi-v6/linux/x64/libonnxruntime.so.1',
        'napi-v6/win32/x64/onnxruntime.dll',
      ]),
    );
    expect(drop).not.toContain('napi-v6/darwin/arm64/libonnxruntime.1.dylib');
    expect(drop).not.toContain('napi-v6/darwin/arm64/onnxruntime_binding.node');
  });

  it('win x64：只留 win32/x64 的 CPU 运行时', () => {
    const drop = planOrtRemovals(ortInventory, 'win32', 'x64');
    expect(drop).toEqual(
      expect.arrayContaining([
        'napi-v6/darwin/arm64/libonnxruntime.1.dylib',
        'napi-v6/linux/x64/libonnxruntime.so.1',
        'napi-v6/win32/arm64/onnxruntime.dll',
        'napi-v6/win32/x64/DirectML.dll',
        'napi-v6/win32/x64/dxcompiler.dll',
      ]),
    );
    expect(drop).not.toContain('napi-v6/win32/x64/onnxruntime.dll');
    expect(drop).not.toContain('napi-v6/win32/x64/onnxruntime_binding.node');
  });
});

describe('planLibnutRemovals', () => {
  it('只留本平台 libnut', () => {
    const names = ['libnut-darwin', 'libnut-linux', 'libnut-win32', 'nut-js'];
    expect(planLibnutRemovals(names, 'darwin')).toEqual(['libnut-linux', 'libnut-win32']);
    expect(planLibnutRemovals(names, 'win32')).toEqual(['libnut-darwin', 'libnut-linux']);
  });
});
