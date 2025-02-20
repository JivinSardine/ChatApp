import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ChatApp/',
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.versions': {},
    'process.platform': '"browser"',
    'process.nextTick': '"(function(cb) { return setTimeout(cb, 0); })"',
    Buffer: ['buffer', 'Buffer']
  },
  resolve: {
    alias: {
      'simple-peer': 'simple-peer',
      buffer: 'buffer'
    },
  },
  optimizeDeps: {
    include: ['simple-peer']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});