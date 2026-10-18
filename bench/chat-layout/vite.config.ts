import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { authorRuleEngineDefine } from '../../build/engine-version'
const root = path.resolve(__dirname, '../..')
export default defineConfig({
  root,
  plugins: [vue()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: authorRuleEngineDefine(root),
  server: { host: '127.0.0.1', port: 4198, strictPort: true },
})
