const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const h=require('./support/ui-game-harness');
test('room invitation survives registration and host transfer restores AI controls',async({browser,page},info)=>{
 test.setTimeout(120000);
 const username=h.uniqueId('host');await h.registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await h.createGame(page,h.uniqueId('friends'),{maxPlayers:'4',mode:'quick'});
 const room=await h.extractLobbyGameId(page);const invite=await page.getByRole('textbox',{name:'Room invitation link'}).inputValue();
 expect(invite).toContain(`/lobby.html?game=${room}`);
 await expect(page.getByRole('link',{name:'Open game view',exact:true})).toHaveCount(0);
 const guestContext=await browser.newContext();const friend=await guestContext.newPage();
 try {
  await friend.goto(invite);await expect(friend).toHaveURL(new RegExp(`/login.html\\?game=${room}$`));
  const name=h.uniqueId('friend');await friend.click('#registerTab');
  await friend.fill('#registerUsername',name);await friend.fill('#registerEmail',name+'@example.com');await friend.fill('#registerPassword','Secure123!');await friend.fill('#confirmPassword','Secure123!');
  await friend.click('#registerForm button[type="submit"]');
  await h.chooseFirstAvailableRace(friend);await h.waitForMatchLobby(friend);
  expect(await h.extractLobbyGameId(friend)).toBe(room);
  await page.getByRole('button',{name:'Leave game',exact:true}).click();
  await expect(friend.getByRole('button',{name:'Add AI Opponent',exact:true})).toBeVisible();
  await friend.selectOption('#aiDifficulty','chill');await friend.getByRole('button',{name:'Add AI Opponent',exact:true}).click();
  await expect(friend.locator('.waiting-meta')).toContainText('Players: 2/4');
  await expect(friend.locator('.waiting-footer')).toContainText('You are the host');
  expect(await friend.locator('.waiting-meta .chip').first().evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
  expect((await new AxeBuilder({page:friend}).include('.waiting-view').analyze()).violations).toEqual([]);
  await friend.screenshot({path:info.outputPath('waiting-desktop.png'),fullPage:true});
  await friend.setViewportSize({width:390,height:844});await friend.screenshot({path:info.outputPath('waiting-mobile.png'),fullPage:true});
  expect(await friend.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 } finally {await guestContext.close();}
});
