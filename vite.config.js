import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/geoserver': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      // 实验三：转发到本地 PostGIS REST API（server/index.js，端口3001）
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})