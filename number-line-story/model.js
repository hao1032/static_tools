(function (root) {
  'use strict';
  // Each phase starts at an exact physical time. Both endpoints move together.
  const normalPhases = [
    { start: 0, end: 12, q: -20, m: -12, vq: 3, vm: 1 },
    { start: 12, end: 24, q: 16, m: 0, vq: -3, vm: 1 }
  ];
  const slowPhases = [
    { start: 0, end: 4, q: -20, m: -12, vq: 3, vm: 1 },
    { start: 4, end: 10, q: -8, m: -8, vq: 1.5, vm: 0.5 },
    { start: 10, end: 15, q: 1, m: -5, vq: 3, vm: 1 },
    { start: 15, end: 17.5, q: 16, m: 0, vq: -3, vm: 1 },
    { start: 17.5, end: 20.5, q: 8.5, m: 2.5, vq: -1.5, vm: 0.5 },
    { start: 20.5, end: 28.5, q: 4, m: 4, vq: -3, vm: 1 }
  ];
  function getState(time, slowed = false) {
    const phases = slowed ? slowPhases : normalPhases;
    const end = phases[phases.length - 1].end;
    const t = Math.max(0, Math.min(end, Number.isFinite(time) ? time : 0));
    const phase = phases.find(p => t < p.end - 1e-10) || phases[phases.length - 1];
    const dt = t - phase.start;
    const q = phase.q + phase.vq * dt;
    const p = q - 2;
    const m = phase.m + phase.vm * dt;
    const n = m + 4;
    const left = Math.max(p, m);
    const right = Math.min(q, n);
    return { t, p, q, m, n, left, right, overlap: Math.max(0, right - left), cq: 16 - q, pm: Math.abs(p - m), vq: t === end ? 0 : phase.vq, vm: t === end ? 0 : phase.vm, end, slowed };
  }
  const api = { getState, normalPhases, slowPhases, targets: [5.5, 8.5, 18.25, 19.75] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NumberLineModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
