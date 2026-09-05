import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTER_COUNT } from '../src/pom/config.js';
import { parseAtlas } from '../src/pom/atlas.js';

function assetPath(...segments) {
  return fileURLToPath(new URL(`../assets/${segments.join('/')}`, import.meta.url));
}

const manifest = JSON.parse(
  readFileSync(new URL('../assets/atlases.json', import.meta.url))
);

// Mirrors src/pom/index.js's own FRAME_COUNTS / DEFAULT_CHARACTER_FRAMES: a
// character atlas is 96 frames, the shockwave is 17. Nothing imports those
// constants (they are module-private there), so they are pinned here too —
// if the port's constant and the real asset ever drift, one of the two
// copies below will fail to point at the truth.
const CHARACTER_FRAME_COUNT = 96;
const SHOCKWAVE_FRAME_COUNT = 17;

test('the manifest describes both tiers', () => {
  assert.deepEqual(Object.keys(manifest.tiers).sort(), ['desktop', 'mobile']);
});

test('each tier lists ten characters plus a shockwave', () => {
  const expectedCharacters = Array.from({ length: CHARACTER_COUNT }, (_, i) =>
    `char_${String(i + 1).padStart(2, '0')}`
  );
  for (const [name, tier] of Object.entries(manifest.tiers)) {
    assert.equal(tier.characters.length, CHARACTER_COUNT, `${name} character count`);
    assert.deepEqual(tier.characters, expectedCharacters, `${name} character list`);
    assert.equal(
      new Set(tier.characters).size,
      tier.characters.length,
      `${name} characters are unique`
    );
    assert.equal(tier.shockwave, 'shockwave');
    assert.equal(tier.suffix, name);
  }
});

test('every character key and the shockwave have both files on disk, in both tiers', () => {
  for (const [tierName, tier] of Object.entries(manifest.tiers)) {
    const keys = [...tier.characters, tier.shockwave];
    for (const key of keys) {
      const base = `${key}_${tier.suffix}`;
      const jsonPath = assetPath(tierName, `${base}.json`);
      const webpPath = assetPath(tierName, `${base}.webp`);
      assert.ok(existsSync(jsonPath), `missing atlas json: ${jsonPath}`);
      assert.ok(existsSync(webpPath), `missing atlas image: ${webpPath}`);
    }
  }
});

test('atlas frame counts on disk match the engine\'s hardcoded constants', () => {
  for (const [tierName, tier] of Object.entries(manifest.tiers)) {
    for (const key of tier.characters) {
      const base = `${key}_${tier.suffix}`;
      const json = JSON.parse(readFileSync(assetPath(tierName, `${base}.json`), 'utf8'));
      const { frames } = parseAtlas(json);
      assert.equal(
        frames.length,
        CHARACTER_FRAME_COUNT,
        `${tierName}/${key} should have ${CHARACTER_FRAME_COUNT} frames`
      );
    }

    const shockwaveBase = `${tier.shockwave}_${tier.suffix}`;
    const shockwaveJson = JSON.parse(
      readFileSync(assetPath(tierName, `${shockwaveBase}.json`), 'utf8')
    );
    const { frames } = parseAtlas(shockwaveJson);
    assert.equal(
      frames.length,
      SHOCKWAVE_FRAME_COUNT,
      `${tierName}/shockwave should have ${SHOCKWAVE_FRAME_COUNT} frames`
    );
  }
});
