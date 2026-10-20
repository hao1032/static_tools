const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadGame} = require('./harness.cjs');
const enemy=(x,y,d=0)=>({x,y,d,hp:1000,maxHp:1000,kind:'normal',reward:6,hit:0,slow:0,size:10,speed:0});

test('all maps have valid routes, forbidden roads, and separate records',()=>{
 const {g,el}=loadGame();const keys=new Set();
 for(let m=0;m<g.maps.length;m++)for(const difficulty of Object.keys(g.difficulties)){
  el('map-select').value=String(m);el('difficulty').value=difficulty;g.fresh();
  assert.equal(g.state.towers.length,0);assert.equal(g.state.credits,g.difficulties[difficulty].credits);
  for(const segment of g.segments){
   assert.ok(segment.a.x===segment.b.x||segment.a.y===segment.b.y);
   for(let d=0;d<=segment.length;d+=40){const p=g.position(segment.start+d);assert.equal(g.validCell((p.x-20)/40,(p.y-20)/40),false);}
  }
  assert.ok(g.pathLength>1200);assert.equal(g.position(g.pathLength).x,940);keys.add(g.recordKey());
 }
 assert.equal(keys.size,g.maps.length*Object.keys(g.difficulties).length);
});

test('building, upgrading and selling use actual crystal costs',()=>{
 const {g,el}=loadGame();g.choose(4);g.interact(6,5);
 assert.equal(g.state.credits,320);assert.equal(g.state.towers[0].type,4);
 g.interact(6,5);el('upgrade').onclick();assert.equal(g.state.credits,296);
 assert.equal(g.state.towers[0].level,2);assert.equal(g.stats(g.state.towers[0]).range,165);
 el('sell').onclick();assert.equal(g.state.credits,333);assert.equal(g.state.towers.length,0);
 g.choose(0);g.interact(4,7);assert.equal(g.state.credits,333);
});

test('an isolated iron pillar cannot attack',()=>{
 const {g}=loadGame();g.state.towers=[g.makeTower(4,6,5)];g.state.enemies=[enemy(270,220)];
 for(let i=0;i<100;i++)g.update(.025);
 assert.equal(g.state.enemies[0].hp,1000);assert.equal(g.state.shots.length,0);assert.equal(g.poweredRelays().size,0);
});

test('relay paths extend lightning with attenuation and no duplicated attacks',()=>{
 const {g}=loadGame();const source=g.makeTower(1,1,1);
 const poles=[g.makeTower(4,4,1),g.makeTower(4,7,1),g.makeTower(4,10,1),g.makeTower(4,13,1)];
 g.state.towers=[source,...poles];const target=enemy(660,60,500);g.state.enemies=[target];
 assert.equal(g.arcTarget(source),null,'level 1 cannot reach a fourth relay');
 source.level=2;const attack=g.arcTarget(source);assert.ok(attack);assert.equal(attack.route.hops,4);
 const before=target.hp;g.fire(source,[target],attack.route);
 assert.ok(Math.abs(before-target.hp-g.stats(source).damage*Math.pow(.85,4))<1e-8);
 assert.equal(g.state.effects.filter(e=>e.kind==='arc').length,1);
 g.state.towers.splice(2,1);assert.equal(g.arcTarget(source),null,'removing a bridge disconnects downstream pillars');
});

test('cycles and branches cannot multiply a source attack or exceed its hop cap',()=>{
 const {g}=loadGame(),s=g.makeTower(1,1,1);g.state.towers=[s];
 for(const [x,y] of [[4,1],[4,4],[1,4],[7,4],[7,1],[10,1]])g.state.towers.push(g.makeTower(4,x,y));
 const routes=g.arcRoutes(s);assert.ok(routes.every(r=>r.hops<=3));assert.equal(new Set(routes.map(r=>r.node)).size,routes.length);
 g.state.enemies=[enemy(180,80,100),enemy(200,90,101)];const attack=g.arcTarget(s);g.fire(s,[attack.target],attack.route);
 assert.equal(g.state.effects.filter(e=>e.kind==='arc').length,1);
 assert.ok(g.state.enemies.every(e=>e.hp<1000));
});

test('automatic waves wait five real seconds, freeze while paused and can be cancelled',()=>{
 const {g,el}=loadGame();el('auto-wave').checked=true;el('auto-wave').onchange();g.update(20);assert.equal(g.state.wave,0);
 g.startWave();g.state.spawnLeft=0;g.update(.025);assert.equal(g.state.nextWaveIn,5);
 g.state.speed=3;g.update(6);assert.equal(g.state.nextWaveIn,3);
 g.state.paused=true;g.update(50);assert.equal(g.state.nextWaveIn,3);
 g.state.paused=false;el('auto-wave').checked=false;el('auto-wave').onchange();g.update(50);assert.equal(g.state.wave,1);
 el('auto-wave').checked=true;el('auto-wave').onchange();g.update(15);assert.equal(g.state.wave,2);assert.equal(g.state.nextWaveIn,null);
});

test('overload cooldown cannot be farmed between waves and stops on pause',()=>{
 const {g}=loadGame();g.state.abilityCD=42;g.update(10);assert.equal(g.state.abilityCD,42);
 g.startWave();g.overload();g.update(1);assert.equal(g.state.abilityCD,41);
 g.state.paused=true;g.update(10);assert.equal(g.state.abilityCD,41);
});

test('difficulty increases enemy health and pressure while reducing starting resources',()=>{
 const {g,el}=loadGame();let previousHp=0,previousCount=0,previousCredits=Infinity;
 for(const id of ['casual','standard','hard','expert']){
  el('difficulty').value=id;g.fresh();g.startWave();g.spawn();
  assert.ok(g.state.enemies[0].hp>previousHp);assert.ok(g.state.spawnLeft>=previousCount);assert.ok(g.state.credits<previousCredits);
  previousHp=g.state.enemies[0].hp;previousCount=g.state.spawnLeft;previousCredits=g.state.credits;
 }
});

test('armor creates distinct counters and bosses resist overload and slow',()=>{
 const {g}=loadGame();const normal=enemy(0,0),tank={...enemy(0,0),kind:'tank'},shield={...enemy(0,0),kind:'shield'};
 g.damage(normal,100,g.makeTower(0,1,1));g.damage(tank,100,g.makeTower(0,1,1));g.damage(shield,100,g.makeTower(1,1,1));
 assert.equal(normal.hp,900);assert.equal(tank.hp,935);assert.equal(shield.hp,945);
 g.startWave();g.state.enemies=[{...enemy(20,300),kind:'boss',speed:100}];g.overload();g.update(1);
 assert.equal(g.state.enemies[0].d,80);assert.ok(g.state.enemies[0].hp>900);
});

test('artillery still explodes at last known position when its target dies in flight',()=>{
 const {g}=loadGame();const tower=g.makeTower(3,1,1),target=enemy(100,60),nearby=enemy(110,60);
 g.state.enemies=[target,nearby];g.fire(tower,[target]);target.hp=0;
 for(let i=0;i<20;i++)g.update(.025);
 assert.ok(nearby.hp<1000);assert.equal(g.state.shots.length,0);
});

test('victory stops auto waves; defeat and reset discard old countdowns and effects',()=>{
 const {g,el}=loadGame();g.state.auto=true;g.state.wave=19;g.startWave();g.state.spawnLeft=0;g.update(.025);
 assert.equal(g.state.finished,true);assert.equal(g.state.nextWaveIn,null);g.update(100);assert.equal(g.state.wave,20);
 g.fresh();g.startWave();g.state.enemies=[{...enemy(940,260,g.pathLength),kind:'boss'}];g.state.lives=1;g.update(.025);
 assert.equal(g.state.lives,0);assert.equal(g.state.finished,true);assert.equal(el('overlay').hidden,false);
 g.fresh();assert.equal(g.state.wave,0);assert.equal(g.state.nextWaveIn,null);assert.equal(g.state.effects.length,0);assert.equal(el('overlay').hidden,true);
});
