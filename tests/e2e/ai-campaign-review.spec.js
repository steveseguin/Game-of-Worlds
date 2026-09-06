const {test,expect}=require('@playwright/test');
const fs=require('fs');
const h=require('./support/ui-game-harness');
test.skip(!process.env.PLAY_REVIEW,'Opt-in exploratory campaigns; uses ordinary player resources and UI orders.');
for(const [difficulty,strategy] of [['medium','balanced'],['aggressive','aggressive']]) {
 test(`ordinary campaign against ${difficulty} ${strategy} AI`,async({page},info)=>{
  test.setTimeout(600000);page.setDefaultTimeout(6000);
  const username=h.uniqueId('campaign');await h.registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
  await h.createGame(page,h.uniqueId('campaign'),{maxPlayers:'2',mode:'quick'});
  await page.selectOption('#aiDifficulty',difficulty);await page.selectOption('#aiStrategy',strategy);
  await page.getByRole('button',{name:'Add AI Opponent',exact:true}).click();await page.waitForTimeout(700);
  await h.startGame(page,[page]);
  await page.locator('#tour-skip').waitFor({state:'visible',timeout:15000});await h.dismissFirstRunGuidance(page);
  const home=await h.focusHomeworld(page);const log=[];const visited=new Set([home]);const colonies=new Set();let targetIndex=0;
  async function snapshot(){return page.evaluate(()=>({empire:window.GAME_STATE.empire,resources:window.GAME_STATE.player.resources,known:window.GAME_STATE.mapSectors,home:window.GAME_STATE.selectedSectorData,turn:typeof currentTurnNumber!=='undefined'?currentTurnNumber:null}));}
  async function move(id,ship){
   await h.selectSector(page,id);
   if(await page.locator('#probeSuggestionMove').isVisible()) await page.locator('#probeSuggestionMove').click();
   else await page.locator('#sectorMoveShips').click();
   await expect(page.locator('#multiMove')).toBeVisible();
   const option=page.locator('#shipsFromNearBy option').filter({hasText:new RegExp(ship,'i')}).first();
   if(!await option.count()){await page.locator('#closeMultiMove').click();return false;}
   await page.selectOption('#shipsFromNearBy',await option.getAttribute('value'));await page.click('#moveSelectedShips');
   await expect(page.locator('.confirm-modal-overlay')).toBeVisible();await page.locator('.confirm-modal .btn-confirm').click();
   await expect(page.locator('#multiMove')).toBeHidden();await page.waitForTimeout(180);return true;
  }
  for(let turn=0;turn<90;turn++) {
   if(await h.isGameOverVisible(page)) break;
   if(await page.locator('#battleTheater.on').isVisible()){await h.closeBattleOverlay(page);}
   // Make orders in batches while saving for expansion; then observe the endgame.
   if(turn>=24 || turn%3!==0){await h.endTurnAll([page]);continue;}
   await h.focusHomeworld(page);await page.click('#buildtab');
   for(const type of [2,0,1]) {const b=page.locator(`[data-building-id="${type}"]`);if(await b.isEnabled()){await b.click();await page.waitForTimeout(80);}}
   await page.click('#techtab');
   const available=page.locator('.tech-card:not([disabled])');const terraform=available.filter({hasText:'Terraforming'}).first();
   if(await terraform.count()) await terraform.click();else if(await page.evaluate(()=>Number(window.GAME_STATE.player.techLevels[7]||0)>=2)&&await available.count()) await available.first().click();
   await page.click('#fleettab');
   for(const ship of [6,1]) {const b=page.locator(`.ship-button[data-ship-id="${ship}"]`);if(await b.isEnabled()){await b.click();await page.waitForTimeout(80);}}
   const state=await snapshot();
   const targets=Object.values(state.known).filter(s=>s.status==='neutral'&&Number(s.type)>=6&&Number(s.type)<=9);
   // Retry a visited world after researching its requirement, rather than forgetting it.
   for(const id of [...colonies].slice(0,3)) {
    await h.selectSector(page,id);if(await page.locator('#probeSuggestionDismiss').isVisible()) await page.locator('#probeSuggestionDismiss').click();await page.click('#colonizetab');
    if(await page.locator('#colonizeBtn').isEnabled()){await h.colonizeSelectedSector(page);colonies.delete(id);await page.click('#buildtab');for(const type of [0,1,2]){const b=page.locator(`[data-building-id="${type}"]`);if(await b.isEnabled()) await b.click();}}
   }
   if(targets.length&&turn%2===0){const target=targets[targetIndex++%targets.length];if(await move(Number(target.id),'Colony Ship'))colonies.add(Number(target.id));}
   if(turn%3===0){
    const next=Object.values((await snapshot()).known).find(s=>!visited.has(Number(s.id))&&s.status==='neutral'&&![1,2,3,4].includes(Number(s.type)));
    if(next&&await move(Number(next.id),'Scout'))visited.add(Number(next.id));
   }
   if(turn%3===0){const now=await snapshot();log.push(now);fs.writeFileSync(info.outputPath('campaign.json'),JSON.stringify(log,null,2));console.log('CAMPAIGN',difficulty,strategy,'turn',turn,JSON.stringify(now.empire));}
   await h.endTurnAll([page]);
  }
  log.push({result:await page.locator('#gameOverModal').textContent().catch(()=>''),summary:await h.readEmpireSummary(page)});
  fs.writeFileSync(info.outputPath('campaign.json'),JSON.stringify(log,null,2));await page.screenshot({path:info.outputPath('campaign-end.png')});
  expect(await h.isGameOverVisible(page)).toBeTruthy();
 });
}
