import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp4':'video/mp4', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.xml':'application/xml', '.txt':'text/plain' };
createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let relative = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = normalize(join(root, relative));
  if (!existsSync(file) && existsSync(file + '.html')) {
    file = file + '.html';
  } else if (existsSync(file) && statSync(file).isDirectory() && existsSync(join(file, 'index.html'))) {
    file = join(file, 'index.html');
  }
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404); response.end('Not found'); return; }
  const stat = statSync(file);
  const total = stat.size;
  const range = request.headers.range;
  const contentType = types[extname(file)] || 'application/octet-stream';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const chunksize = (end - start) + 1;
    response.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType
    });
    createReadStream(file, { start, end }).pipe(response);
  } else {
    response.writeHead(200, {
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    });
    createReadStream(file).pipe(response);
  }
}).listen(4174, '0.0.0.0', () => {
  const nets = networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  console.log(`\n  🚍 KSRTC RADIO server running:\n`);
  console.log(`  ➜  Local:   http://localhost:4174`);
  ips.forEach(ip => console.log(`  ➜  Network: http://${ip}:4174`));
  console.log('');
});
