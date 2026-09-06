const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser}=require('./support/ui-game-harness');
test('faction values and confirmation are readable',async({page},info)=>{
 const name=uniqueId('racepolish');await registerUser(page,{username:name,email:name+'@example.com',password:'Secure123!'});
 await page.locator('#gameName').fill('Readable factions');await page.locator('#createGameBtn').click();
 await expect(page.locator('.race-card')).toHaveCount(12);await expect(page.locator('.doctrine-row')).toHaveCount(7);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await expect(page.locator('#confirmRaceBtn')).toBeInViewport({ratio:1});
  await page.screenshot({path:info.outputPath('factions-'+width+'.png')});
  const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 }
 await page.locator('.race-card').filter({hasText:'Silicon Collective'}).click();
 await expect(page.locator('.doctrine-row').filter({hasText:'Research Speed'})).toContainText('1.30');
 await expect(page.locator('.doctrine-row').filter({hasText:'Research Speed'})).toContainText('Advantage');
 await expect(page.locator('#confirmRaceBtn')).toContainText('Terran Empire');
 await page.locator('#confirmRaceBtn').focus();await page.keyboard.press('Enter');await expect(page.locator('.waiting-view')).toBeVisible();
});
