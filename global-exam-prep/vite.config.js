  import { defineConfig, loadEnv } from 'vite'
  import react from '@vitejs/plugin-react'
  import viteCompression from 'vite-plugin-compression'

  // https://vite.dev/config/
  export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      plugins: [
        react(),
        viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
        viteCompression({ algorithm: 'gzip', ext: '.gz' })
      ],
      base: '/',
      build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                  return 'vendor-react';
                }
                if (id.includes('firebase')) {
                  return 'vendor-firebase';
                }
                if (id.includes('framer-motion') || id.includes('lucide-react')) {
                  return 'vendor-ui';
                }
                return 'vendor';
              }
            }
          }
        }
      },
      server: {
        proxy: {
          '/api/ai': {
            target: 'https://api.groq.com/openai/v1/chat/completions',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/ai/, ''),
            headers: {
              'Authorization': `Bearer ${env.VITE_GROQ_API_KEY || env.GROQ_API_KEY}`
            },
            timeout: 60000,
            proxyTimeout: 60000
          }
        }
      },
      optimizeDeps: {
        // Exclude pdfjs-dist from pre-bundling so the ?url worker import
        // works correctly in both dev and production modes
        exclude: ['pdfjs-dist'],
      },
    }
  })

