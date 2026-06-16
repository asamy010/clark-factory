import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* V21.27.26 (perf tooling): bundle-size visualizer — OFF by default.
   شغّله بـ `ANALYZE=1 npm run build` → يطلع dist/stats.html (treemap
   تفاعلي بأحجام gzip/brotli) عشان نشوف إيه اللي بيكبّر الـ chunks فعلاً
   بدل التخمين. الاستيراد ديناميكي + شرطي فالـ build العادي مش محتاج
   الحزمة أصلاً ولا بيتأثر أداؤه. */
const plugins = [react()]
if (process.env.ANALYZE) {
  try {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(visualizer({
      filename: 'dist/stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
    }))
  } catch (e) {
    console.warn('[vite] ANALYZE=1 لكن rollup-plugin-visualizer مش متثبّت — نفّذ: npm i -D rollup-plugin-visualizer')
  }
}

/* V16.1: Chunk splitting strategy
   - vendor-react: React core (rarely changes, long-term cached)
   - vendor-firebase: Firebase SDK (large, rarely changes)
   - vendor-recharts: Charts library (only loaded when dashboard/reports viewed)
   - xlsx: Already split as dynamic import in utils/qr.js
   - Each lazy-loaded page becomes its own chunk automatically */
export default defineConfig({
  plugins,
  build: {
    /* V21.9.201 (perf): target modern browsers (es2020 is universally
       supported since ~2020) so Vite/esbuild transpile less → smaller, faster
       bundles. Safe for all current devices used to run CLARK. */
    target: 'es2020',
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
