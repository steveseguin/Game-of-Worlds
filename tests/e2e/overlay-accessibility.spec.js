const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {uniqueId,registerUser,createGame,startGame,dismissFirstRunGuidance}=require('./support/ui-game-harness');
test('overlay review',async({page},info)=>{
 test.setTimeout(180000);
 const username=uniqueId('review');await registerUser(page,{username,email:username+'@example.com',password:'Secure123!'});
 await createGame(page,uniqueId('review'),{maxPlayers:'2',mode:'test'});await startGame(page,[page]);
 await page.locator('#tour-skip').waitFor({state:'visible'});await dismissFirstRunGuidance(page);
 async function audit(label){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),label).toEqual([]);}
 await page.evaluate(()=>{
  ChatSystem.displayMessage('Commander: First report');
  ChatSystem.displayMessage('Commander: Second report');
  ChatSystem.displayMessage('Commander: Latest report');
 });
 await page.locator('#chatHistoryUp').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#chatHistoryReadout')).toContainText('Second report');
 await expect(page.locator('#chatMessages')).toBeHidden();
 await page.evaluate(()=>ChatSystem.displayMessage('Commander: New report'));
 await expect(page.locator('#chatHistoryReadout')).toContainText('Second report');
 await page.locator('#chatHistoryDown').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#chatHistoryReadout')).toBeHidden();
 await expect.poll(()=>page.locator('#chatFeed').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThanOrEqual(2);
 await page.locator('#chatFeed').focus();await page.keyboard.press('Home');
 await expect.poll(()=>page.locator('#chatFeed').evaluate(el=>el.scrollTop)).toBe(0);
 await expect(page.locator('#chatMessages')).toHaveAttribute('role','log');
 await page.locator('#chat').fill('Keep this draft');
 await page.evaluate(()=>{
  const original=websocket;websocket={readyState:3};
  try {ChatSystem.sendChat({preventDefault(){}});}finally{websocket=original;}
 });
 await expect(page.locator('#chat')).toHaveValue('Keep this draft');
 await expect(page.locator('#chatMessages')).not.toContainText('You: Keep this draft');
 await expect(page.locator('#chatSendStatus')).toContainText('not sent');
 expect(await page.locator('#chat').evaluate(el=>getComputedStyle(el).userSelect)).not.toBe('none');
 expect(await page.evaluate(()=>document.body.onselectstart===null)).toBe(true);
 await audit('chat');
 await page.screenshot({path:info.outputPath('chat-readable.png')});
 const sent=await page.evaluate(()=>{
  const original=websocket, sent=[];
  websocket={readyState:WebSocket.OPEN,send:text=>sent.push(text)};
  try {ChatSystem.sendChat({preventDefault(){}});}finally{websocket=original;}
  return sent;
 });
 expect(sent).toEqual(['Keep this draft']);
 await expect(page.locator('#chat')).toHaveValue('');
 await expect(page.locator('#chatMessages')).toContainText('You: Keep this draft');
 await expect(page.locator('#chatSendStatus')).toBeEmpty();
 await page.locator('#analyticstab').click();await audit('analytics');
 await page.locator('#helpBtn').click();
 for(const tab of await page.locator('#codexTabs button').all()){await tab.click();await audit(await tab.textContent());}
 await page.screenshot({path:info.outputPath('overlay.png')});
});
