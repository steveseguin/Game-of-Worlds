const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser,createGame}=require('./support/ui-game-harness');
async function audit(page){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}
test('entry artwork loads without a renderer and lobby works across screen sizes',async({page},info)=>{
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 await expect.poll(()=>page.locator('.hero__art').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
 expect(requests.filter(url=>/three|planet.*worker|landing.*worker/i.test(url))).toEqual([]);
 await audit(page);await page.screenshot({path:info.outputPath('landing-desktop.png')});
 await page.setViewportSize({width:390,height:844});await audit(page);
 await page.screenshot({path:info.outputPath('landing-mobile.png'),fullPage:true});
 await page.getByRole('link',{name:'PLAY FREE IN YOUR BROWSER'}).click();await expect(page).toHaveURL(/login/);
 const u=uniqueId('design');await registerUser(page,{username:u,email:u+'@example.com',password:'Secure123!'});
 await audit(page);await page.screenshot({path:info.outputPath('lobby-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await audit(page);
 await page.screenshot({path:info.outputPath('lobby-desktop.png')});
 await page.locator('#gameName').focus();await page.keyboard.press('Tab');await expect(page.locator('#maxPlayers')).toBeFocused();
 await createGame(page,uniqueId('polished'),{maxPlayers:'2',mode:'test'});
 await audit(page);await page.screenshot({path:info.outputPath('waiting-desktop.png')});
 await page.setViewportSize({width:390,height:844});await audit(page);await page.screenshot({path:info.outputPath('waiting-mobile.png'),fullPage:true});
 expect(errors).toEqual([]);
});
