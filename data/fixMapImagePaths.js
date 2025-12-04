import fs from 'fs';
import path from 'path';

const mapPath = process.argv[2] || 'public/assets/map.json';
const targetFolder = process.argv[3] || './summer';

const text = fs.readFileSync(mapPath, 'utf8');
let data;
try {
  data = JSON.parse(text);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(1);
}
if (!Array.isArray(data.tilesets)) {
  console.error('No tilesets array found in map JSON.');
  process.exit(1);
}

for (const ts of data.tilesets) {
  if (ts.image && typeof ts.image === 'string') {
    const base = path.basename(ts.image.replace(/\\\\/g, '/'));
    ts.image = `${targetFolder}/${base}`;
    console.log(`Updated tileset image to: ${ts.image}`);
  }
}

fs.writeFileSync(mapPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Wrote updated map JSON to', mapPath);
