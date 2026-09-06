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
 expect(await frigate.locator('.req-note').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
 await page.locator('#sectordisplay').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:info.outputPath('opening-decisions.png')});
 expect((await new AxeBuilder({page}).include('#sectordisplay').include('#controlPadGUI').analyze()).violations).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('opening-mobile.png')});
 expect((await new AxeBuilder({page}).include('#sectordisplay').include('#controlPadGUI').analyze()).violations).toEqual([]);
});
