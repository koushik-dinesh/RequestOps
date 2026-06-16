const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const backendPort = Number(process.env.PORT || 5015);

module.exports = defineConfig({
  root: __dirname,
  base: '/srt/',
  plugins: [
    {
      name: 'requestops-srt-redirect',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/srt') {
            response.statusCode = 302;
            response.setHeader('Location', '/srt/');
            response.end();
            return;
          }
          next();
        });
      },
    },
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/srt/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/srt\/api/, '/api'),
      },
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
});
