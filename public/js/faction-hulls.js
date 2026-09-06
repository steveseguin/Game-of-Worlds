import * as THREE from './vendor/three.module.min.js';

// Shared faction silhouette library for the galaxy and battle renderers.
// Coordinates use +Z as the nose; callers control scale and material.
export function createFactionHullGeometry(raceId) {
    const id = Math.max(2, Math.min(12, Number(raceId) || 2));
        const parts = [];
        const add = (g, x, y, z, sx, sy, sz) => {
            g.scale(sx, sy, sz); g.translate(x, y, z);
            parts.push(g.index ? g.toNonIndexed() : g);
            if (g.index) g.dispose();
        };
        const box = (x,y,z,sx,sy,sz) => add(new THREE.BoxGeometry(1,1,1),x,y,z,sx,sy,sz);
        const shard = (x,y,z,sx,sy,sz) => add(new THREE.OctahedronGeometry(1),x,y,z,sx,sy,sz);
        if ([2,6,8,11].includes(id)) {
            const width = id === 11 ? 0.48 : id === 2 ? 0.27 : 0.34;
            box(0,0,0,width,0.24,1.5);
            for (const side of [-1,1]) for (let k=0;k<(id===8?4:3);k++) {
                box(side*(width/2+0.12),0,-0.48+k*0.32,0.22,0.19,0.24);
            }
            box(0,0.18,-0.2,width*0.65,0.14,0.5);
            shard(0,0,0.74,width*0.6,0.12,0.32);
        } else if (id === 4) {
            shard(0,0,0.1,0.23,0.19,1);
            for (const side of [-1,1]) {
                shard(side*0.25,0,-0.25,0.16,0.13,0.66);
                shard(side*0.42,0,-0.45,0.1,0.09,0.4);
            }
        } else if ([3,7,12].includes(id)) {
            shard(0,0,0,0.32,0.14,0.96);
            for (const side of [-1,1]) {
                shard(side*0.34,-0.025,-0.17,id===7?0.44:0.3,0.08,id===12?0.75:0.56);
            }
            if (id===3) for (const side of [-1,1]) shard(side*0.72,0,-0.5,0.09,0.06,0.25);
        } else {
            shard(0,0,0.2,0.19,0.13,0.85);
            const ring = new THREE.TorusGeometry(id===9?0.47:0.33,0.045,5,16);
            ring.rotateX(Math.PI/2);
            add(ring,0,0,-0.17,1,1,id===5?1.3:1);
            for (const side of [-1,1]) box(side*0.24,0,-0.2,0.065,0.06,0.9);
            if (id===10) shard(0,0.18,0,0.12,0.1,0.3);
        }

    const geometry = new THREE.BufferGeometry();
    for (const name of ['position','normal','uv']) {
        const arrays = parts.map(part=>part.getAttribute(name));
        const values = new Float32Array(arrays.reduce((sum,a)=>sum+a.array.length,0));
        let offset=0;
        for (const attribute of arrays) {values.set(attribute.array,offset);offset+=attribute.array.length;}
        geometry.setAttribute(name,new THREE.BufferAttribute(values,name==='uv'?2:3));
    }
    parts.forEach(part=>part.dispose());
    geometry.computeBoundingSphere();
    return geometry;
}
