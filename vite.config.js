import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* V16.1: Chunk splitting strategy
   - vendor-react: React core (rarely changes, long-term cached)
   - vendor-firebase: Firebase SDK (large, rarely changes)
   - vendor-recharts: Charts library (only loaded when dashboard/reports viewed)
   - xlsx: Already split as dynamic import in utils/qr.js
   - Each lazy-loaded page becomes its own chunk automatically */
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
          ],
          'vendor-recharts': ['recharts'],
        },
      },
    },
  },
})
