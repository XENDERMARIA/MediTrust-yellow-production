import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Explicitly set base path
  server: {
    port: 3000
  },
  build: {
    // Ensure CSS is properly handled
    cssCodeSplit: false,
    outDir: 'dist',
    assetsDir: 'assets',
    // Minify CSS for production
    minify: 'terser',
    // Include source maps for debugging
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        // Ensure CSS is in a single file
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css')
            return 'assets/index.css';
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
})