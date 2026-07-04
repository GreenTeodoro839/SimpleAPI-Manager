import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_MANAGER_PROXY_TARGET || 'http://127.0.0.1:18318';

  return {
    plugins: [
      react(),
      viteSingleFile({
        removeViteModuleLoader: true
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/styles/variables.scss" as *;`
        }
      }
    },
    server: {
      port: 18318,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/simpleapi': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/health': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      target: 'es2020',
      assetsInlineLimit: 100000000,
      chunkSizeWarningLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    }
  };
});
