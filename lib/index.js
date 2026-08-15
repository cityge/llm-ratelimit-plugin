// lib/index.js
export const inject = ['webServer'];

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

export function apply(ctx) {
  const webServer = ctx.webServer;
  console.log('[llm-ratelimit] 服务端正在加载...');

  const WINDOW_MS = 60000;
  let maxPerMinute = 10;
  const timestamps = [];
  let enabled = true;

  webServer.register({
    kind: 'prefix',
    path: '/llm-ratelimit',
    handler: (req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      const path = url.pathname;
      const method = req.method || 'GET';

      console.log(`[llm-ratelimit] ${method} ${path}`);

      try {
        if (path === '/llm-ratelimit/status' && method === 'GET') {
          const now = Date.now();
          const inWindow = timestamps.filter(t => t > now - WINDOW_MS).length;
          sendJson(res, 200, {
            enabled,
            maxPerMinute,
            inWindow,
            remaining: Math.max(0, maxPerMinute - inWindow)
          });
          return;
        }

        if (path === '/llm-ratelimit/configure' && method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { maxPerMinute: newLimit } = JSON.parse(body);
              if (typeof newLimit === 'number' && newLimit >= 1) {
                maxPerMinute = Math.floor(newLimit);
              }
              sendJson(res, 200, { ok: true, maxPerMinute });
            } catch {
              sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
            }
          });
          return;
        }

        if (path === '/llm-ratelimit/toggle' && method === 'POST') {
          enabled = !enabled;
          sendJson(res, 200, { ok: true, enabled });
          return;
        }

        if (path === '/llm-ratelimit/reset' && method === 'POST') {
          timestamps.length = 0;
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 404, { ok: false, error: 'Not found' });
      } catch (e) {
        console.error('[llm-ratelimit] 处理请求出错:', e);
        sendJson(res, 500, { ok: false, error: 'Internal server error' });
      }
    }
  });

  ctx.on('llm/stream', async (options, next) => {
    if (!enabled) return next();

    const now = Date.now();
    const inWindow = timestamps.filter(t => t > now - WINDOW_MS).length;

    if (inWindow >= maxPerMinute) {
      console.log('[llm-ratelimit] 触发限流，等待 1 秒');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return ctx.emit('llm/stream', options, next);
    }

    timestamps.push(now);
    return next();
  });

  console.log('[llm-ratelimit] 服务端加载完成，路由前缀 /llm-ratelimit');
}