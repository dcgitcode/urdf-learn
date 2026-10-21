import { defineConfig } from 'vite'

export default defineConfig({
  // 相对路径同时支持本地、域名根目录和 GitHub Pages 的仓库子目录。
  base: './',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: { main: 'index.html', lab: 'lab.html', editor: 'xml-editor.html' }
    },
    outDir: 'dist',
    assetsDir: 'assets'
  }
}) 
