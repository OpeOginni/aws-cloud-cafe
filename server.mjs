import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { menu, quoteOrder } from './api/pricing.mjs';

const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

export function createApp() {
  return createServer(async (req, res) => {
    const requestId = randomUUID();
    const commit = process.env.GIT_COMMIT || 'local';
    const json = (status, data) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-request-id': requestId,
        'x-commit': commit,
      }).end(JSON.stringify({ ...data, requestId, commit }));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/menu') return json(200, { menu });
      if (req.method === 'POST' && path === '/api/quote') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) return json(413, { error: 'Request too large' });
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return json(400, { error: 'Invalid JSON' }); }
        try { return json(200, { quote: quoteOrder(input) }); }
        catch (error) {
          if (error instanceof TypeError) return json(400, { error: error.message });
          throw error;
        }
      }
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path];
        const body = await readFile(new URL(`./web/${file}`, import.meta.url));
        return res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
      }
      json(404, { error: 'Not found' });
    } catch (error) {
      console.error(`Request ${requestId} failed:`, error);
      if (!res.headersSent && !res.destroyed) json(500, { error: 'The coffee bar is temporarily unavailable' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // GitTerm reserves PORT for its own runtime, so this app uses APP_PORT.
  const port = Number(process.env.APP_PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => console.log(`Cloud Café → http://localhost:${port}`));
}
