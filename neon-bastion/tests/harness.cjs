const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Run the real simulation with a minimal DOM. Browser rendering is checked separately.
function loadGame() {
  const elements = new Map();
  const storage = new Map();
  const ctx = new Proxy({}, {get: (_, key) => key === 'createRadialGradient'
    ? () => ({addColorStop() {}}) : () => {}});
  function element(id) {
    if (!elements.has(id)) {
      let html = '';
      const el = {value: id === 'difficulty' ? 'standard' : '0', checked: false,
        textContent: '', disabled: false, hidden: false, style: {},
        classList: {add() {}, remove() {}, toggle() {}},
        setAttribute() {}, addEventListener() {}, getContext: () => ctx,
        getBoundingClientRect: () => ({width:960,height:600,left:0,top:0}),
        querySelector: () => ({style:{}})};
      Object.defineProperty(el, 'innerHTML', {get: () => html, set: v => {html=v;}});
      elements.set(id, el);
    }
    return elements.get(id);
  }
  let seed=42;
  const math = Object.create(Math);
  math.random = () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const sandbox = {Math:math, console,
    document: {getElementById:element,querySelectorAll:()=>[],addEventListener(){}},
    window: {addEventListener() {}},matchMedia:()=>({matches:true}),
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    ResizeObserver:class {observe() {}},devicePixelRatio:1,
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},confirm:()=>true};
  vm.createContext(sandbox);
  const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace(
    'fresh();resize();requestAnimationFrame(frame);',
    `fresh();globalThis.game={get state(){return state},get points(){return points},get segments(){return segments},get pathLength(){return pathLength},maps,difficulties,types,rules,fresh,stats,makeTower,choose,interact,validCell,roadDistance,position,startWave,spawn,update,damage,fire,arcRoutes,arcTarget,poweredRelays,overload,upgradeCost,recordKey};`);
  vm.runInContext(source,sandbox);
  return {g:sandbox.game,el:element,storage};
}
module.exports={loadGame};
