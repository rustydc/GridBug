import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  base: '',
  optimizeDeps: {
    exclude: ['replicad-opencascadejs']
  },
  build: {
    sourcemap: true,
    // Ensure wasm files are properly handled
    assetsInlineLimit: 0
  },
  // Configure WASM file loading
  assetsInclude: ['**/*.wasm'],
});