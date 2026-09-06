const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture() {
 const sent=[],toasts=[];
 const ctx=vm.createContext({console:{log(){},error(){}},URLSearchParams,WebSocket:{OPEN:1},
  window:{location:{protocol:'http:',hostname:'localhost',port:'3000',search:''}},
  document:{addEventListener(){},getElementById(){return null;}},setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('public/js/lobby.js','utf8'),ctx);
 ctx.recordSend=message=>sent.push(message);ctx.recordToast=message=>toasts.push(message);
 vm.runInContext(`websocket={readyState:1,send:recordSend};isLobbyReady=true;userId='7';
 showToast=recordToast;renderWaitingView=()=>{};renderGameListSkeleton=()=>{};
 updateCreateGamePanelVisibility=()=>{};refreshGames=()=>{};`,ctx);
 return {ctx,sent,toasts,run:code=>vm.runInContext(code,ctx)};
}
test('leave retains membership until the server acknowledges and survives rejection',()=>{
 const f=fixture();f.run('currentGameId=42;leaveGame()');assert.equal(f.run('currentGameId'),42);
 assert.deepEqual(f.sent,['//leavegame']);f.run("handleMessage('Error: Unable to leave game')");assert.equal(f.run('currentGameId'),42);
 f.run("handleMessage('lobby::')");assert.equal(f.run('currentGameId'),null);
});
test('offline leave preserves the room and does not navigate or send',()=>{
 const f=fixture();f.run('currentGameId=42;websocket.readyState=3;leaveGame()');
 assert.equal(f.run('currentGameId'),42);assert.equal(f.ctx.window.location.href,undefined);assert.deepEqual(f.sent,[]);
});
test('clearing a room discards its roster and pending automated start',()=>{
 const f=fixture();f.run('currentPlayerDetails=[{name:"old"}];sandboxAutoStartTarget=4;clearCurrentGameTracking()');
 assert.equal(f.run('currentPlayerDetails.length'),0);assert.equal(f.run('sandboxAutoStartTarget'),null);
});
test('a different game snapshot cannot display the previous roster or countdown',()=>{
 const f=fixture();f.run('currentGameId=1;currentPlayerDetails=[{name:"old"}];sandboxAutoStartTarget=4;countdownSeconds=3;hydrateCurrentGame({gameId:2,creatorId:7})');
 assert.equal(f.run('currentPlayerDetails.length'),0);assert.equal(f.run('sandboxAutoStartTarget'),null);assert.equal(f.run('countdownSeconds'),null);
});
for(const operation of ['joinGame(42)','currentGameId=42;openRaceSelectorForCurrentGame()']) {
 test('faction confirmation after disconnect does not send: '+operation,()=>{
  const f=fixture();f.run('loadRaceSelectionScript=cb=>cb();window.RaceSelection={initialize:cb=>window.confirmRace=cb};'+operation);
  f.run('websocket.readyState=3');assert.doesNotThrow(()=>f.ctx.window.confirmRace(1));assert.deepEqual(f.sent,[]);
  assert.equal(f.run('isAwaitingRaceSelection'),false);
 });
}
test('a malformed encoded name cannot interrupt the entire roster update',()=>{
 const f=fixture();f.run("currentGameId=42;updatePlayerList('7|bad%name|0|1:8|Good%20Name|0|1')");
 assert.equal(f.run('currentPlayerDetails.length'),2);assert.equal(f.run('currentPlayerDetails[1].name'),'Good Name');
});
