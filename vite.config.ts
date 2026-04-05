import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vite 8 / rolldown requires manualChunks to be a function, not an object
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'query-vendor'
          }
          if (id.includes('node_modules/recharts')) {
            return 'charts-vendor'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor'
          }
        },
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },  // FIX: absolute path for Vercel
  },
})
