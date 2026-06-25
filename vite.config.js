import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: __dirname,               // ← explicite
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src2'),
      },
    },
    server: {
      host: true,
      port: parseInt(env.VITE_PORT || env.PORT || 5173, 10),
      strictPort: true,
    },
  }
})