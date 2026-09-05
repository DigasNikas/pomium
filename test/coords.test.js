import test from 'node:test';
import assert from 'node:assert/strict';
import { windowX } from '../src/pom/coords.js';

test('adds the pane offset to a page coordinate', () => {
  assert.equal(windowX(10, { left: 4, top: 96 }), 14);
});

test('a click at the pane origin lands at the pane offset', () => {
  assert.equal(windowX(0, { left: 4, top: 96 }), 4);
});

test('a pane at the window origin is a pass-through', () => {
  assert.equal(windowX(37, { left: 0, top: 0 }), 37);
});

test('fractional pane offsets are preserved, not rounded', () => {
  assert.equal(windowX(10, { left: 0.5, top: 95.5 }), 10.5);
});

test('a missing rect is treated as the window origin', () => {
  assert.equal(windowX(5, null), 5);
});
