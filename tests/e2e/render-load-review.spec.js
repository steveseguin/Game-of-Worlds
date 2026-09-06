const {test,expect}=require('@playwright/test');
const h=require('./support/ui-game-harness');
test.skip(!process.env.RENDER_REVIEW,'Opt-in rendering measurements; synthetic load is separate from gameplay.');
test('measure ordinary and busy galaxy rendering',async({page},info)=>{
 test.setTimeout(240000);
 if(process.env.RENDER_BASELINE) {
  for(const file of ['galaxy3d.js','battle3d.js']) {
   const body=require('node:child_process').execFileSync('git',['show',`b2a9890:public/js/${file}`],{encoding:'utf8',maxBuffer:4*1024*1024});
   await page.route(`**/js/${file}*`,route=>route.fulfill({status:200,contentType:'application/javascript',body}));
  }
 }
 await page.addInitScript(()=>{
  window.renderReview={longTasks:[],firstFrame:null,boardReady:null};
  new PerformanceObserver(list=>window.renderReview.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  document.addEventListener('galaxy3d-first-frame',()=>window.renderReview.firstFrame=performance.now());
  document.addEventListener('galaxy3d-board-ready',()=>window.renderReview.boardReady=performance.now());
 });
 const username=h.uniqueId('render');await h.registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await h.createGame(page,h.uniqueId('render'),{maxPlayers:'2',mode:'quick'});await h.startGame(page,[page]);
 await page.locator('#tour-skip').waitFor({state:'visible',timeout:15000});await h.dismissFirstRunGuidance(page);await h.focusHomeworld(page);
 await expect.poll(()=>page.evaluate(()=>window.Galaxy3D.isBoardReady()),{timeout:45000}).toBeTruthy();
 async function sample(label){
  const data=await page.evaluate(async()=>{
   const before=window.Galaxy3D.debugRenderPath();const frames=[];const start=performance.now();let last=start;
   await new Promise(resolve=>{function frame(t){frames.push(t-last);last=t;if(t-start<6000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
   frames.sort((a,b)=>a-b);return {p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],samples:frames.length,before,after:window.Galaxy3D.debugRenderPath(),boot:window.renderReview};
  });await info.attach(label,{body:JSON.stringify(data,null,2),contentType:'application/json'});console.log('RENDER',label,JSON.stringify(data));
 }
 await sample('ordinary');
 await page.evaluate(()=>{for(let id=1;id<=112;id++)window.Galaxy3D.updateSector(id,window.Galaxy3D.STATUS.NEUTRAL,{type:id%5===0?1:6+id%4,live:true,seen:true});window.Galaxy3D.frameSectors(Array.from({length:112},(_,i)=>i+1));});
 await expect.poll(()=>page.evaluate(()=>window.Galaxy3D.debugRenderPath().queued),{timeout:90000,intervals:[1000]}).toBe(0);
 await page.waitForTimeout(2500);await sample('busy');
 await page.screenshot({path:info.outputPath('busy-galaxy.png')});
 await page.evaluate(()=>{window.reviewFleetTimer=setInterval(()=>{for(let i=1;i<9;i++)window.Galaxy3D.animateFleetMove(i,i+1,{count:8,raceId:i%12+1,mine:true});},1400);});
 await sample('fleets');
 await page.evaluate(()=>clearInterval(window.reviewFleetTimer));
 await page.evaluate(async()=>{await import('/js/battle3d.js?v=20260906');const fields=new Array(40).fill(0);fields[0]=24;fields[9]=20;window.Battle3D.createBattleVisualization('battle:'+fields.join(':'),{attackerRaceId:4,defenderRaceId:7,viewerRole:'attacker',sectorId:1,planetType:8,durationMs:30000});});
 await expect(page.locator('#battleTheater.on canvas')).toBeVisible({timeout:15000});await page.waitForTimeout(2000);await sample('battle');
 await page.evaluate(()=>window.Battle3D.cleanupBattleVisualization());
});
