import { access } from 'node:fs/promises';

for (const file of ['index.html', 'src/app.js', 'src/styles.css', 'src/config.js']) {
  await access(file);
}
console.log('KSRTC RADIO static experience is ready to serve.');
