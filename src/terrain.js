import * as THREE from 'three';
import { createPeachBuilder } from './botany.js';
import { createLeafyTreeBuilder } from './foliage.js';
import { cave, islandBottom, islandRadius, isLand, landHeight, riverWidth, riverX, seeded } from './world.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color('white');
const blend = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);

// Sample in world space so adjacent patches meet without texture seams.
function relief(x, y, z) {
  return Math.sin(x * 1.81 + y * 2.4 + z * 0.74 + 0.65 * Math.cos(z * 2.04 - x * 0.31))
    * Math.cos(z * 2.14 - x * 0.42)
    + 0.41 * Math.sin(x * 6.21 + y * 7.3 - z * 4.98)
    + 0.19 * Math.sin(x * 13.18 + z * 14.22 + y * 12.8);
}

function stoneMaterial(color, pattern, season) {
  const material = new THREE.MeshStandardMaterial({
    color,
    vertexColors: Boolean(pattern),
    roughness: 0.94,
  });
  material.customProgramCacheKey = () => pattern || 'rock';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.season = season;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 terrainWorld;')
      .replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vec4 surface = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          surface = instanceMatrix * surface;
        #endif
        terrainWorld = (modelMatrix * surface).xyz;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 terrainWorld;
        uniform float season;
        float terrainHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float terrainNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(terrainHash(i), terrainHash(i + vec2(1, 0)), f.x),
            mix(terrainHash(i + vec2(0, 1)), terrainHash(i + vec2(1)), f.x), f.y);
        }
      `)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 p = terrainWorld;
        vec2 q = p.xz + p.y * vec2(.71, .53);
        float speck = terrainNoise(q * 41.0) - .5;
        float cloud = terrainNoise(q * 2.4) - .5;
        ${pattern === 'ground'
          ? `diffuseColor.rgb *= 1.0 + 0.22 * cloud + 0.105 * speck;
             if (season > 0.001) {
               float patches = terrainNoise(p.xz * .73) * .68 + terrainNoise(p.xz * 2.9) * .24 + speck * .081;
               float pathDistance = (p.z + 8.1 + .23 * sin(p.x)) * 1.12;
               float walked = exp(-pathDistance * pathDistance);
               walked *= 1.0 - smoothstep(.26, 1.0, abs(p.x) / 16.0);
               float cover = smoothstep(0.19, .48, patches - walked * .15);
               float coast = smoothstep(.13, .37, p.y);
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.82, 0.82), season * cover * coast * .92);
             }`
          : `float bed = sin(p.y * 14.0 + p.x * .83 + p.z * .43 + terrainNoise(q * 1.1) * 4.0);
             diffuseColor.rgb *= 1.0 + 0.20 * cloud + 0.10 * speck - 0.052 * smoothstep(.77, 1.0, bed);
             ${pattern === 'tunnel' ? `
               float frost = smoothstep(3.7, 5.25, p.y + 0.36 * cloud) * smoothstep(.2, .72, terrainNoise(q * .97));
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.80, 0.8), season * frost * 0.95);` : ''}`}
      `);
  };
  return material;
}

function surfaceGeometry(positions, colors, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ridgeSurface(scene, season) {
  const positions = [], colors = [], indices = [];
  const rings = 115, sides = 176;
  const grass = new THREE.Color('#83994e');
  const moss = new THREE.Color('#527743');
  const sunny = new THREE.Color('#aba766');
  const path = new THREE.Color('#bc9b69');
  const wet = new THREE.Color('#726449');
  const shale = new THREE.Color('#918576');
  for (let ring = 0; ring <= rings; ring++) {
    for (let slice = 0; slice < sides; slice++) {
      const a = slice * TAU / sides;
      const r = islandRadius(a) * Math.max(0.0003, ring / rings);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = landHeight(x, z);
      const mottle = relief(x * 0.37, 0, z * 0.37);
      const slope = Math.hypot(landHeight(x + 0.28, z) - y, landHeight(x, z + 0.28) - y);
      const village = z < -3 && z > -16 && x > -8 && x < 14;
      const yard = Math.exp(-(((x + 2.5) / 4.6) ** 2 + ((z + 7.2) / 4.2) ** 2));
      const villagePath = Math.exp(-((z + 8.1 + 0.23 * Math.sin(x)) ** 2) / 1.5)
        * clamp((16 - Math.abs(x)) / 1.8, 0, 1);
      const color = grass.clone()
        .lerp(moss, clamp(0.26 - mottle * 0.31, 0, 0.8))
        .lerp(sunny, clamp(mottle * 0.4 + 0.18, 0, 0.85))
        .lerp(shale, clamp(slope * 1.38 - 0.27, 0, 0.8))
        .lerp(path, village ? clamp(Math.max(yard * 1.25, villagePath * 0.75), 0, 0.89) : 0)
        .lerp(wet, clamp((0.54 - y) * 1.8, 0, 0.87));
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      if (!ring) continue;
      const i = (ring - 1) * sides + slice;
      const next = (ring - 1) * sides + (slice + 1) % sides;
      indices.push(i, next, i + sides, next, next + sides, i + sides);
    }
  }
  const land = new THREE.Mesh(surfaceGeometry(positions, colors, indices), stoneMaterial(0xffffff, 'ground', season));
  land.receiveShadow = true;
  land.castShadow = true;
  scene.add(land);

  const edgePositions = [], edgeColors = [], edgeIndices = [];
  const strata = ['#918165', '#9c835f', '#776552', '#85745e', '#716257', '#6a5848', '#625144']
    .map((color) => new THREE.Color(color));
  for (let layer = 0; layer < strata.length; layer++) {
    for (let slice = 0; slice < sides; slice++) {
      const a = slice * TAU / sides;
      const radius = islandRadius(a);
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const top = landHeight(x, z);
      const depth = layer / (strata.length - 1);
      const lip = layer ? -depth * 0.38 + 0.15 * (1 - depth) * relief(x, layer, z) : 0;
      const y = blend(top, islandBottom, depth) + 0.13 * Math.sin(a * 29.0) * Math.sin(depth * Math.PI);
      edgePositions.push(x + Math.cos(a) * lip, y, z + Math.sin(a) * lip);
      const color = strata[layer].clone().multiplyScalar(1 + 0.18 * relief(x * 0.81, depth, z * 0.81));
      edgeColors.push(color.r, color.g, color.b);
      if (!layer) continue;
      const i = (layer - 1) * sides + slice;
      const next = (layer - 1) * sides + (slice + 1) % sides;
      edgeIndices.push(i, next, i + sides, next, next + sides, i + sides);
    }
  }
  const edge = new THREE.Mesh(surfaceGeometry(edgePositions, edgeColors, edgeIndices), stoneMaterial(0xffffff, 'edge', season));
  edge.castShadow = true;
  edge.receiveShadow = true;
  scene.add(edge);
  return [land, edge];
}

function tunnelMesh(scene, season) {
  const positions = [], colors = [], indices = [];
  const columns = 48, rows = 27;
  const dark = new THREE.Color('#554d41');
  const stone = new THREE.Color('#9a8b74');
  const moss = new THREE.Color('#688247');
  const rings = [];
  for (let row = 0; row <= rows; row++) {
    rings.push({ z: blend(cave.back - 0.1, cave.front + 0.08, row / rows), type: 'inside' });
  }
  for (let row = 1; row <= 5; row++) {
    rings.push({ z: cave.front + 0.08 - Math.sin(row * Math.PI / 5) * 0.16, type: 'rim', t: row / 5 });
  }
  for (let row = 1; row <= rows; row++) {
    rings.push({ z: blend(cave.front + 0.08, cave.back - 0.1, row / rows), type: 'outside' });
  }
  for (let row = 1; row < 5; row++) {
    rings.push({ z: cave.back - 0.1, type: 'rim', t: 1 - row / 5 });
  }
  for (let row = 0; row < rings.length; row++) {
    const { z, type, t } = rings[row];
    const wall = type === 'inside' ? 0 : type === 'outside' ? 1 : t;
    const s = clamp((z - cave.back) / (cave.front - cave.back), 0, 1);
    for (let column = 0; column <= columns; column++) {
      const a = column * Math.PI / columns;
      const { x, y } = archPoint(z, a, wall);
      const color = dark.clone().lerp(stone, wall * 0.88 + 0.22 * s);
      color.lerp(moss, wall * clamp(0.36 + 0.48 * relief(x * 0.53, 0, z * 0.53), 0, 0.85));
      color.multiplyScalar(0.95 + 0.14 * relief(x, y, z));
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      if (!column) continue;
      const i = row * (columns + 1) + column;
      const after = (i + columns + 1) % (rings.length * (columns + 1));
      indices.push(i, i - 1, after, i - 1, after - 1, after);
    }
  }
  const material = stoneMaterial(0xffffff, 'tunnel', season);
  material.side = THREE.DoubleSide;
  const tunnel = new THREE.Mesh(surfaceGeometry(positions, colors, indices), material);
  tunnel.castShadow = true;
  tunnel.receiveShadow = true;
  scene.add(tunnel);
  return tunnel;
}

function archPoint(z, a, wall) {
  const s = clamp((z - cave.back) / (cave.front - cave.back), 0, 1);
  const rise = Math.sin(a) ** 0.86;
  const radius = riverWidth(z) * 1.03;
  const asymmetry = Math.sin(a * 5 + z * 0.81) * 0.13 + Math.cos(a * 11 - z * 1.03) * 0.08;
  const innerX = riverX(z) + (radius + asymmetry) * Math.cos(a) - 0.22 * rise;
  const outerX = riverX(z) + (radius + 3.55 + 0.38 * Math.sin(z * 0.41)) * Math.cos(a) - 0.68 * rise;
  const x = blend(innerX, outerX, wall);
  const innerY = -0.14 + cave.height * rise * (0.76 + s * 0.24) + asymmetry;
  const outerY = blend(landHeight(x, z) - 0.34, 5.6 + Math.sin(s * 2.2) * 0.32, rise);
  return vector(x, blend(innerY, outerY + relief(x, outerY, z) * 0.37 * rise, wall), z);
}

function stoneGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const bulge = 1 + 0.16 * relief(x * 1.76, y * 1.35, z * 1.24);
    const crease = 0.28 * Math.sin(y * 7 + x * 1.5 + z * 0.6);
    points.setXYZ(i, x * (bulge + crease * 0.25), y * bulge + 0.13 * x, z * bulge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function foliageGeometry(detail) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const sample = relief(x * 0.81, y * 1.37, z * 0.72);
    const bulge = 1 + 0.17 * sample;
    positions.setXYZ(i, x * bulge, y * bulge, z * bulge);
    if (y > 0.23) normals.setXYZ(i, x, y, z);
    const tint = 0.9 + 0.16 * sample + y * 0.082;
    colors.push(tint, tint, tint);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function stoneSnowGeometry(rock) {
  const positions = rock.getAttribute('position');
  const caps = [];
  const snowLine = (p) => p.y - 0.38 - relief(p.x * 1.27, 0.1, p.z * 1.18) * 0.16;
  const corners = [vector(0, 0, 0), vector(0, 0, 0), vector(0, 0, 0)];
  for (let i = 0; i < positions.count; i += 3) {
    corners.forEach((corner, index) => corner.fromBufferAttribute(positions, i + index));
    const polygon = [];
    for (let side = 0; side < 3; side++) {
      const start = corners[side], end = corners[(side + 1) % 3];
      const above = snowLine(start), next = snowLine(end);
      if (above >= 0) polygon.push(start.clone());
      if ((above < 0) !== (next < 0)) polygon.push(start.clone().lerp(end, above / (above - next)));
    }
    for (const p of polygon) {
      p.y += 0.021 + Math.max(0, snowLine(p)) * 0.087;
      p.x *= 1.004;
      p.z *= 1.004;
    }
    for (let j = 1; j + 1 < polygon.length; j++) {
      for (const p of [polygon[0], polygon[j], polygon[j + 1]]) caps.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function blossomGeometry() {
  const positions = [], colors = [], indices = [];
  const glow = new THREE.Color('#fff1ed');
  const blush = new THREE.Color('#dc7c94');
  const heart = new THREE.Color('#ed9d55');
  for (let petal = 0; petal < 5; petal++) {
    const a = petal * TAU / 5;
    const base = positions.length / 3;
    const outline = [[0.06, 0, 0], [0.34, 0.26, 0.11], [0.76, 0.32, 0.25],
      [0.99, 0.11, 0.36], [0.93, -0.15, 0.4], [0.72, -0.33, 0.24], [0.34, -0.26, 0.12],
      [0.54, 0, 0.10]];
    outline.forEach(([forward, across, y], i) => {
      positions.push(forward * Math.cos(a) + across * Math.sin(a), y,
        forward * Math.sin(a) - across * Math.cos(a));
      const color = i === 0 ? blush : i === 7 ? glow.clone().lerp(blush, 0.23) : glow;
      colors.push(color.r, color.g, color.b);
    });
    for (let side = 0; side < 7; side++) indices.push(base + 7, base + side, base + (side + 1) % 7);
  }
  const base = positions.length / 3;
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6;
    positions.push(Math.cos(angle) * 0.15, 0.11, Math.sin(angle) * 0.15);
    colors.push(heart.r, heart.g, heart.b);
  }
  positions.push(0, 0.21, 0);
  colors.push(1, 0.72, 0.3);
  for (let i = 0; i < 6; i++) indices.push(base + 6, base + (i + 1) % 6, base + i);
  return surfaceGeometry(positions, colors, indices);
}

function bladeGeometry() {
  return surfaceGeometry(
    [-0.01, 0, 0, -0.12, 0.46, 0.03, -0.09, 0.77, 0.17, 0, 1, 0.36,
      0.09, 0.77, 0.17, 0.12, 0.46, 0.03, 0, 0.49, 0.115],
    [], [0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6],
  );
}

function populate(scene, occluders, season) {
  const peachBuilder = createPeachBuilder(scene, season);
  const leafyBuilder = createLeafyTreeBuilder(scene, season);
  const random = seeded(92517);
  const between = (lo, hi) => blend(lo, hi, random());
  const pick = (items) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const colors = (values) => values.map((value) => new THREE.Color(value));
  const leaf = colors(['#78934a', '#91a852', '#688448', '#8ba356', '#aab56a']);
  const pebbles = colors(['#8b7e69', '#8f826d', '#a1957f', '#a89c84', '#786b55', '#8c8b69']);
  const grasses = colors(['#77954a', '#829b4a', '#afad59', '#657b46', '#b7af5e']);
  const snow = colors(['#e7e6de', '#f1eee9', '#dce8e9']);
  const matrices = new THREE.Object3D();
  function batch(geometry, material) {
    return { geometry, material, records: [] };
  }
  function add(batch, point, scale, orientation, color) {
    matrices.position.copy(point);
    matrices.scale.copy(scale);
    if (orientation instanceof THREE.Quaternion) matrices.quaternion.copy(orientation);
    else matrices.rotation.set(0, orientation ?? 0, 0);
    matrices.updateMatrix();
    batch.records.push([matrices.matrix.clone(), color]);
  }
  function render(batch, shadows, receive = true) {
    if (batch.records.length === 0) return new THREE.Group();
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.records.length);
    batch.records.forEach(([matrix, color], index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color || WHITE);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }

  const stone = batch(stoneGeometry(), stoneMaterial(0xffffff, null, season));
  const distantFoliage = batch(foliageGeometry(1), new THREE.MeshStandardMaterial({ roughness: .96, vertexColors: true }));
  const blossoms = batch(blossomGeometry(), new THREE.MeshStandardMaterial({
    roughness: 0.89, side: THREE.DoubleSide, vertexColors: true,
    emissive: 0x8f5264, emissiveIntensity: 0.055,
  }));
  const leafBlades = batch(bladeGeometry(), new THREE.MeshStandardMaterial({
    roughness: 0.89, side: THREE.DoubleSide,
  }));
  const stems = batch(new THREE.CylinderGeometry(0.86, 1, 1, 6), new THREE.MeshStandardMaterial({
    roughness: 0.68,
  }));
  const stoneSnow = batch(stoneSnowGeometry(stone.geometry), new THREE.MeshStandardMaterial({ roughness: .8 }));

  function limb(target, start, end, radius, color) {
    const delta = end.clone().sub(start);
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, delta.clone().normalize());
    add(target, start.clone().lerp(end, 0.5), vector(radius, delta.length() * 1.055, radius), rotation, color);
  }
  function leafAt(point, size, inclination) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      inclination, between(0, TAU), between(-0.75, 0.75), 'YXZ',
    ));
    add(leafBlades, point, vector(size, size, size), rotation, pick(grasses));
  }

  const proxyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const proxyMaterial = new THREE.MeshBasicMaterial();
  function proxy(point, scale) {
    const mesh = new THREE.Mesh(proxyGeometry, proxyMaterial);
    mesh.position.copy(point);
    mesh.scale.copy(scale);
    mesh.updateMatrixWorld(true);
    occluders.push(mesh);
  }

  function addPeach(x, z, size) {
    if (isLand(x, z)) peachBuilder.addTree(x, z, size * 2.75, Math.floor(random() * 0x7fffffff));
  }

  function addShadeTree(x, z, size) {
    if (isLand(x, z)) leafyBuilder.addTree(x, z, size * 2.75, Math.floor(random() * 0x7fffffff));
  }

  function addBamboo(x, z, height) {
    if (!isLand(x, z)) return;
    const y = landHeight(x, z);
    const width = between(0.021, 0.059);
    const leanX = between(-0.69, 0.69), leanZ = between(-0.53, 0.53);
    const segments = 8;
    const stemColor = pick(grasses).clone().multiplyScalar(0.75);
    let last = vector(x, y - 0.02, z);
    for (let joint = 1; joint <= segments; joint++) {
      const fraction = joint / segments;
      const at = vector(x + leanX * fraction ** 2, y + height * fraction, z + leanZ * fraction ** 2);
      limb(stems, last, at, width * (1 - fraction * 0.49), stemColor);
      if (joint < segments) add(stems, at, vector(width * 1.08, 0.025, width * 1.08), 0, stemColor.clone().multiplyScalar(1.27));
      if (joint > 3) {
        const a = between(0, TAU);
        const frond = at.clone().add(vector(Math.cos(a) * 0.64, between(-0.17, 0.19), Math.sin(a) * 0.64));
        limb(stems, at, frond, width * 0.38, stemColor);
        for (let k = 0; k < 7; k++) leafAt(at.clone().lerp(frond, k / 7), between(0.31, 0.62), between(0.81, 2.05));
      }
      last = at;
    }
  }

  function addRock(x, z, size, y = landHeight(x, z)) {
    const scale = vector(size, size * between(0.34, 0.86), size * between(0.71, 1.29));
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(between(-0.11, 0.11), between(0, TAU), between(-0.32, 0.32)));
    const color = pick(pebbles).clone().multiplyScalar(between(0.85, 1.12));
    add(stone, vector(x, y, z), scale, orientation, color);
    if (size > 0.7) proxy(vector(x, y, z), scale.clone().multiplyScalar(0.93), false);
    if (size > 0.24 && random() > 0.26) {
      add(stoneSnow, vector(x, y, z), scale, orientation, pick(snow));
    }
  }

  for (let i = 0; i < 270; i++) {
    const a = i * TAU / 270 + between(-0.02, 0.02);
    const r = islandRadius(a) - between(0.03, 0.76);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (landHeight(x, z) > 0.13) addRock(x, z, between(0.18, 0.73));
  }
  for (let i = 0; i < 165; i++) {
    const z = between(-18.5, 20.2);
    const direction = random() < 0.5 ? -1 : 1;
    const x = riverX(z) + direction * (riverWidth(z) + between(-0.04, 0.59));
    if (isLand(x, z)) addRock(x, z, between(0.12, z > 4.7 ? 0.58 : 0.35));
  }

  // Larger outcrops on the outer flanks keep the cultivated floor readable.
  for (let i = 0; i < 178; i++) {
    const x = between(-17, 17), z = between(-20, 18);
    if (!isLand(x, z)) continue;
    const y = landHeight(x, z);
    if ((z > -3 && z < 10 && (x < -6 || x > 2)) || z < -15 || Math.abs(x) > 13) {
      addRock(x, z, between(0.28, 1.39), y - 0.07);
    }
  }
  for (const [cx, cz, spread, count] of [[-11.2, 2.9, 3.5, 30], [-11.4, -17.1, 2.7, 14], [13.8, -17.3, 2.1, 15]]) {
    for (let i = 0; i < count; i++) {
      const x = cx + between(-spread, spread);
      const z = cz + between(-spread * 0.53, spread * 0.51);
      if (isLand(x, z)) addRock(x, z, between(0.38, 1.09), landHeight(x, z) - 0.066);
    }
  }

  // Break up the lip without filling the open channel or crossing the stone arch.
  for (const direction of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      const a = (i + 0.3) / 18 * Math.PI * 0.5;
      const z = cave.front + between(-0.7, 0.17);
      const size = between(0.34, 0.84);
      const x = riverX(z) + direction * Math.cos(a) * (riverWidth(z) + 0.92);
      const y = Math.sin(a) * (cave.height + 0.73);
      addRock(x, z, size, y);
    }
  }

  const grove = [];
  function placePeach(x, z, size, clearance = 1.8) {
    if (!isLand(x, z) || grove.some(([px, pz]) => Math.hypot(x - px, z - pz) < clearance)) return;
    if (Math.abs(x - riverX(z)) < riverWidth(z) + 0.54) return;
    if (z > 4.4 && z < 10.1 && x > riverX(z) && x < riverX(z) + riverWidth(z) + 2.45) return;
    addPeach(x, z, size);
    grove.push([x, z]);
  }
  // Direct the foreground silhouettes around the two banks instead of across the mouth.
  const heroes = [[16.7, -1, 1.47], [18.1, 1, 1.22], [13.25, 1, 1.57],
    [12.5, -1, 1.24], [8.65, -1, 1.15], [7.9, 1, 1.16, 2.57]];
  for (const [z, direction, size, margin = 0.9] of heroes) {
    for (let shift = margin; shift >= margin - 0.32; shift -= 0.16) {
      const x = riverX(z) + direction * (riverWidth(z) + shift);
      const previous = grove.length;
      placePeach(x, z, size);
      if (grove.length > previous) break;
    }
  }
  for (let i = 0; i < 750 && grove.length < 53; i++) {
    const z = between(6.3, 20.2), x = between(-16.5, 16.5);
    placePeach(x, z, between(0.74, 1.29), 1.78);
  }
  // Cottage gardens, terraces and outer banks leave the working courtyards open.
  const villagePeaches = [
    [-4.3, -13.85, 1.04], [-.65, -14.35, 1.12], [4.95, -15.05, .92],
    [-9.25, -12.55, .9], [-9.35, -8.5, .88], [-3.65, -8.35, .72],
    [.9, -9.2, .79], [-7.65, -5.05, .89], [8.4, -6.35, .91],
    [14.15, -7.3, 1.0], [14.7, -10.75, .82], [10.15, -14.15, .88],
    [7.95, -16.1, .85], [7.5, -.7, .92],
  ];
  for (const [x, z, size] of villagePeaches) placePeach(x, z, size, 1.5);
  addShadeTree(-8.6, -5.7, 1.23);
  addShadeTree(14.15, -4.8, 0.86);

  const forests = [];
  for (let i = 0; i < 1150 && forests.length < 78; i++) {
    const x = between(-18, 18), z = between(-21, 8);
    const behindVillage = (z < -15.7 && x < 7.4) || (z < -17 && x > 7.4);
    const side = (x < -10.2 && z < 4.75) || (x > 15.2 && z < -5.6);
    const caveRidge = z > 0.35 && z < 6.45 && x < riverX(z) - 5.5;
    if (!(behindVillage || side || caveRidge) || !isLand(x, z)) continue;
    if (Math.abs(x - riverX(z)) < riverWidth(z) + 0.9) continue;
    if (forests.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.28)) continue;
    forests.push([x, z]);
    addShadeTree(x, z, between(0.34, behindVillage ? 0.91 : x > 6 ? 0.64 : 1.03));
  }

  for (const [cx, cz, population] of [[12.3, -16, 37], [14.2, -12.85, 26], [-11.75, -11.5, 16]]) {
    for (let i = 0; i < population; i++) {
      addBamboo(cx + between(-1.57, 1.57), cz + between(-1.27, 1.27), between(1.75, 3.67));
    }
  }

  for (let i = 0; i < 4500; i++) {
    const x = between(-18, 18), z = between(-21, 21);
    if (!isLand(x, z)) continue;
    if (x > -8 && x < 13 && z < -2.17 && z > -15.9 && random() < 0.78) continue;
    const y = landHeight(x, z);
    const size = between(0.085, 0.22);
    for (let blade = 0; blade < 3; blade++) {
      leafAt(vector(x + between(-0.11, 0.11), y - 0.005, z + between(-0.11, 0.11)),
        size * between(0.65, 1.25), between(0, 0.55));
    }
    if (i % 13 === 0 && z > 4.5) {
      add(blossoms, vector(x, y + size * 0.7, z), vector(0.039, 0.049, 0.039),
        between(0, TAU), new THREE.Color('#f7cf7d'));
    }
  }

  for (let i = 0; i < 110; i++) {
    const z = between(cave.back + 0.15, cave.front - 0.07);
    const a = between(0.37, 2.76);
    const p = archPoint(z, a, 1);
    if (i % 4 === 0) addRock(p.x, p.z, between(0.25, 0.76), p.y - 0.08);
    if (i % 5 === 0) {
      const size = between(0.13, 0.36);
      add(distantFoliage, p.clone().add(vector(0, 0.04, 0)), vector(size, size * 0.55, size), a, pick(leaf));
    }
    for (let j = 0; j < 3; j++) {
      leafAt(p.clone().add(vector(between(-0.09, 0.09), 0.02, between(-0.08, 0.08))),
        between(0.12, 0.39), between(0.02, 0.49));
    }
  }

  render(stone, true);
  render(stems, true);
  render(distantFoliage, true);
  const grass = render(leafBlades, false);
  const grassColor = grass.material.color.clone();
  const dryGrass = new THREE.Color('#b7a493');
  const flowers = render(blossoms, true);
  const snowyRocks = render(stoneSnow, true);
  snowyRocks.visible = false;
  const peaches = peachBuilder.finish();
  const broadleaves = leafyBuilder.finish();
  occluders.push(...peaches.occluders, ...broadleaves.occluders);
  return {
    stats: { peaches: peaches.stats, broadleaves: broadleaves.stats },
    update(time, winter, night, camera) {
      flowers.visible = winter < .5;
      snowyRocks.visible = winter >= .5;
      grass.material.color.copy(grassColor).lerp(dryGrass, winter);
      peaches.update(time, winter, night, camera);
      broadleaves.update(time, winter, night);
    },
  };
}

function sunbeams(scene) {
  const uniforms = { daylight: { value: 1 }, time: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 beamUv;
      varying vec3 beamNormal;
      varying vec3 beamView;
      void main() {
        beamUv = uv;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        beamView = normalize(-view.xyz);
        beamNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform float daylight;
      uniform float time;
      varying vec2 beamUv;
      varying vec3 beamNormal;
      varying vec3 beamView;
      void main() {
        float spread = pow(clamp(dot(normalize(beamView), normalize(beamNormal)), 0.0, 1.0), 1.55);
        float ends = smoothstep(0.0, 0.32, beamUv.y) * (1.0 - smoothstep(0.77, 1.0, beamUv.y));
        float dust = 0.83 + 0.17 * sin(beamUv.y * 18.0 - time * 0.32 + beamUv.x * 6.28);
        gl_FragColor = vec4(1.0, 0.85, 0.58, ends * spread * dust * daylight * 0.22);
      }`,
  });
  const direction = vector(-22, 29, 15).normalize();
  const endpoints = [
    [riverX(14.8) - 0.55, 14.8, 5.21, 0.82],
    [riverX(16.2) - 1.07, 16.2, 4.46, 0.55],
    [riverX(11.5) + 0.40, 11.5, 5.5, 0.73],
    [riverX(5.8) + riverWidth(5.8) * 0.26, 5.8, 3.6, 0.75],
  ];
  for (const [x, z, height, width] of endpoints) {
    const floor = vector(x, Math.max(0.04, landHeight(x, z)) + 0.13, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, width, height, 16, 1, true), material);
    shaft.position.copy(floor.addScaledVector(direction, height / 2));
    shaft.quaternion.setFromUnitVectors(UP, direction);
    shaft.renderOrder = 4;
    scene.add(shaft);
  }
  return (time, winter, night) => {
    uniforms.time.value = time;
    uniforms.daylight.value = (1 - night) * (1 - 0.45 * winter);
  };
}

function groveMotion(scene) {
  const plumage = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, vertexColors: true });
  const dark = new THREE.Color('#344652');
  const navy = new THREE.Color('#4c656e');
  const cream = new THREE.Color('#e6d4bd');
  const rust = new THREE.Color('#986d48');
  const body = surfaceGeometry([
    0, 0, .28, -.088, .035, .04, .088, .035, .04, 0, .105, .055, 0, -.066, .035,
    -.043, .006, -.19, .043, .006, -.19, -.101, -.028, -.35, 0, -.021, -.236, .105, -.028, -.35,
  ], [rust, dark, dark, navy, cream, dark, dark, dark, navy, dark].flatMap((c) => [c.r, c.g, c.b]),
  [0, 1, 3, 0, 3, 2, 0, 2, 4, 0, 4, 1, 1, 5, 3, 3, 5, 6, 3, 6, 2,
    4, 2, 6, 4, 6, 5, 4, 5, 1, 5, 7, 8, 5, 8, 6, 6, 8, 9]);
  const wings = [-1, 1].map((side) => surfaceGeometry([
    0, 0, .06, .19 * side, .025, .086, .48 * side, -.053, -.09, .60 * side, -.076, -.25,
    .29 * side, -.034, -.127, .13 * side, 0, -.15,
  ], [dark, navy, dark, dark, navy, cream].flatMap((c) => [c.r, c.g, c.b]),
  [0, 1, 5, 1, 4, 5, 1, 2, 4, 2, 3, 4]));
  const birds = [0, 1].map((i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, plumage));
    const moving = wings.map((geometry) => new THREE.Mesh(geometry, plumage));
    group.add(...moving);
    group.scale.setScalar(i ? 0.82 : 1);
    scene.add(group);
    return { group, moving };
  });
  const petalGeometry = surfaceGeometry([
    0, .005, -.065, -.042, 0, -.014, -.039, .021, .045, .003, .037, .066,
    .042, .002, .039, .039, .011, -.017, 0, -.008, .015,
  ], [], [0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6]);
  const petals = new THREE.InstancedMesh(petalGeometry, new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.88,
  }), 58);
  petals.frustumCulled = false;
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const random = seeded(76124);
  const pink = new THREE.Color('#f1b5bf');
  const ivory = new THREE.Color('#ffdfd4');
  const trajectories = Array.from({ length: petals.count }, (_, i) => {
    const z = 7.5 + random() * 12.6;
    const bank = i % 2 ? -1 : 1;
    const x = riverX(z) + bank * (riverWidth(z) + .7 + random() * 4);
    const y = Math.max(0.28, landHeight(x, z) + .14);
    petals.setColorAt(i, pink.clone().lerp(ivory, random()));
    return { x, y, z, float: random() * 12, speed: .23 + random() * .25 };
  });
  scene.add(petals);
  const matrix = new THREE.Object3D();
  const future = new THREE.Vector3();
  return (time, winter) => {
    for (let i = 0; i < birds.length; i++) {
      const { group, moving } = birds[i];
      const phase = time * (i ? .48 : .35) + i * 1.74;
      const center = -5.1 + i * 3.27;
      const height = 3.7 + i * 1.05;
      group.position.set(center + Math.cos(phase) * 3.1, height + Math.sin(phase * 2.03) * .4, 12.5 + Math.sin(phase) * 4.1);
      future.set(center + Math.cos(phase + .11) * 3.1, height + Math.sin((phase + .11) * 2.03) * .4,
        12.5 + Math.sin(phase + .11) * 4.1);
      group.lookAt(future);
      const flap = Math.sin(time * (i ? 21 : 19) + i * 1.9) * .55 * (.62 + .38 * Math.sin(phase * 1.75));
      moving[0].rotation.z = -flap;
      moving[1].rotation.z = flap;
    }
    petals.visible = winter < .5;
    if (!petals.visible) return;
    trajectories.forEach(({ x, y, z, float, speed }, i) => {
      const drop = (time * speed + float) % 3.1;
      matrix.position.set(x + drop * .29 + Math.sin(float + time * 1.18) * .36,
        y + 3.14 - drop, z - drop * .16 + Math.cos(float + time * .82) * .21);
      matrix.rotation.set(float + time * 1.5, time * .42 + i, time + i * .33);
      matrix.scale.setScalar(.58 + .47 * Math.min(1, (3.1 - drop) * 2.4));
      matrix.updateMatrix();
      petals.setMatrixAt(i, matrix.matrix);
    });
    petals.instanceMatrix.needsUpdate = true;
  };
}

export function createTerrain(scene) {
  const season = { value: 0 };
  const occluders = ridgeSurface(scene, season);
  occluders.push(tunnelMesh(scene, season));
  const plants = populate(scene, occluders, season);
  const updateBeams = sunbeams(scene);
  const updateMotion = groveMotion(scene);
  return {
    occluders,
    stats: plants.stats,
    update(time, winter, night, camera) {
      season.value = winter;
      plants.update(time, winter, night, camera);
      updateBeams(time, winter, night);
      updateMotion(time, winter);
    },
  };
}
