const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('public/js/connect.js','utf8');
const ctx=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function classifyEventMessage('),source.indexOf('let orderReceiptTimer')),ctx);
test('fleet and probe losses are battle reports, not routine movement',()=>{
 for(const line of ['Our probe was destroyed in sector 7','Fleet annihilated at the black hole','Error: Fleet arrived, 8. 2 did not.','Battle report: Defeat in sector 9'])assert.equal(ctx.classifyEventMessage(line).kind,'battle',line);
 assert.equal(ctx.classifyEventMessage('Success: Fleet arrived, 9. All hulls.').kind,'movement');
 assert.equal(ctx.classifyEventMessage('Success: Built Colony Ship in sector 4').kind,'ship');
});
