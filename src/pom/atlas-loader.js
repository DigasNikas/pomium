import { parseAtlas } from './atlas.js';

// The renderer runs with nodeIntegration, so atlases are read straight off
// disk. The extension had to fetch them to dodge page CSP; that constraint
// does not exist inside our own chrome.
export function createAtlasLoader({ tier, assetsDir }) {
  return async function load(key) {
    const { readFile } = require('node:fs/promises');
    const path = require('node:path');

    const base = path.join(assetsDir, tier, `${key}_${tier}`);
    const json = JSON.parse(await readFile(`${base}.json`, 'utf8'));
    const parsed = parseAtlas(json);

    const bytes = await readFile(path.join(assetsDir, tier, parsed.image));
    const blob = new Blob([bytes], { type: 'image/webp' });
    const image = await createImageBitmap(blob);

    return { image, frames: parsed.frames };
  };
}
