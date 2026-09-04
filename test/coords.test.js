import test from 'node:test';
import assert from 'node:assert/strict';
import { windowPoint } from '../src/pom/coords.js';

test('adds the pane offset to page coordinates', () => {
  assert.deepEqual(windowPoint(10, 20, { left: 0, top: 96 }), { x: 10, y: 116 });
});

test('a click at the pane origin lands at the pane offset', () => {
  assert.deepEqual(windowPoint(0, 0, { left: 4, top: 96 }), { x: 4, y: 96 });
});

test('a pane at the window origin is a pass-through', () => {
  assert.deepEqual(windowPoint(37, 51, { left: 0, top: 0 }), { x: 37, y: 51 });
});

test('fractional pane offsets are preserved, not rounded', () => {
  const p = windowPoint(10, 10, { left: 0.5, top: 95.5 });
  assert.equal(p.x, 10.5);
  assert.equal(p.y, 105.5);
});

test('a missing rect is treated as the window origin', () => {
  assert.deepEqual(windowPoint(5, 6, null), { x: 5, y: 6 });
});
