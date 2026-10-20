'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const W=960,H=600,CELL=40,MAX_WAVE=20,TAU=Math.PI*2;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const types=[
 {name:'脉冲尖塔',en:'PULSE',symbol:'△',color:'#9df4ce',cost:90,damage:17,range:148,rate:.42,desc:'高速单体 · 精准截击',sides:3},
 {name:'雷链矩阵',en:'ARC',symbol:'◇',color:'#b2a0ff',cost:150,damage:28,range:150,rate:1.05,desc:'连锁闪电 · 群体打击',sides:4},
 {name:'霜环发生器',en:'FROST',symbol:'◎',color:'#7ddcff',cost:120,damage:7,range:120,rate:1.2,desc:'范围减速 · 战场控制',sides:6},
 {name:'星陨重炮',en:'NOVA',symbol:'⬡',color:'#f2cd83',cost:180,damage:65,range:185,rate:1.85,desc:'范围爆破 · 破甲终结',sides:6},
 {name:'铁柱中继',en:'RELAY',symbol:'⌁',color:'#a4bec9',cost:30,damage:0,range:145,rate:0,desc:'不主动攻击 · 传递闪电',sides:4}
];
const maps = [
 {id:'orbit',name:'星环边界',en:'ORBITAL FRONTIER',tip:'均衡战区 · 在折角交叉覆盖火力',color:'#9df4ce',path:[[0,7],[4,7],[4,3],[10,3],[10,11],[17,11],[17,6],[23,6]]},
 {id:'canyon',name:'折跃峡谷',en:'WARP CANYON',tip:'纵深战区 · 用中继串联分散的防线',color:'#b2a0ff',path:[[0,3],[7,3],[7,10],[14,10],[14,4],[20,4],[20,8],[23,8]]},
 {id:'echo',name:'回声回廊',en:'ECHO CORRIDOR',tip:'回环战区 · 敌人移速更快，利用重叠火力',color:'#7ddcff',path:[[0,11],[20,11],[20,3],[4,3],[4,7],[23,7]]},
 {id:'rift',name:'断层捷径',en:'RIFT SHORTCUT',tip:'短途战区 · 空间紧凑，优先减速与爆破',color:'#f2cd83',path:[[0,7],[7,7],[7,4],[14,4],[14,9],[19,9],[19,7],[23,7]]}
 ,{id:'helix',name:'螺旋回廊',en:'HELIX RUN',tip:'多重转向战区 · 适合用霜环塔控制长距离回廊',color:'#ff9fbe',path:[[0,2],[5,2],[5,12],[11,12],[11,5],[17,5],[17,10],[23,10]]}
 ,{id:'prism',name:'棱镜分界',en:'PRISM DIVIDE',tip:'交错分界战区 · 雷链塔可以借助中继覆盖中心区域',color:'#8fe7ff',path:[[0,10],[3,10],[3,4],[9,4],[9,9],[15,9],[15,2],[23,2]]}
 ,{id:'gauntlet',name:'熔断回路',en:'FUSED GAUNTLET',tip:'连续折返战区 · 敌人路径较长，适合建立多层火力网',color:'#ffbd7a',path:[[0,5],[6,5],[6,12],[12,12],[12,3],[18,3],[18,8],[23,8]]}
 ,{id:'zenith',name:'天顶航线',en:'ZENITH LINE',tip:'高低交错战区 · 入口与核心分处两侧，考验部署节奏',color:'#c6a6ff',path:[[0,12],[8,12],[8,8],[4,8],[4,2],[14,2],[14,6],[23,6]]}
];
const difficulties = {
 casual:{name:'休闲',credits:440,lives:25,hp:.75,speed:.9,income:1.12,count:.9,gap:1.1,description:'容错充足 · 生命 ×0.75 / 移速 ×0.90 / 收入 ×1.12'},
 standard:{name:'标准',credits:350,lives:20,hp:1,speed:1,income:1,count:1,gap:1,description:'推荐挑战 · 有限经济，需要持续建设与升级'},
 hard:{name:'困难',credits:310,lives:15,hp:1.35,speed:1.08,income:.92,count:1.08,gap:.93,description:'生命 ×1.35 / 移速 ×1.08 / 收入 ×0.92'},
 expert:{name:'极限',credits:280,lives:10,hp:1.7,speed:1.15,income:.86,count:1.15,gap:.86,description:'生命 ×1.70 / 移速 ×1.15 / 收入 ×0.86 · 推荐熟练后挑战'}
};
let points=[],segments=[],pathLength=0;
function setPath(index){
 points=maps[index].path.map(([x,y])=>({x:x*CELL+20,y:y*CELL+20}));
 segments=[];pathLength=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
  segments.push({a,b,length,start:pathLength});pathLength+=length;
 }
}
function rules(){return difficulties[state.difficulty];}
function recordKey(){return `neon-bastion-best-v2-${maps[state.map].id}-${state.difficulty}`;}
const rand=(a,b)=>a+Math.random()*(b-a);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let state, time=0,last=0,hover=null,keyCell={x:7,y:7},toastTimer,soundOn=false,audioContext;
const stars=Array.from({length:60},()=>({x:rand(0,W),y:rand(0,H),r:rand(.4,1.2),phase:rand(0,TAU)}));
function loadBest(){try{return Number(localStorage.getItem(recordKey()))||0;}catch{return 0;}}
function fresh(){
 const map=Number($('map-select').value)||0,difficulty=$('difficulty').value||'standard',r=difficulties[difficulty];
 setPath(map);
 state={map,difficulty,credits:r.credits,lives:r.lives,wave:0,kills:0,towers:[],enemies:[],particles:[],effects:[],shots:[],texts:[],build:null,selected:null,running:false,paused:false,speed:1,spawnLeft:0,spawnTimer:0,spawnIndex:0,abilityCD:0,finished:false,shake:0,best:0,auto:$('auto-wave').checked,nextWaveIn:null};
 state.best=loadBest();
 $('overlay').hidden=true;hover=null;renderSelection();sync();
}
function makeTower(type,gx,gy){return{type,gx,gy,x:gx*40+20,y:gy*40+20,level:1,cool:rand(.05,.4),angle:-Math.PI/2,flash:0,spent:types[type].cost,kills:0};}
function stats(t){const d=types[t.type],m=t.level-1;return{damage:d.damage*(1+m*.62),range:d.range+m*(t.type===4?20:12),rate:d.rate/(1+m*.17)};}
function position(d){for(const s of segments){if(d<=s.start+s.length){const t=Math.max(0,(d-s.start)/s.length);return{x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t};}}return{...points.at(-1)};}
function roadDistance(x,y){let min=Infinity;for(const s of segments){const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(y-s.a.y)*dy)/(s.length*s.length)));min=Math.min(min,Math.hypot(x-s.a.x-t*dx,y-s.a.y-t*dy));}return min;}
function validCell(gx,gy){const x=gx*40+20,y=gy*40+20;return gx>=1&&gx<23&&gy>=1&&gy<14&&roadDistance(x,y)>39&&!state.towers.some(t=>t.gx===gx&&t.gy===gy);}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2300);}
function sync(){
 const map=maps[state.map],locked=state.wave>0&&!state.finished;
 $('map-select').disabled=locked;$('difficulty').disabled=locked;
 $('sector-title').textContent=`0${state.map+1} / ${map.name}`;$('sector-code').textContent=`SECTOR: ${map.en}`;
 $('map-tip').textContent=map.tip;$('difficulty-tip').textContent=rules().description;
 $('lives-max').textContent=`/ ${rules().lives}`;$('best').textContent=`本战区纪录 ${state.best} / 20`;
 $('auto-wave').checked=state.auto;$('auto-label').textContent=state.nextWaveIn!==null?`下一波 ${Math.ceil(state.nextWaveIn)} 秒`:'自动开始下一波';
 $('config-lock').textContent=locked?'地图与难度已锁定 · 重新开始可切换':'开局前可自由切换地图与难度';
 $('credits').textContent=state.credits;$('lives').textContent=state.lives;$('wave').textContent=String(state.wave).padStart(2,'0');$('kills').textContent=state.kills;
 $('status').textContent=state.finished?(state.lives>0?'战区肃清':'核心离线'):state.paused?'模拟已暂停':state.running?'敌袭进行中':'准备部署';
 $('start').disabled=state.running||state.finished;$('start').innerHTML=state.running?`第 ${String(state.wave).padStart(2,'0')} 波进行中 <span>•</span>`:state.nextWaveIn!==null?`立即开始 · ${Math.ceil(state.nextWaveIn)}s <span>↗</span>`:`开始第 ${String(Math.min(20,state.wave+1)).padStart(2,'0')} 波 <span>↗</span>`;
 $('wave-hint').textContent=state.running?`剩余敌人 ${state.enemies.filter(e=>e.hp>0).length+state.spawnLeft} · ${state.wave%5===0?'精英入侵':'保持火力覆盖'}`:state.wave?`波次奖励已到账 · 继续强化防线`:'防线就绪，等待你的指令';
 $('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',state.paused?'继续':'暂停');$('speed').innerHTML=`${state.speed}× <small>速度</small>`;
 $('ability').disabled=state.abilityCD>0||!state.running||state.finished||state.paused;$('ability-state').textContent=state.abilityCD>0?`${Math.ceil(state.abilityCD)}s`:'就绪 ↗';
 document.querySelectorAll('.tower-card').forEach((el,i)=>{el.classList.toggle('active',state.build===i);el.setAttribute('aria-pressed',String(state.build===i));el.querySelector('.price').style.opacity=state.credits<types[i].cost?'.4':'1';});
 if(state.selected){const t=state.selected,metric=$('tower-stat');if(metric)metric.textContent=t.type===4?(poweredRelays().has(t)?'已通电':'未连接'):t.kills;const up=$('upgrade');if(up)up.disabled=t.level>=3||state.credits<upgradeCost(t)||state.finished;}
}
$('tower-list').innerHTML=types.map((t,i)=>`<button class="tower-card" data-type="${i}" style="--tower-color:${t.color}" aria-pressed="false"><span class="shape">${t.symbol}</span><span class="tower-info"><strong>${t.name}</strong><small>${t.desc}</small></span><span class="price">◈ ${t.cost}<small>0${i+1}</small></span></button>`).join('');
function choose(i){if(state.finished)return;state.build=state.build===i?null:i;state.selected=null;renderSelection();sync();tone(400+i*100,.035,'sine',.025);}
$('tower-list').addEventListener('click',e=>{const b=e.target.closest('[data-type]');if(b)choose(+b.dataset.type);});
const intel='<div class="intel-icon">◎</div><p>每一道棱角，都是一道防线。</p><small>没有免费炮塔：开局先建立火力。铁柱需连接雷链塔，每跳损失 15% 伤害；可切换难度练习。</small>';
function upgradeCost(t){return Math.round(types[t.type].cost*(.8+(t.level-1)*.55));}
function renderSelection(){const el=$('details'),t=state.selected;
 if(t){const d=types[t.type],s=stats(t);el.innerHTML=`<div class="detail-title"><span style="color:${d.color}">${d.symbol}</span>${d.name}<small>LV.${t.level} / 3</small></div><div class="detail-metrics"><span>${t.type===4?'传导':'伤害'} <b>${t.type===4?'85%':Math.round(s.damage)}</b></span><span>${t.type===4?'接力':'射程'} <b>${s.range}</b></span><span>${t.type===4?'状态':'击杀'} <b id="tower-stat">${t.type===4?(poweredRelays().has(t)?'已通电':'未连接'):t.kills}</b></span></div><div class="detail-actions"><button id="upgrade">${t.level>=3?'已达最高等级':`升级 ◈ ${upgradeCost(t)}`}</button><button id="sell">回收 +${Math.floor(t.spent*.7)}</button></div>`;
 $('upgrade').onclick=()=>{if(t.level>=3||state.credits<upgradeCost(t)||state.finished)return;const cost=upgradeCost(t);state.credits-=cost;t.spent+=cost;t.level++;burst(t.x,t.y,d.color,28);ring(t.x,t.y,d.color,60,.55);tone(700,.13);renderSelection();sync();};
 $('sell').onclick=()=>{if(state.finished)return;state.credits+=Math.floor(t.spent*.7);state.towers=state.towers.filter(a=>a!==t);state.selected=null;burst(t.x,t.y,d.color,12);renderSelection();sync();};
 }else if(state.build!==null){const d=types[state.build];el.innerHTML=`<div class="detail-title"><span style="color:${d.color}">${d.symbol}</span>${d.name}<small>${d.en}</small></div><div class="detail-metrics"><span>${state.build===4?'传导':'伤害'} <b>${state.build===4?'85%':d.damage}</b></span><span>${state.build===4?'接力':'射程'} <b>${d.range}</b></span><span>${state.build===4?'价格':'间隔'} <b>${state.build===4?'30':d.rate+'s'}</b></span></div><small>${state.build===4?'需由雷链塔供电；每级雷链塔最多经过 3 / 4 / 5 根铁柱，每跳保留 85% 伤害，不增加攻击次数。':'点击空地部署，虚线圆环显示攻击范围。可以连续部署；按 Esc 退出。'}</small>`;}else el.innerHTML=intel;
}
function cellAt(e){const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left)/r.width*W/CELL),y:Math.floor((e.clientY-r.top)/r.height*H/CELL)};}
canvas.addEventListener('pointermove',e=>{hover=cellAt(e);});canvas.addEventListener('pointerleave',()=>hover=null);canvas.addEventListener('click',e=>{const p=cellAt(e);keyCell=p;interact(p.x,p.y);});
function interact(gx,gy){if(state.finished)return;const existing=state.towers.find(t=>t.gx===gx&&t.gy===gy);if(existing){state.selected=existing;state.build=null;renderSelection();sync();return;}
 if(state.build===null){state.selected=null;renderSelection();sync();return;}
 const type=state.build,d=types[type];if(!validCell(gx,gy)){toast('这里无法部署：请选择路径外的空地');return;}if(state.credits<d.cost){toast('晶体不足，消灭敌人可获取更多晶体');return;}
 state.credits-=d.cost;const t=makeTower(type,gx,gy);state.towers.push(t);burst(t.x,t.y,d.color,20);ring(t.x,t.y,d.color,45,.4);tone(480,.07);sync();}
function startWave(){if(state.running||state.finished)return;state.nextWaveIn=null;state.wave++;state.running=true;state.paused=false;state.spawnLeft=Math.round((9+state.wave*3)*rules().count);state.spawnTimer=.4;state.spawnIndex=0;toast(state.wave%5===0?`警报 / 第 ${state.wave} 波 · 精英信号接近`:`第 ${state.wave} 波 / 敌人正在跃迁`);sync();tone(180,.25,'sawtooth',.025);}
function spawn(){const wave=state.wave,i=state.spawnIndex++,boss=wave%5===0&&i===0;let kind=boss?'boss':i%9===6&&wave>=8?'shield':i%7===4&&wave>=3?'tank':i%4===2?'fast':'normal';const scale=(1+(wave-1)*.22+Math.pow(wave-1,2)*.018)*rules().hp;
 const hp=(kind==='boss'?640:kind==='tank'?155:kind==='shield'?105:kind==='fast'?46:72)*scale;const p=position(0);state.enemies.push({...p,d:0,hp,maxHp:hp,speed:(kind==='boss'?32:kind==='tank'?34:kind==='fast'?86:52)*(1+wave*.014)*rules().speed*Math.pow(pathLength/1600,.8),kind,slow:0,hit:0,size:kind==='boss'?22:kind==='tank'||kind==='shield'?14:kind==='fast'?9:11,color:kind==='boss'?'#f2cd83':kind==='tank'?'#b2a0ff':kind==='shield'?'#7ddcff':kind==='fast'?'#ffb291':'#ff796f',reward:Math.max(1,Math.round((kind==='boss'?60:kind==='tank'?10:kind==='shield'?9:kind==='fast'?5:6)*rules().income)),phase:rand(0,TAU)});}
function damage(e,amount,t){if(e.hp<=0)return;const armor=t?(e.kind==='tank'&&t.type===0?.65:e.kind==='shield'&&t.type===1?.55:e.kind==='boss'?.85:1):(e.kind==='boss'?.65:1);e.hp-=amount*armor;e.hit=.12;if(e.hp<=0){state.kills++;state.credits+=e.reward;if(t)t.kills++;burst(e.x,e.y,e.color,e.kind==='boss'?45:13);state.texts.push({x:e.x,y:e.y,text:`+${e.reward}`,life:.85,color:'#9df4ce'});if(e.kind==='boss'){state.shake=5;ring(e.x,e.y,e.color,130,.8);tone(85,.3,'triangle',.04);}sync();}}
function burst(x,y,color,n){if(reduced)n=Math.min(n,5);for(let i=0;i<n;i++){if(state.particles.length>700)break;const a=rand(0,TAU),v=rand(20,130);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.65),max:.65,color,size:rand(1,3)});}}
function ring(x,y,color,radius,life){state.effects.push({kind:'ring',x,y,color,radius,life,max:life});}
function arcRoutes(source){
 const routes=[{node:source,path:[source],hops:0}],seen=new Set([source]);
 const poles=state.towers.filter(t=>t.type===4),maxHops=source.level+2;
 for(let i=0;i<routes.length;i++){
  const route=routes[i];if(route.hops>=maxHops)continue;
  for(const pole of poles){
   if(seen.has(pole)||dist(route.node,pole)>stats(route.node).range)continue;
   seen.add(pole);routes.push({node:pole,path:[...route.path,pole],hops:route.hops+1});
  }
 }
 return routes;
}
function poweredRelays(){
 const powered=new Set();
 for(const tower of state.towers)if(tower.type===1)for(const route of arcRoutes(tower))if(route.hops)powered.add(route.node);
 return powered;
}
function arcTarget(t){
 const routes=arcRoutes(t);let result=null;
 for(const e of state.enemies){
  if(e.hp<=0)continue;
  for(const route of routes){
   if(dist(e,route.node)>stats(route.node).range)continue;
   if(!result||e.d>result.target.d||(e===result.target&&route.hops<result.route.hops))result={target:e,route};
  }
 }
 return result;
}
function fire(t,targets,route=null){const d=types[t.type],s=stats(t),target=targets[0];t.angle=Math.atan2(target.y-t.y,target.x-t.x);t.flash=.15;
 if(t.type===0){state.shots.push({x:t.x,y:t.y,target,damage:s.damage,t,speed:630,color:d.color});tone(640,.025,'triangle',.012);}
 else if(t.type===1){
  let current=target;
  const path=route?route.path:[t],chain=path.map(p=>({x:p.x,y:p.y})),visited=new Set();
  const retention=Math.pow(.85,route?.hops||0);
  for(const pole of path)pole.flash=.22;
  for(let i=0;i<3+t.level&&current;i++){
   chain.push({x:current.x,y:current.y});visited.add(current);
   damage(current,s.damage*retention*Math.pow(.8,i),t);
   const previous=current;
   current=state.enemies.filter(e=>e.hp>0&&!visited.has(e)&&dist(e,previous)<115).sort((a,b)=>dist(a,previous)-dist(b,previous))[0];
  }
  state.effects.push({kind:'arc',points:chain,color:d.color,life:.25,max:.25,seed:rand(0,100)});
  tone(210,.07,'sawtooth',.012);
 }
 else if(t.type===2){for(const e of targets){damage(e,s.damage,t);e.slow=Math.max(e.slow,2.1+t.level*.3);}ring(t.x,t.y,d.color,s.range,.65);tone(800,.08,'sine',.012);}
 else if(t.type===3){state.shots.push({x:t.x,y:t.y,target,impact:{x:target.x,y:target.y},damage:s.damage,t,speed:310,color:d.color,nova:true});tone(115,.09,'triangle',.035);}}
function overload(){if(state.abilityCD>0||!state.running||state.paused||state.finished)return;state.abilityCD=42;state.shake=reduced?0:8;for(const e of state.enemies){damage(e,90+state.wave*5,null);e.slow=e.kind==='boss'?2:3.5;}ring(480,300,'#9df4ce',650,1.2);ring(480,300,'#efffdb',520,.9);tone(75,.7,'sawtooth',.05);toast('核心过载 / 冲击波已释放');sync();}
function endGame(win){state.finished=true;state.running=false;state.nextWaveIn=null;state.build=null;state.selected=null;$('result-title').textContent=win?'防线屹立，星环无恙。':'核心失守，重整旗鼓。';$('result-text').textContent=`${maps[state.map].name} / ${rules().name} · 完成 ${win?20:Math.max(0,state.wave-1)} 波 · 消灭 ${state.kills} 个目标 · 最高纪录 ${Math.max(state.best,win?20:Math.max(0,state.wave-1))} 波`;$('overlay').hidden=false;sync();}
function update(dt){if(state.paused||state.finished)return;state.shake=Math.max(0,state.shake-dt*20);if(state.running)state.abilityCD=Math.max(0,state.abilityCD-dt);
 if(state.nextWaveIn!==null&&!state.running){state.nextWaveIn=Math.max(0,state.nextWaveIn-dt/state.speed);if(state.nextWaveIn===0)startWave();}
 if(state.running){state.spawnTimer-=dt;if(state.spawnLeft>0&&state.spawnTimer<=0){spawn();state.spawnLeft--;state.spawnTimer=Math.max(.23,.78-state.wave*.02)*rules().gap;}
 for(const e of state.enemies){if(e.hp<=0)continue;e.slow=Math.max(0,e.slow-dt);e.hit=Math.max(0,e.hit-dt);e.d+=e.speed*(e.slow>0?(e.kind==='boss'?.8:.6):1)*dt;Object.assign(e,position(e.d));if(e.d>=pathLength){e.hp=0;state.lives=Math.max(0,state.lives-(e.kind==='boss'?4:1));burst(e.x,e.y,'#ff796f',20);state.shake=reduced?0:5;sync();if(state.lives<=0){endGame(false);return;}}}
 }
 for(const t of state.towers){
  t.flash=Math.max(0,t.flash-dt);
  if(t.type===4)continue;
  t.cool-=dt;
  if(t.cool<=0){
   const s=stats(t);
   if(t.type===1){const attack=arcTarget(t);if(attack){fire(t,[attack.target],attack.route);t.cool=s.rate;}else t.cool=0;}
   else{
    const targets=state.enemies.filter(e=>e.hp>0&&dist(e,t)<=s.range).sort((a,b)=>b.d-a.d);
    if(targets.length){fire(t,targets);t.cool=s.rate;}else t.cool=0;
   }
  }
 }
 for(const s of state.shots){if(s.done)continue;let target=s.target;if(s.nova){if(target.hp>0)s.impact={x:target.x,y:target.y};target={...s.impact,size:5};}else if(target.hp<=0){s.done=true;burst(s.x,s.y,s.color,3);continue;}const distance=dist(s,target),step=s.speed*dt;if(distance<=step+target.size){s.done=true;if(s.nova){for(const e of state.enemies){if(e.hp>0&&dist(e,target)<70+s.t.level*8)damage(e,s.damage,s.t);}ring(target.x,target.y,s.color,70+s.t.level*8,.45);burst(target.x,target.y,s.color,28);}else{damage(target,s.damage,s.t);burst(target.x,target.y,s.color,4);}}else{s.x+=(target.x-s.x)/distance*step;s.y+=(target.y-s.y)/distance*step;}}
 state.shots=state.shots.filter(s=>!s.done);state.enemies=state.enemies.filter(e=>e.hp>0);
 if(state.running&&state.spawnLeft===0&&state.enemies.length===0){state.running=false;const reward=Math.round((35+state.wave*4)*rules().income);state.credits+=reward;state.best=Math.max(state.best,state.wave);try{localStorage.setItem(recordKey(),String(state.best));}catch{}toast(`第 ${state.wave} 波肃清 / 额外奖励 +${reward} 晶体`);sync();if(state.wave===MAX_WAVE)endGame(true);else if(state.auto)state.nextWaveIn=5;}
 for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*2);p.vy*=Math.exp(-dt*2);}state.particles=state.particles.filter(p=>p.life>0);
 for(const e of state.effects)e.life-=dt;state.effects=state.effects.filter(e=>e.life>0);
 for(const t of state.texts){t.life-=dt;t.y-=dt*24;}state.texts=state.texts.filter(t=>t.life>0);
}
function polygon(x,y,r,sides,rotation=0){ctx.beginPath();for(let i=0;i<sides;i++){const a=rotation+i*TAU/sides;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function line(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));}
function drawRange(x,y,r,color){ctx.save();ctx.fillStyle=color+'07';ctx.strokeStyle=color+'65';ctx.lineWidth=1;ctx.setLineDash([5,7]);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.stroke();ctx.restore();}
function drawTower(t,ghost=false){const d=types[t.type];ctx.save();ctx.translate(t.x,t.y);
 ctx.fillStyle='#14272a';ctx.strokeStyle=d.color+'38';ctx.lineWidth=1;polygon(0,0,23,6,Math.PI/6);ctx.fill();ctx.stroke();
 ctx.strokeStyle=d.color+'18';ctx.beginPath();ctx.arc(0,0,28,0,TAU);ctx.stroke();
 const spin=reduced?0:time*.3;ctx.strokeStyle=d.color+'44';ctx.beginPath();ctx.arc(0,0,25,spin,spin+1.4);ctx.stroke();
 ctx.shadowBlur=ghost?7:14+t.flash*70;ctx.shadowColor=d.color;ctx.fillStyle=d.color+'17';ctx.strokeStyle=d.color;ctx.lineWidth=1.8;
 if(t.type===0){polygon(0,0,15,3,t.angle);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(Math.cos(t.angle)*4,Math.sin(t.angle)*4);ctx.lineTo(Math.cos(t.angle)*21,Math.sin(t.angle)*21);ctx.stroke();}
 else if(t.type===1){polygon(0,0,14,4,spin*.6);ctx.fill();ctx.stroke();polygon(0,0,7,4,-spin);ctx.stroke();}
 else if(t.type===2){ctx.beginPath();ctx.arc(0,0,14,0,TAU);ctx.stroke();for(let i=0;i<6;i++){const a=i*TAU/6+spin;ctx.beginPath();ctx.moveTo(Math.cos(a)*8,Math.sin(a)*8);ctx.lineTo(Math.cos(a)*18,Math.sin(a)*18);ctx.stroke();}}
 else if(t.type===4){ctx.fillStyle='#30434c';ctx.fillRect(-4,-16,8,32);ctx.strokeRect(-4,-16,8,32);for(const y of [-8,8]){ctx.beginPath();ctx.moveTo(-11,y);ctx.lineTo(11,y);ctx.stroke();}ctx.beginPath();ctx.arc(0,-18,4,0,TAU);ctx.stroke();}
 else{polygon(0,0,15,6,spin*.2);ctx.fill();ctx.stroke();polygon(0,0,8,3,-t.angle);ctx.stroke();}
 ctx.fillStyle='#effff6';ctx.beginPath();ctx.arc(0,0,2.6+t.flash*8,0,TAU);ctx.fill();ctx.shadowBlur=0;
 for(let i=0;i<t.level;i++){ctx.fillStyle=d.color;ctx.fillRect(-((t.level-1)*6)/2+i*6-1.5,30,3,3);}ctx.restore();}
function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b151a';ctx.fillRect(0,0,W,H);ctx.save();if(state.shake&&!reduced)ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));
 const bg=ctx.createRadialGradient(500,300,50,500,300,540);bg.addColorStop(0,'#16332b38');bg.addColorStop(1,'#0a101900');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#253e4138';ctx.lineWidth=.7;ctx.beginPath();for(let x=20;x<W;x+=40){ctx.moveTo(x,40);ctx.lineTo(x,H-40);}for(let y=20;y<H;y+=40){ctx.moveTo(20,y);ctx.lineTo(W-20,y);}ctx.stroke();
 ctx.fillStyle='#4e777057';for(let x=20;x<W;x+=80)for(let y=20;y<H;y+=80)ctx.fillRect(x-1,y-1,2,2);
 for(const star of stars){ctx.globalAlpha=.2+(reduced?.2:(Math.sin(time*.65+star.phase)+1)*.2);ctx.fillStyle='#91d2c3';ctx.fillRect(star.x,star.y,star.r,star.r);}ctx.globalAlpha=1;
 // The route is drawn in three layers: shoulder, conductor, and moving energy.
 ctx.lineJoin='round';ctx.lineCap='round';line(points);ctx.strokeStyle='#172b2f';ctx.lineWidth=43;ctx.stroke();line(points);ctx.strokeStyle=maps[state.map].color+'55';ctx.lineWidth=44;ctx.stroke();line(points);ctx.strokeStyle='#152b2c';ctx.lineWidth=41;ctx.stroke();
 line(points);ctx.strokeStyle='#8bd8b52b';ctx.lineWidth=2;ctx.setLineDash([3,10]);ctx.lineDashOffset=reduced?0:-time*14;ctx.stroke();ctx.setLineDash([]);
 if(!reduced)for(let d=(time*25)%110;d<pathLength;d+=110){const p=position(d);ctx.fillStyle='#9df4ce55';ctx.shadowColor='#9df4ce';ctx.shadowBlur=7;ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}ctx.shadowBlur=0;
 for(const p of points.slice(1,-1)){ctx.strokeStyle='#6a9b8325';ctx.lineWidth=1;polygon(p.x,p.y,14,4,Math.PI/4);ctx.stroke();}
 // Spawn gate and energy core.
 const entry=points[0],core=points.at(-1);ctx.save();ctx.translate(entry.x,entry.y);ctx.strokeStyle='#ff826f';ctx.shadowColor='#ff826f';ctx.shadowBlur=15;ctx.lineWidth=2;polygon(0,0,24,4,Math.PI/4);ctx.stroke();polygon(0,0,13,4,Math.PI/4);ctx.stroke();ctx.restore();
 ctx.save();ctx.translate(core.x,core.y);const spin=reduced?0:time*.4;ctx.strokeStyle='#9df4ce44';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,35,0,TAU);ctx.stroke();ctx.shadowColor='#9df4ce';ctx.shadowBlur=20;ctx.strokeStyle='#9df4ce';ctx.lineWidth=2;polygon(0,0,24,6,spin);ctx.stroke();ctx.fillStyle='#9df4ce17';polygon(0,0,16,6,-spin);ctx.fill();ctx.stroke();ctx.fillStyle='#c4ffe5';polygon(0,0,6,4,Math.PI/4);ctx.fill();ctx.restore();
 ctx.font='8px ui-monospace, monospace';ctx.textAlign='left';ctx.fillStyle='#af766b';ctx.fillText('INBOUND',11,entry.y+47);ctx.textAlign='right';ctx.fillStyle='#88b09b';ctx.fillText('THE CORE',W-10,core.y+54);
 // Sector markings make the board read as a tactical map.
 ctx.font='9px ui-monospace, monospace';ctx.fillStyle='#52736b70';ctx.textAlign='left';ctx.fillText('A / 01',55,83);ctx.fillText('B / 02',485,83);ctx.fillText('C / 03',55,535);ctx.fillText('D / 04',800,535);
 if(document.activeElement===canvas&&hover&&state.build===null){ctx.strokeStyle='#9df4ce99';ctx.lineWidth=1;ctx.strokeRect(hover.x*40+2,hover.y*40+2,36,36);}
 if(state.selected){const t=state.selected;drawRange(t.x,t.y,stats(t).range,types[t.type].color);ctx.strokeStyle=types[t.type].color;ctx.lineWidth=1;polygon(t.x,t.y,34,6,Math.PI/6);ctx.stroke();}
 if(hover&&state.build!==null){const x=hover.x*40+20,y=hover.y*40+20,valid=validCell(hover.x,hover.y),d=types[state.build];drawRange(x,y,d.range,valid?d.color:'#ff826f');ctx.fillStyle=valid?d.color+'17':'#ff826f22';ctx.fillRect(x-19,y-19,38,38);ctx.globalAlpha=.55;drawTower({...makeTower(state.build,hover.x,hover.y),flash:0},true);ctx.globalAlpha=1;}
 // Connected relay links are visible even before enemies arrive.
 const linked=new Set();ctx.save();ctx.setLineDash([3,6]);ctx.lineWidth=1;
 for(const source of state.towers){if(source.type!==1)continue;
  for(const route of arcRoutes(source)){
   if(!route.hops)continue;
   const a=route.path.at(-2),b=route.node,key=[state.towers.indexOf(a),state.towers.indexOf(b)].sort((x,y)=>x-y).join(':');
   if(linked.has(key))continue;linked.add(key);
   ctx.strokeStyle=(state.selected===source||state.selected===a||state.selected===b)?'#b2a0ffaa':'#b2a0ff38';
   line([a,b]);ctx.stroke();
  }
 }ctx.restore();
 for(const t of state.towers)drawTower(t);
 for(const e of state.enemies){ctx.save();ctx.translate(e.x,e.y);const rotation=reduced?e.phase:time*(e.kind==='fast'?2:.6)+e.phase;ctx.strokeStyle=e.slow>0?'#7ddcff':e.color;ctx.fillStyle=e.hit>0?'#fff6':e.color+'20';ctx.shadowColor=e.color;ctx.shadowBlur=e.kind==='boss'?20:9;ctx.lineWidth=e.kind==='boss'?2.5:1.7;polygon(0,0,e.size,e.kind==='fast'?3:e.kind==='tank'?6:e.kind==='boss'?8:4,rotation);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
 if(e.kind==='boss'){polygon(0,0,e.size*.65,4,-rotation);ctx.stroke();}if(e.kind==='shield'){ctx.strokeStyle='#7ddcff';ctx.beginPath();ctx.arc(0,0,e.size+4,-Math.PI*.8,Math.PI*.8);ctx.stroke();}ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,2,0,TAU);ctx.fill();if(e.slow>0){ctx.strokeStyle='#7ddcff66';ctx.beginPath();ctx.arc(0,0,e.size+5,0,TAU);ctx.stroke();}
 ctx.fillStyle='#0a1018';ctx.fillRect(-e.size,-e.size-10,e.size*2,3);ctx.fillStyle=e.color;ctx.fillRect(-e.size,-e.size-10,e.size*2*Math.max(0,e.hp/e.maxHp),3);ctx.restore();}
 for(const s of state.shots){ctx.save();ctx.shadowBlur=15;ctx.shadowColor=s.color;ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(s.x,s.y,s.nova?5:2.5,0,TAU);ctx.fill();if(s.nova){ctx.strokeStyle=s.color+'77';ctx.beginPath();ctx.arc(s.x,s.y,8,0,TAU);ctx.stroke();}ctx.restore();}
 for(const e of state.effects){const p=1-e.life/e.max;ctx.save();ctx.globalAlpha=(1-p)*.8;ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=12;ctx.lineWidth=e.kind==='arc'?2:2*(1-p)+.5;if(e.kind==='ring'){ctx.beginPath();ctx.arc(e.x,e.y,e.radius*p,0,TAU);ctx.stroke();ctx.fillStyle=e.color+'08';ctx.fill();}else{ctx.beginPath();ctx.moveTo(e.points[0].x,e.points[0].y);for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];for(let j=1;j<=6;j++){const f=j/6,jitter=j===6?0:Math.sin(e.seed+i*13+j*7)*10;ctx.lineTo(a.x+(b.x-a.x)*f+jitter,a.y+(b.y-a.y)*f-jitter);}}ctx.stroke();}ctx.restore();}
 for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.globalAlpha=1;
 for(const t of state.texts){ctx.globalAlpha=Math.min(1,t.life*2);ctx.fillStyle=t.color;ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y-18);}ctx.globalAlpha=1;
 if(state.paused&&!state.finished){ctx.fillStyle='#091316a8';ctx.fillRect(0,0,W,H);ctx.fillStyle='#bcd5cc';ctx.font='24px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('Ⅱ  SIMULATION PAUSED',W/2,H/2);ctx.font='12px sans-serif';ctx.fillStyle='#79998d';ctx.fillText('按空格或点击继续',W/2,H/2+30);}
 ctx.restore();}
function resize(){const dpr=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),scale=r.width/W*dpr;canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);}
new ResizeObserver(resize).observe(canvas);
let hudTimer=0;
function frame(stamp){const raw=Math.min(.05,(stamp-last)/1000||0);last=stamp;if(!state.paused)time+=raw;const dt=raw*state.speed; // Substeps keep fast projectiles and slow effects stable at 3×.
 const n=Math.max(1,Math.ceil(dt/.025));for(let i=0;i<n;i++)update(dt/n);hudTimer+=raw;if(hudTimer>.2){hudTimer=0;sync();}draw();requestAnimationFrame(frame);}
function tone(freq,duration,type='sine',volume=.035){if(!soundOn)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.5),audioContext.currentTime+duration);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').innerHTML=`♪<span>音效${soundOn?'开':'关'}</span>`;$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');tone(600,.12);};
$('start').onclick=startWave;$('ability').onclick=overload;
$('pause').onclick=()=>{if(state.finished)return;state.paused=!state.paused;sync();};$('speed').onclick=()=>{state.speed=state.speed===1?2:state.speed===2?3:1;sync();};
$('auto-wave').onchange=()=>{state.auto=$('auto-wave').checked;state.nextWaveIn=state.auto&&state.wave>0&&!state.running&&!state.finished?5:null;sync();};
$('map-select').onchange=$('difficulty').onchange=()=>{if(state.wave>0&&!state.finished)return;fresh();};
$('restart').onclick=()=>{fresh();toast('防线已重置，重新出发');};$('reset').onclick=()=>{if(state.wave>0&&!state.finished){const wasPaused=state.paused;state.paused=true;sync();if(!confirm('重新开始会清除本局进度，确定重新部署？')){state.paused=wasPaused;sync();return;}}fresh();};
let pausedBeforeHelp=false;
$('help').onclick=()=>{pausedBeforeHelp=state.paused;state.paused=true;sync();$('guide').showModal();};
$('close-help').onclick=$('guide-ok').onclick=()=>$('guide').close();$('guide').addEventListener('close',()=>{state.paused=pausedBeforeHelp;sync();});
window.addEventListener('keydown',e=>{if($('guide').open||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select'))return;if(e.target.closest('button,a')&&(e.code==='Space'||e.key==='Enter'))return;if(['1','2','3','4','5'].includes(e.key)){e.preventDefault();choose(+e.key-1);}else if(e.key==='Escape'){state.build=null;state.selected=null;renderSelection();sync();}else if(e.code==='Space'){e.preventDefault();$('pause').click();}else if(e.key.toLowerCase()==='q'){overload();}else if(e.key.startsWith('Arrow')){e.preventDefault();canvas.focus();keyCell.x=Math.max(0,Math.min(23,keyCell.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));keyCell.y=Math.max(0,Math.min(14,keyCell.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)));hover={...keyCell};}else if(e.key==='Enter'&&e.target===canvas){e.preventDefault();interact(keyCell.x,keyCell.y);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!state.finished){state.paused=true;sync();}});
$('map-select').innerHTML=maps.map((m,i)=>`<option value="${i}">0${i+1} / ${m.name}</option>`).join('');
$('difficulty').innerHTML=Object.entries(difficulties).map(([id,d])=>`<option value="${id}" ${id==='standard'?'selected':''}>${d.name}</option>`).join('');
fresh();resize();requestAnimationFrame(frame);
})();
