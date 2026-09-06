const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture(){
 const pending=new Map(),started=[],errors=[];let id=0;
 const ctx=vm.createContext({current:{options:{}},running:true,battleQueue:[],timers:[],hud:null,theaterEl:null,
  window:{},document:{body:{classList:{remove(){}}}},console:{error(...args){errors.push(args);}},
  setTimeout(fn){pending.set(++id,fn);return id;},clearTimeout(i){pending.delete(i);},teardownBattle(){},parseTimeline:message=>[message]});
 ctx.startBattle=entry=>{started.push(entry);ctx.current=entry;ctx.running=true;};
 const source=fs.readFileSync('public/js/battle3d.js','utf8');
 vm.runInContext(source.slice(source.indexOf('    function clearTimers()'),source.indexOf('    /**\n     * Tear down the BATTLE')),ctx);
 vm.runInContext(source.slice(source.indexOf('    function finishBattle('),source.indexOf('    function onResize()')),ctx);
 return {ctx,pending,started,errors,tick(){const [key,fn]=pending.entries().next().value;pending.delete(key);fn();}};
}
test('cleanup cancels delayed completion before a replacement battle starts',()=>{
 const f=fixture();let completed=0;f.ctx.current.options.onComplete=()=>completed++;
 f.ctx.finishBattle(false);assert.equal(f.pending.size,1);f.ctx.cleanupBattleVisualization();
 f.ctx.createBattleVisualization('replacement',{});
 assert.equal(f.pending.size,0);assert.equal(completed,0);assert.equal(f.ctx.current.timeline[0],'replacement');
});
test('a queued battle retains its place during the transition gap',()=>{
 const f=fixture();f.ctx.battleQueue.push({timeline:['queued'],options:{}});
 f.ctx.finishBattle(false);f.tick();f.ctx.createBattleVisualization('new arrival',{});
 assert.equal(f.started.length,0);assert.equal(f.ctx.battleQueue.length,1);f.tick();
 assert.equal(f.started[0].timeline[0],'queued');
});
test('cleanup cancels a queued restart',()=>{
 const f=fixture();f.ctx.battleQueue.push({timeline:['queued'],options:{}});
 f.ctx.finishBattle(false);f.tick();f.ctx.cleanupBattleVisualization();assert.equal(f.pending.size,0);
});
test('completion callback exceptions do not strand the queue',()=>{
 const f=fixture();f.ctx.current.options.onComplete=()=>{throw new Error('callback failure');};
 f.ctx.battleQueue.push({timeline:['queued'],options:{}});f.ctx.finishBattle(false);
 assert.doesNotThrow(()=>f.tick());assert.equal(f.errors.length,1);f.tick();assert.equal(f.started.length,1);
});
test('repeated finish requests complete a battle once',()=>{
 const f=fixture();let completed=0;f.ctx.current.options.onComplete=()=>completed++;
 f.ctx.finishBattle(false);f.ctx.finishBattle(true);assert.equal(f.pending.size,1);f.tick();assert.equal(completed,1);
});
test('chat suppresses only an exact echo from the authenticated player',()=>{
 const source=fs.readFileSync('public/js/chat.js','utf8');
 const ctx=vm.createContext({Date,getCookie:()=> '7',pendingOwnMessages:[{text:'hello',time:Date.now()}]});
 vm.runInContext(source.slice(source.indexOf('    function shouldSuppressOwnEcho'),source.indexOf('    function normalizeChatInput')),ctx);
 assert.equal(ctx.shouldSuppressOwnEcho('Player 8 says: hello'),false);
 assert.equal(ctx.shouldSuppressOwnEcho('Player 7 says: hello there'),false);
 assert.equal(ctx.shouldSuppressOwnEcho('Player 7 says: hello'),true);
 assert.equal(ctx.shouldSuppressOwnEcho('Player 7 says: hello'),false);
});
