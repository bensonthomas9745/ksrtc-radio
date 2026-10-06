import { access } from 'node:fs/promises';
import { execSync } from 'node:child_process';

for (const file of ['index.html', 'about.html', 'ads.txt', 'sitemap.xml', 'robots.txt', 'llms.txt', 'src/app.js', 'src/styles.css', 'src/config.js']) {
  await access(file);
}

execSync('node --check src/app.js', { stdio: 'inherit' });
execSync('node --check src/config.js', { stdio: 'inherit' });

console.log('KSRTC RADIO static experience is ready to serve.');
