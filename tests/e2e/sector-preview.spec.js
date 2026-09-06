const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser,createGame,startGame,dismissFirstRunGuidance,focusHomeworld}=require('./support/ui-game-harness');
test('destination preview, persistent planet names and inspection of every terrain',async({page},info)=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const username=uniqueId('chart');await registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await createGame(page,uniqueId('chart'),{maxPlayers:'2',mode:'test'});await startGame(page,[page]);
 await page.locator('#tour-skip').waitFor({state:'visible',timeout:15000});await dismissFirstRunGuidance(page);await focusHomeworld(page);
 await expect(page.locator('#renamePlanetBtn')).toBeVisible();
 await expect(page.locator('#sectorPreviewName')).not.toHaveText(/^Sector /);
 await expect(page.locator('#sectorPreviewImage')).toHaveAttribute('src',/^data:image\/png/,{timeout:45000});
 await page.locator('#renamePlanetBtn').click();
 await expect(page.locator('#planetNameInput')).toBeFocused();
 await page.locator('#planetNameInput').fill('New Éden');
 expect((await new AxeBuilder({page}).include('#planetNameDialog').analyze()).violations).toEqual([]);
 await page.locator('#planetNameInput').press('Enter');
 await expect(page.locator('#planetNameDialog')).not.toBeVisible();
 await expect(page.locator('#sectorPreviewName')).toHaveText('New Éden');
 await expect(page.locator('#sectorMoveShips')).toHaveAccessibleName(/New Éden/);
 await page.reload();await dismissFirstRunGuidance(page);await focusHomeworld(page);
 await expect(page.locator('#sectorPreviewName')).toHaveText('New Éden');
 await expect(page.locator('#sectorPreviewImage')).toHaveAttribute('src',/^data:image\/png/,{timeout:45000});
 for (const width of [1280,390]) {
  await page.setViewportSize({width,height:844});
  await page.waitForTimeout(700);
  await page.locator('#sectorPreviewImage').evaluate(img=>img.decode());
  const src=await page.locator('#sectorPreviewImage').getAttribute('src');
  if(src.startsWith('data:')) require('fs').writeFileSync(info.outputPath(`raw-preview-${width}.png`),Buffer.from(src.split(',')[1],'base64'));
  await info.attach(`preview-${width}`,{body:await page.locator('#sectorPreviewImage').evaluate(img=>JSON.stringify({src:img.src.slice(0,80),width:img.naturalWidth,rect:img.getBoundingClientRect()})),contentType:'application/json'});
  await expect.poll(()=>page.evaluate(()=>Math.abs(document.getElementById('inspectPlanetBtn').getBoundingClientRect().y-document.getElementById('sectorMoveShips').getBoundingClientRect().y))).toBeLessThan(2);
  await expect(page.locator('#inspectPlanetBtn')).toBeInViewport({ratio:1});
  await expect(page.locator('#sectorMoveShips')).toBeInViewport({ratio:1});
  await page.screenshot({path:info.outputPath(`destination-${width}.png`)});
 }
 expect((await new AxeBuilder({page}).include('#sectorPreview').analyze()).violations).toEqual([]);
 await page.locator('#inspectPlanetBtn').click();await expect(page.locator('#inspectionTitle')).toHaveText('New Éden');
 await page.keyboard.press('Escape');await expect(page.locator('#inspectPlanetBtn')).toBeFocused();
 // Isolated rendering fixture: exercise each terrain without modifying server gameplay.
 for(const type of [0,1,2,3,4,5]) {
  await page.evaluate(type=>{
   const id=Number(window.GAME_STATE.selectedSector);
   window.Galaxy3D.setSectorDetail({id,type});
   window.SectorPreview.show({id,type,sensorContactOnly:true});
  },type);
  await page.locator('#inspectPlanetBtn').click();await expect(page.locator('#planetInspection')).toBeVisible();
  await expect(page.locator('#inspectionCapacity')).toBeHidden();
  if(type===2) {await page.waitForTimeout(800);await page.screenshot({path:info.outputPath('black-hole-inspection.png')});}
  await page.keyboard.press('Escape');
 }
 await page.evaluate(()=>window.GameUI.showSectorSelection(999,{seen:false,type:10}));
 await expect(page.locator('#sectorPreviewImage')).toBeHidden();
 await expect(page.locator('#sectorPreviewKind')).toContainText('Uncharted');
 await expect(page.locator('#renamePlanetBtn')).toBeHidden();
 expect(errors).toEqual([]);
});
