import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'vendor_three';
            if (id.includes('gsap')) return 'vendor_gsap';
            if (id.includes('howler')) return 'vendor_howler';
            if (id.includes('chess.js')) return 'vendor_chess';
            return 'vendor';
          }
        },
      },
    },
  },
});
