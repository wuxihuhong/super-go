import { defineConfig } from 'vitest/config';

/**
 * app 包单测：仅覆盖零 Electron 依赖的纯模块（UCI 协议层、引擎适配器）。
 * main 进程其余模块依赖 Electron 运行时，不进 Node 单测（分层检验由 core 承担）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
