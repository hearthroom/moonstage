/**
 * 沙箱殼的簡繁轉換字典（`npm run build:sandbox` 的第二步 → dist-sandbox/sandbox-zh.js）。
 *
 * 字典約 1 MB，不打進 sandbox.js：殼只在玩家介面語言需要轉時才用傳統 <script> 載它
 * （src/sandbox/display-script.ts）。打成 IIFE、固定檔名，站台 Worker 直接對應路徑。
 */
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'dist-sandbox'),
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, 'src/sandbox/zh/entry.ts'),
      name: 'msSandboxZh',
      formats: ['iife'],
      fileName: () => 'sandbox-zh.js',
    },
  },
  logLevel: 'warn',
})
