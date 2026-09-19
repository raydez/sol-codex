import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function startCollector({ host = '127.0.0.1', port = 4318, output }) {
  if (!output) throw new Error('collector output path is required');
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== 'POST' || !['/v1/logs', '/v1/metrics'].includes(req.url)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.includes('json')) {
      res.writeHead(415, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'SoL-Codex collector requires Codex OTLP/HTTP protocol="json".' }));
      return;
    }
    const chunks = [];
    let bytes = 0;
    const max = 32 * 1024 * 1024;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > max) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      chunks.push(chunk);
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const record = { receivedAt: new Date().toISOString(), path: req.url, payload };
      await fs.appendFile(output, JSON.stringify(record) + '\n', { mode: 0o600 });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    } catch (error) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

export function otelToml({ endpoint = 'http://127.0.0.1:4318/v1/logs', environment = 'sol-codex-benchmark' } = {}) {
  return `[otel]\nenvironment = "${environment}"\nlog_user_prompt = false\n\n[otel.exporter."otlp-http"]\nendpoint = "${endpoint}"\nprotocol = "json"\n`;
}
