const test = require('node:test');
const assert = require('node:assert/strict');
const { getState, slowPhases, targets } = require('../model.js');

function near(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected} (±${epsilon})`);
}

test('question 1 uses the return journey for Q and an uninterrupted journey for M', () => {
  const state = getState(20);
  near(state.q, -8);
  near(state.m, 8);
  near(getState(12).q, 16);
  near(getState(24).q, -20);
  near(getState(24).vq, 0);
  near(getState(24).vm, 0);
});

test('question 2 has exactly two distance-equality times throughout the normal journey', () => {
  const roots = [];
  const f = t => { const s = getState(t); return s.cq - s.pm; };
  for (let i = 0; i < 2400; i++) {
    const a = i / 100, b = (i + 1) / 100;
    if (f(a) === 0) roots.push(a);
    else if (f(a) * f(b) < 0) {
      let lo = a, hi = b;
      for (let j = 0; j < 35; j++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
      }
      roots.push((lo + hi) / 2);
    }
  }
  assert.equal(roots.length, 2);
  near(roots[0], 9.2);
  near(roots[1], 14);
  near(getState(roots[0]).m, -2.8);
  near(getState(roots[1]).m, 2);
});

test('question 3 positions are continuous at speed changes and at the turn', () => {
  slowPhases.slice(1).forEach(phase => {
    const before = getState(phase.start - 1e-9, true);
    const after = getState(phase.start, true);
    near(before.q, after.q);
    near(before.m, after.m);
  });
  near(getState(4, true).q, getState(4, true).m);
  near(getState(10, true).p, getState(10, true).n);
  near(getState(15, true).q, 16);
  near(getState(17.5, true).p, getState(17.5, true).n);
  near(getState(20.5, true).q, getState(20.5, true).m);
  near(getState(28.5, true).q, -20);
  near(getState(28.5, true).vm, 0);
});

test('fixed ruler lengths, overlap limits and full-containment plateaus hold', () => {
  for (let i = 0; i <= 5700; i++) {
    const s = getState(i / 200, true);
    near(s.q - s.p, 2);
    near(s.n - s.m, 4);
    assert.ok(s.overlap >= 0 && s.overlap <= 2 + 1e-9);
  }
  [6, 6.5, 7, 7.5, 8, 18.5, 19, 19.5].forEach(t => near(getState(t, true).overlap, 2));
  targets.forEach(t => near(getState(t, true).overlap, 1.5));
  near(getState(12, true).q, 7); // Not the old, constant-speed turn time.
  near(getState(24, true).q, -6.5); // Not the old stopping time either.
});

test('independent small-step simulation from the problem rules confirms all four times', () => {
  // No event table or hard-coded speed-change times: decide speed from geometry.
  // This independently checks the exact model, including accumulated slowdowns.
  const dt = 0.0001;
  let q = -20, m = -12, returning = false, previousL = 0;
  const crossings = [];
  for (let i = 1; i <= 285000; i++) {
    const overlap = Math.max(0, Math.min(q, m + 4) - Math.max(q - 2, m));
    const multiplier = overlap > 1e-9 ? 0.5 : 1;
    q += (returning ? -3 : 3) * multiplier * dt;
    m += multiplier * dt;
    if (!returning && q >= 16) { q = 16; returning = true; }
    const currentL = Math.max(0, Math.min(q, m + 4) - Math.max(q - 2, m));
    if ((previousL < 1.5 && currentL >= 1.5) || (previousL > 1.5 && currentL <= 1.5)) {
      crossings.push((i - 1 + (1.5 - previousL) / (currentL - previousL)) * dt);
    }
    previousL = currentL;
    if (i % 2500 === 0) {
      const exact = getState(i * dt, true);
      near(q, exact.q, 0.003);
      near(m, exact.m, 0.003);
    }
  }
  assert.equal(crossings.length, 4);
  crossings.forEach((t, i) => near(t, targets[i], 0.002));
  near(q, -20, 0.003);
});
