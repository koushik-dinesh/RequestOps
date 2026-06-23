const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const backendPort = Number(process.env.PORT || 5015);
const appBasePath = '/srt';
const bareAppRoutePrefixes = [
  '/requests',
  '/login',
  '/register',
  '/organization',
  '/project-manager',
  '/project-scopes',
  '/user-stories',
  '/sprints',
  '/development',
  '/developer-workload',
  '/daily-progress-reports',
  '/testing',
  '/uat',
  '/notifications',
  '/manual',
  '/panel',
];

function shouldRedirectToAppBase(urlPath) {
  if (!urlPath || urlPath.startsWith(appBasePath)) {
    return false;
  }
  if (urlPath === '/') {
    return true;
  }
  return bareAppRoutePrefixes.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`));
}

module.exports = defineConfig({
  root: __dirname,
  base: '/srt/',
  plugins: [
    {
      name: 'requestops-srt-redirect',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const [urlPath, query = ''] = (request.url || '').split('?');
          const search = query ? `?${query}` : '';

          if (urlPath === '/srt') {
            response.statusCode = 302;
            response.setHeader('Location', `${appBasePath}/${search}`);
            response.end();
            return;
          }

          if (shouldRedirectToAppBase(urlPath)) {
            const destination = urlPath === '/' ? `${appBasePath}/${search}` : `${appBasePath}${urlPath}${search}`;
            response.statusCode = 302;
            response.setHeader('Location', destination);
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
