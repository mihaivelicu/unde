// /var/www/undeapp/frontend/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // REST API
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      ws: true,
    })
  );

  // WebSocket endpoint
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      ws: true,
      // Ensure proper upgrade headers in dev
      headers: {
        Connection: 'Upgrade',
      },
    })
  );
};
