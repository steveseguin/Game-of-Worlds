const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(name, 'utf8');
class Vector2 { constructor(x=0,y=0){this.set(x,y);} set(x,y){this.x=x;this.y=y;return this;} }
class Target { constructor(w,h){this.setSize(w,h);this.texture={};} setSize(w,h){this.width=w;this.height=h;} clone(){return new Target(this.width,this.height);} dispose(){this.disposed=true;} }
class Pass { constructor(){this.material={uniforms:{texel:{value:new Vector2()}}};} setSize(w,h){this.width=w;this.height=h;} dispose(){this.disposed=true;} }
function context(){
 const ctx=vm.createContext({Vector2,WebGLRenderTarget:Target,HalfFloatType:1,NoBlending:0,Timer:class{},ShaderPass:Pass,CopyShader:{},console});
 const composer=read('public/js/vendor/addons/postprocessing/EffectComposer.js').replace(/import[\s\S]*?from [^;]+;/g,'').replace(/export \{ EffectComposer \};/,'globalThis.EffectComposer = EffectComposer;');
 vm.runInContext(composer,ctx);return ctx;
}
test('battle post-processing uses exactly one device scale and disposes its passes',()=>{
 const ctx=context();Object.assign(ctx,{THREE:{Vector2,WebGLRenderTarget:Target,HalfFloatType:1},window:{},postAllowed:true,heavyAllowed:true,renderer:{getPixelRatio:()=>1.4,getDrawingBufferSize:v=>v.set(1400,700),capabilities:{isWebGL2:true}},scene:{},camera:{},composer:null,bloomPass:null,sharpenPass:null,_buf:new Vector2(),RenderPass:Pass,UnrealBloomPass:Pass,OutputPass:Pass,SharpenShader:{}});
 const source=read('public/js/battle3d.js');vm.runInContext(source.slice(source.indexOf('    function ensureComposer()'),source.indexOf('    function setupScene()')),ctx);
 ctx.ensureComposer();assert.ok(ctx.composer);
 assert.equal(ctx.composer.renderTarget1.width,1400);assert.equal(ctx.composer.renderTarget1.height,700);
 assert.equal(ctx.bloomPass.width,350);assert.equal(ctx.sharpenPass.material.uniforms.texel.value.x,1/1400);
 const passes=ctx.composer.passes.slice();ctx.window.__battle3dNoPost=true;ctx.ensureComposer();
 assert.equal(ctx.composer,null);assert.ok(passes.every(p=>p.disposed));
});
test('galaxy post-processing follows adaptive resolution instead of retaining startup DPR',()=>{
 const ctx=context();let ratio=1.5;
 const renderer={getPixelRatio:()=>ratio,setSize(){}};
 const composer=new ctx.EffectComposer(renderer,new Target(1200,900));
 let width=800;
 Object.assign(ctx,{inspection:null,state:{renderer,composer,container:{getBoundingClientRect:()=>({width,height:600})},camera:{updateProjectionMatrix(){}},fxaaPass:{material:{uniforms:{resolution:{value:new Vector2()}}}}},updateFrameOffset(){}});
 const source=read('public/js/galaxy3d.js');vm.runInContext(source.slice(source.indexOf('    function resize()'),source.indexOf('    function fitCamera()')),ctx);
 ctx.resize();assert.equal(composer.renderTarget1.width,1200);
 ratio=0.75;ctx.resize();assert.equal(composer.renderTarget1.width,600);assert.equal(composer.renderTarget1.height,450);
 assert.equal(ctx.state.fxaaPass.material.uniforms.resolution.value.x,1/600);
 ctx.inspection={baseDistance:2.5};ctx.state.zoom=2;
 width=390;ctx.resize();assert.equal(ctx.state.zoom,2*3.7/2.5);
 ctx.resize();assert.equal(ctx.state.zoom,2*3.7/2.5,'repeated resize must not compound zoom');
 width=800;ctx.resize();assert.ok(Math.abs(ctx.state.zoom-2)<1e-12,'desktop resize preserves relative zoom');
});

test('finished battles release their frame callback and idle animation does not reschedule',()=>{
 const source=read('public/js/battle3d.js');
 let scheduled=0;const cancelled=[];
 const ctx=vm.createContext({animHandle:42,current:null,scene:null,requestAnimationFrame(){scheduled++;return 99;},cancelAnimationFrame(id){cancelled.push(id);}});
 vm.runInContext(source.slice(source.indexOf('    function teardownBattle()'),source.indexOf('    function finishBattle(')),ctx);
 ctx.teardownBattle();assert.deepEqual(cancelled,[42]);assert.equal(ctx.animHandle,null);
 const start=source.indexOf('    function animate()');
 const end=source.indexOf('        const now = nowSec();',start);
 vm.runInContext(source.slice(start,end)+'}',ctx);
 ctx.animate();assert.equal(scheduled,0);assert.equal(ctx.animHandle,null);
});
