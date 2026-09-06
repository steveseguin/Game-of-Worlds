const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
test('public pages share branding and readable buttons',async({page},info)=>{
 for(const path of ['/','/login.html','/docs/','/lore/','/purchase-race.html']){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href',/game-of-worlds-mark\.svg/);
  await expect(page.locator('.official-brand .official-mark').first()).toBeVisible();
  const buttons=page.locator('button:visible, .btn:visible, .button:visible, .play:visible');
  for(const button of await buttons.all()) expect(Number(await button.evaluate(el=>getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:info.outputPath(path.replace(/[^a-z]/gi,'')+'-'+width+'.png')});
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),path+' '+width).toEqual([]);
  }
 }
});
