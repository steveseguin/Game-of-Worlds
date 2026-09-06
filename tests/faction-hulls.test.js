const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
test('faction hulls have distinct, finite silhouettes with valid normals and UVs',async()=>{
 const {createFactionHullGeometry}=await import('../public/js/faction-hulls.js');
 const silhouettes=new Set();
 for(let race=2;race<=12;race++){
  const geometry=createFactionHullGeometry(race);
  for(const attribute of Object.values(geometry.attributes)) assert.ok(Array.from(attribute.array).every(Number.isFinite));
  assert.equal(geometry.attributes.position.count,geometry.attributes.normal.count);
  assert.equal(geometry.attributes.position.count,geometry.attributes.uv.count);
  assert.ok(geometry.boundingSphere.radius>0.5&&geometry.boundingSphere.radius<2);
  silhouettes.add(createHash('sha256').update(Buffer.from(geometry.attributes.position.array.buffer)).digest('hex'));
  geometry.dispose();
 }
 assert.equal(silhouettes.size,11);
});
