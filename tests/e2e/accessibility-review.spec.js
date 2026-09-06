const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser,createGame,startGame,dismissFirstRunGuidance}=require('./support/ui-game-harness');
async function audit(page){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
}
test('login remains usable while the font provider is stalled',async({page})=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 await page.route('https://fonts.googleapis.com/**',async route=>{await blocked;await route.abort();});
 try {
  await page.goto('/login.html',{waitUntil:'domcontentloaded',timeout:8000});
  await expect(page.locator('#loginUsername')).toBeVisible();
  await page.locator('#loginUsername').fill('KeyboardCommander');
 } finally {release();}
});
test('readable game panels, keyboard navigation and contrast',async({page},testInfo)=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const path of ['/','/login.html']){await page.goto(path);await audit(page);}
 const username=uniqueId('a11y');await registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await audit(page);
 await createGame(page,uniqueId('readable'),{maxPlayers:'2',mode:'test'});await startGame(page,[page]);
 await page.locator('#tour-skip').waitFor({state:'visible',timeout:15000});await dismissFirstRunGuidance(page);
 await page.locator('#buildtab').focus();
 await page.keyboard.press('ArrowRight');await expect(page.locator('#fleettab')).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(page.locator('#techtab')).toBeFocused();
 await page.keyboard.press('Tab');await expect(page.locator('#techtree')).toBeFocused();
 await page.keyboard.press('PageDown');
 await expect.poll(()=>page.locator('#techtree').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.keyboard.press('Home');
 for(const tab of ['#fleettab','#buildtab','#techtab','#colonizetab']){
  await page.locator(tab).click();await audit(page);
 }
 // Cover the urgent timer state deliberately, rather than depending on audit timing.
 await page.evaluate(()=>{turnTimer=10;renderTurnTimer();});
 await audit(page);
 await page.locator('#techtab').click();
 await page.locator('#techtree').evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:testInfo.outputPath('main-readable.png')});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(600); // Allow the measured HUD layout to settle before capture.
 await expect(page.locator('#nextTurnBtn')).toBeInViewport({ratio:1});
 const fits=await page.locator('#nextTurnBtn').evaluate(el=>{
  const button=el.getBoundingClientRect(),frame=document.getElementById('turnTimeBar').getBoundingClientRect();
  return button.top>=frame.top && button.bottom<=frame.bottom && button.left>=frame.left && button.right<=frame.right;
 });
 expect(fits).toBe(true);
 await page.screenshot({path:testInfo.outputPath('main-mobile.png')});
 await audit(page);
 expect(errors).toEqual([]);
});
