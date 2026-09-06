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

test('small map planets use fewer vertices while inspection restores full geometry',()=>{
 const source=read('public/js/galaxy3d.js');const low={},full={};
 const ctx=vm.createContext({inspection:null,SHELL_DETAIL_PX:120,state:{detail:0,sharedGeo:{worldSphereLow:low,worldSphere:full}}});
 vm.runInContext(source.slice(source.indexOf('    function applyDetail('),source.indexOf('    function refreshDetail(')),ctx);
 const surface={},clouds={},atmosphere={};const entry={id:7,content:{userData:{world:{userData:{radius:.4,surface,clouds,atmosphere}}}}};
 ctx.applyDetail(entry,40);assert.equal(surface.geometry,low);assert.equal(clouds.geometry,low);
 ctx.inspection={id:7};ctx.applyDetail(entry,40);assert.equal(surface.geometry,full);
 ctx.inspection=null;ctx.applyDetail(entry,180);assert.equal(surface.geometry,full);
 ctx.applyDetail(entry,40);assert.equal(surface.geometry,low,'return to map restores cheaper mesh');
});

test('slow first battle sheds post-processing immediately before reducing resolution',()=>{
 const source=read('public/js/battle3d.js');let disposed=0,resized=0;
 const ctx=vm.createContext({current:{startedAt:0,durationSec:30},frameSamples:[],POST_SAMPLE:24,POST_BUDGET_MS:160,RES_BUDGET_MS:120,RES_STEP:.82,resScale:1,composer:{},postAllowed:true,heavyAllowed:true,window:{},console:{info(){}},median:a=>a.slice().sort((a,b)=>a-b)[a.length>>1],resLocked:()=>false,applyResolution(){resized++;},ensureComposer(){disposed++;ctx.composer=null;}});
 const start=source.indexOf('    function governFrame(');
 vm.runInContext(source.slice(start,source.indexOf('    // Backdrop world',start)),ctx);
 for(let i=0;i<4;i++)ctx.governFrame(.3,1+i*.3);
 assert.equal(disposed,1);assert.equal(ctx.postAllowed,false);assert.equal(resized,0);
 for(let i=0;i<4;i++)ctx.governFrame(.2,3+i*.2);
 assert.equal(resized,1);assert.equal(ctx.resScale,.82);
 ctx.frameSamples=[];ctx.composer={};ctx.window.__battle3dNoPost=false;ctx.resLocked=()=>true;
 for(let i=0;i<4;i++)ctx.governFrame(.5,4+i*.5);
 assert.equal(disposed,1,'explicit art-quality override remains available');
});
