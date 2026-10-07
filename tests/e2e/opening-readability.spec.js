const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const h=require('./support/ui-game-harness');
test('opening decisions, resource shortages and completed orders are readable',async({page},info)=>{
 test.setTimeout(120000);
 const username=h.uniqueId('opening');await h.registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await h.createGame(page,h.uniqueId('opening'),{maxPlayers:'2',mode:'quick'});await h.startGame(page,[page]);
 await page.locator('#tour-skip').waitFor({state:'visible',timeout:15000});await h.dismissFirstRunGuidance(page);await h.focusHomeworld(page);
 await expect(page.locator('#sectorDecision')).toContainText('slots free');await expect(page.locator('#sectorDecision')).toContainText('Metal');
 await page.click('#buildtab');await expect(page.locator('[data-building-id="0"]')).toBeEnabled();await page.locator('[data-building-id="0"]').click();
 await expect(page.locator('#notification-container')).toContainText(/Order completed|orders completed/);
 await page.click('#fleettab');const frigate=page.locator('.ship-button[data-ship-id="1"]');
 for(let i=0;i<4&&await frigate.isEnabled();i++){await frigate.click();await page.waitForTimeout(250);}
 await expect(frigate).toBeDisabled();await expect(frigate.locator('.req-note')).toContainText(/Need \d[\d,]* more metal/);
 await expect(frigate).toHaveAttribute('aria-describedby',await frigate.locator('.req-note').getAttribute('id'));
 expect(await frigate.locator('small').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
 expect(await frigate.locator('.req-note').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
 await page.locator('#sectordisplay').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:info.outputPath('opening-decisions.png')});
 expect((await new AxeBuilder({page}).include('#sectordisplay').include('#controlPadGUI').analyze()).violations).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('opening-mobile.png')});
 expect((await new AxeBuilder({page}).include('#sectordisplay').include('#controlPadGUI').analyze()).violations).toEqual([]);
 for(const [width,height] of [[1366,768],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const clipped=await page.locator('.tab-button,#controlPadToggle,#minimapToggle').evaluateAll(buttons=>buttons.filter(button=>{
   const style=getComputedStyle(button),range=document.createRange();range.selectNodeContents(button);
   return range.getBoundingClientRect().width>button.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)+0.5;
  }).map(button=>button.textContent.trim()));
  expect(clipped,`clipped labels at ${width}x${height}`).toEqual([]);
  const chat=await page.locator('#chat').boundingBox();expect(chat.width).toBeGreaterThan(100);
 }
});
