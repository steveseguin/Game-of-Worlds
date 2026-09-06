const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser,createGame}=require('./support/ui-game-harness');
async function check(page){
 for(const button of await page.locator('button:visible').all()){
  const styles=await button.evaluate(el=>[el,...el.querySelectorAll('span,b,strong,em,i,small,p,div,h3,h4,label')].filter(n=>n.textContent.trim()&&n.getClientRects().length).map(n=>({weight:getComputedStyle(n).fontWeight,family:getComputedStyle(n).fontFamily})));
  for(const style of styles){expect(Number(style.weight)).toBe(900);expect(style.family).toContain('Arial Black');}
 }
 const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
}
test('lobby actions and nested faction captions keep heavy lettering',async({page},info)=>{
 const u=uniqueId('heavy');await registerUser(page,{username:u,email:u+'@example.com',password:'Secure123!'});
 await check(page);await page.screenshot({path:info.outputPath('lobby-heavy.png'),fullPage:true});
 await createGame(page,uniqueId('heavy'),{maxPlayers:'2',mode:'test'});
 await check(page);await page.screenshot({path:info.outputPath('waiting-heavy.png')});
 await page.getByRole('button',{name:'Choose / Change'}).click();await expect(page.locator('#confirmRaceBtn')).toBeVisible();
 await check(page);await page.screenshot({path:info.outputPath('faction-heavy.png')});
 await page.setViewportSize({width:390,height:844});await check(page);
 await expect(page.locator('#confirmRaceBtn')).toBeInViewport({ratio:1});
 await page.screenshot({path:info.outputPath('faction-heavy-mobile.png')});
 await page.locator('#confirmRaceBtn').click();
 await expect(page.locator('.toast-success').filter({hasText:'Race updated'})).toBeVisible();
 await expect(page.locator('.toast-success').filter({hasText:'Race updated'})).toBeHidden({timeout:10000});
 await check(page);
 await page.screenshot({path:info.outputPath('waiting-heavy-mobile.png'),fullPage:true});
});
