import { resolve } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // main / preload 走 electron-vite 默认入口（src/main/index.ts、src/preload/index.ts）。
  // @super-go/core 内联进 main bundle：打包产物（asar）不依赖 workspace 链接
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@super-go/core'] })],
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    server: {
      // renderer 需要引用 src/shared（workspace 根内），放开 fs 边界
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())],
      },
    },
  },
});
