import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://localhost:3000',
      '/sale-status': 'http://localhost:3000',
      '/purchase': 'http://localhost:3000',
      '/purchase-status': 'http://localhost:3000',
    },
  },
});
