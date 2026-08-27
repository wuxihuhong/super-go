import { describe, expect, it } from 'vitest';
import {
  handleFromNativeBuffer,
  isSelfWindow,
  setSelfIdentity,
  windowIdFromMediaSource,
} from './selfWindow';

describe('isSelfWindow', () => {
  it('按句柄识别，不靠标题前缀', () => {
    setSelfIdentity({ handles: [42], pids: [1001] });
    expect(isSelfWindow({ handle: 42 })).toBe(true);
    expect(isSelfWindow({ handle: 99 })).toBe(false);
    expect(isSelfWindow({ handle: 99, pid: 1001 })).toBe(true);
    expect(isSelfWindow({ handle: 7, pid: 9 })).toBe(false);
  });

  it('解析 mediaSourceId 与 native handle buffer', () => {
    expect(windowIdFromMediaSource('window:12345:0')).toBe(12345);
    expect(windowIdFromMediaSource('screen:1:0')).toBeNull();
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(0x100), 0);
    expect(handleFromNativeBuffer(buf)).toBe(0x100);
  });
});
