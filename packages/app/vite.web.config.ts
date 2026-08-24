import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

/**
 * 浏览器开发模式（pnpm dev:web）：只起 renderer 的 vite 服务，不拉起 Electron。
 * 无 preload → main.tsx 注入 mockApi（core 真规则 + 模拟引擎），用于 UI 迭代
 * 与浏览器自动化验证。与 electron.vite.config.ts 的 renderer 段保持同构。
 */
export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5174,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
  },
});
