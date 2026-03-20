import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/health': apiProxyTarget,
        '/sale-status': apiProxyTarget,
        '/purchase': apiProxyTarget,
        '/purchase-status': apiProxyTarget,
      },
    },
  };
});
