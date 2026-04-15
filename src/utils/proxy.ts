import http from 'node:http';
import { globalStats } from './stats-collector.js';
import { getConfig } from '../config.js';

/**
 * Quota Guard Local AI Proxy: Bridges browser requests to the guarded Node environment.
 * Allows non-plugin interception by pointing AI provider URLs to localhost:1989.
 */
export class ProxyServer {
  private server: http.Server | null = null;
  
  private get port() {
    return getConfig().proxyPort || 1989;
  }

  public start() {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      const fullPath = req.url || '/';

      // 1. Stats Reporting Bridge
      if (fullPath === '/__quota_guard_events' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const event = JSON.parse(body);
            globalStats.record(event);
            res.writeHead(204);
            res.end();
          } catch {
            res.writeHead(400);
            res.end('Invalid event data');
          }
        });
        return;
      }

      // 2. Serve Browser Agent (Registration Script)
      if (fullPath === '/register.js') {
        try {
          // Attempt to find the built register script relative to this util
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          // In dev, we can find it in dist/
          const possiblePaths = [
            // 1. Relative to this file in dist/ (bundled or unbundled)
            path.join(__dirname, 'register.js'),
            path.join(__dirname, 'register.mjs'),
            path.join(__dirname, '../register.js'),
            path.join(__dirname, '../register.mjs'),
            // 2. Relative to process.cwd() (original behavior, keep as fallback)
            path.join(process.cwd(), 'dist', 'register.js'),
            path.join(process.cwd(), 'dist', 'register.mjs'),
            // 3. Source fallback for local dev
            path.join(__dirname, '../register.ts'),
            path.join(__dirname, '../../src/register.ts')
          ];

          for (const p of possiblePaths) {
            try {
              const content = await fs.readFile(p, 'utf8');
              res.writeHead(200, { 'Content-Type': 'application/javascript' });
              res.end(content);
              return;
            } catch { /* try next */ }
          }
          res.writeHead(404);
          res.end('Quota Guard: register.js not found in dist/. Please run build.');
        } catch {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
        return;
      }

      // 3. CORS Preflight Handling
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 4. Identify Target Service
      // Format expected: http://localhost:1989/generativelanguage.googleapis.com/v1beta/...
      // OR if the path looks like a known endpoint, we can infer.
      const parts = fullPath.split('/').filter(Boolean);
      
      let targetHostname = '';
      let targetPath = '';

      const knownEndpoints = getConfig().aiEndpoints.map(e => String(e));

      if (parts.length > 0 && (parts[0].includes('.') || knownEndpoints.includes(parts[0]))) {
          targetHostname = parts[0];
          targetPath = '/' + parts.slice(1).join('/');
      } else {
          // Default fallbacks if no clear hostname in path
          if (fullPath.includes('/v1/chat/completions')) targetHostname = 'api.openai.com';
          else if (fullPath.includes('/v1/messages')) targetHostname = 'api.anthropic.com';
          else if (fullPath.includes('generateContent')) targetHostname = 'generativelanguage.googleapis.com';
          
          targetPath = fullPath;
      }

      if (!targetHostname) {
        res.writeHead(400);
        res.end('Quota Guard Proxy: Could not determine target AI service from path.');
        return;
      }

      const targetUrl = `https://${targetHostname}${targetPath}`;

      // 5. Proxy the Request using Node's native fetch (guarded by our interceptor)
      try {
        const bodyChunks: Buffer[] = [];
        req.on('data', chunk => bodyChunks.push(chunk));
        
        req.on('end', async () => {
          const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;
          
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
              if (value && key !== 'host' && key !== 'connection') {
                  headers.set(key, Array.isArray(value) ? value.join(', ') : value);
              }
          }

          try {
            const response = await fetch(targetUrl, {
              method: req.method,
              headers,
              body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
              // @ts-expect-error - duplex is required for streaming bodies
              duplex: 'half'
            });

            // 6. Forward Response back to Client
            const resHeaders: Record<string, string> = {};
            response.headers.forEach((v, k) => {
                if (k !== 'transfer-encoding' && k !== 'content-encoding') {
                    resHeaders[k] = v;
                }
            });

            res.writeHead(response.status, resHeaders);
            const resBuffer = await response.arrayBuffer();
            res.end(Buffer.from(resBuffer));
          } catch (err) {
            res.writeHead(502);
            res.end(`Quota Guard Proxy Error: ${String(err)}`);
          }
        });
      } catch (err) {
        res.writeHead(500);
        res.end(`Quota Guard Proxy Internal Error: ${String(err)}`);
      }
    });

    // Handle listen errors (e.g. port taken) explicitly
    this.server.on('error', (err: Error) => {
        const msg = `❌ Quota Guard Proxy Error: Failed to start on port ${this.port}. ${err.message}`;
        globalStats.addLog(msg);
        // We log to console as well because if the proxy fails, we want it clearly visible in the startup logs
        // eslint-disable-next-line no-console
        console.error(msg);
    });

    this.server.listen(this.port, () => {
       globalStats.addLog(`🛡️  AI Proxy Active on http://localhost:${this.port}`);
    });
  }

  public stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const globalProxy = new ProxyServer();
