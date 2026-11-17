import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isLand, landHeight, riverWidth, riverX, seeded } from './world.js';

const colors = {
  boards: [0x705138, 0x8b6946, 0x9b7751, 0x795c41, 0xa07b50],
  thatch: [0xc5ab74, 0xb79a63, 0xaf915d, 0xa58b5d, 0xcab781, 0xd3bc87, 0x998154],
  plaster: [0xccae7d, 0xd5bb8e, 0xd8bf94, 0xc3a67b, 0xbea077],
  stone: [0x766c55, 0x8a7e64, 0x8a806b, 0xa79a7b, 0x75725e],
  leaves: [0x667d39, 0x738b42, 0x8c9c4a, 0x4f6a33, 0x849449],
  earth: [0x8c6a46, 0x9d7a4e, 0xa17e55, 0x956f48],
};

const axes = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const identity = new THREE.Quaternion();

function surfaceMaps(kind, seed) {
  const random = seeded(seed);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind === 'clay' ? '#e8e2d6' : '#e7decc';
  ctx.fillRect(0, 0, size, size);
  if (kind === 'clay') {
    for (let i = 0; i < 80; i++) {
      const x = random() * size, y = random() * size;
      const radius = 12 + random() * 96;
      const cloud = ctx.createRadialGradient(x, y, 1, x, y, radius);
      cloud.addColorStop(0, `rgba(119,104,80,${.03 + random() * .11})`);
      cloud.addColorStop(1, 'rgba(119,104,80,0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 7500; i++) {
      const light = random() > .62;
      ctx.fillStyle = light ? 'rgba(255,251,231,.37)' : 'rgba(81,69,49,.12)';
      const radius = .25 + random() * .7;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, radius, radius * .64, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Small embedded straw fragments break up the fine clay grain.
    for (let i = 0; i < 190; i++) {
      const x = random() * size, y = random() * size;
      ctx.strokeStyle = 'rgba(131,113,80,.20)';
      ctx.lineWidth = .6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 7 - 3.5, y + random() * 5 - 2.5);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 700; i++) {
      const x = random() * size;
      const y = random() * size;
      const length = 25 + random() * 260;
      const amplitude = kind === 'wood' ? 2.2 + random() * 6 : .6;
      ctx.strokeStyle = random() > .3 ? `rgba(68,49,30,${.035 + random() * .18})` : 'rgba(255,248,222,.46)';
      ctx.lineWidth = .3 + random() * 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + amplitude, y + length * .3, x - amplitude * .7, y + length * .7, x + .2, y + length);
      ctx.stroke();
    }
    if (kind === 'wood') {
      for (let knot = 0; knot < 5; knot++) {
        const x = 45 + random() * 420, y = 50 + random() * 390;
        for (let ring = 1; ring < 7; ring++) {
          ctx.strokeStyle = `rgba(77,53,30,${.19 - ring * .017})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(x, y, 1.5 + ring * 1.5, 3 + ring * 4.3, .12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.anisotropy = 8;
  return { map: texture, bumpMap: bump, bumpScale: kind === 'clay' ? .018 : .012 };
}

// One loose bunch of fine tapered fibers, reused across every roof slope.
function thatchGeometry() {
  const random = seeded(77461);
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    const fiber = new THREE.CylinderGeometry(.085, .13, 1, 3, 2, true);
    const position = fiber.getAttribute('position');
    const across = (i / 5 - .5) * 1.65;
    const stagger = random() * .16;
    for (let j = 0; j < position.count; j++) {
      const t = position.getY(j) + .5;
      position.setXYZ(j,
        position.getX(j) + across + .09 * Math.sin(t * 3.8 + i),
        position.getY(j) * (1 + stagger) - stagger * .35,
        position.getZ(j) * .55 + .07 * Math.sin(i * 2.1) + .10 * Math.sin(t * Math.PI));
    }
    fiber.computeVertexNormals();
    pieces.push(fiber);
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

function meshFromVertices(positions, faces, vertexColors, uv) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (vertexColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  if (uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function transformAt(x, y, z, angle) {
  const rotation = q(0, angle, 0);
  const origin = v(x, y, z);
  return { rotation, point: (a, b, c) => v(a, b, c).applyQuaternion(rotation).add(origin) };
}

export function createVillage(scene) {
  const group = new THREE.Group();
  group.name = '村落与田畦';
  scene.add(group);
  const rng = seeded(728193);
  const between = (a, b) => a + (b - a) * rng();
  const pick = (array) => array[Math.floor(rng() * array.length)];
  const geom = {
    box: new THREE.BoxGeometry(1, 1, 1),
    rod: new THREE.CylinderGeometry(1, 1, 1, 6),
    thatch: thatchGeometry(),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    ring: new THREE.TorusGeometry(1, .16, 5, 12),
    ball: new THREE.SphereGeometry(1, 9, 6),
    stone: new THREE.IcosahedronGeometry(1, 1),
    leaf: new THREE.SphereGeometry(1, 7, 5),
    pot: new THREE.LatheGeometry([
      [0, 0], [0.68, 0], [0.85, 0.12], [1, 0.42], [0.95, 0.64], [0.7, 0.79],
      [0.61, 0.87], [0.73, 0.91], [0.72, 0.99], [0.56, 0.99], [0.54, 0.76],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 11),
  };
  const plain = new THREE.MeshStandardMaterial({ roughness: 0.89 });
  const wood = new THREE.MeshStandardMaterial({ roughness: 0.93, ...surfaceMaps('wood', 813) });
  const clay = new THREE.MeshStandardMaterial({ roughness: 0.99, ...surfaceMaps('clay', 972) });
  const straw = new THREE.MeshStandardMaterial({ roughness: 0.97, ...surfaceMaps('straw', 237) });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xe1eaf0, roughness: 0.91 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x503525, emissive: 0xffab53, emissiveIntensity: 0 });
  const lantern = new THREE.MeshStandardMaterial({ color: 0xcf6737, emissive: 0xff802c, emissiveIntensity: 0 });
  const dirt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8d724c, map: straw.map, bumpMap: straw.bumpMap, bumpScale: .027, roughness: 1, side: THREE.DoubleSide });
  const gableMaterial = new THREE.MeshStandardMaterial({ color: 0xb99b72, map: clay.map, bumpMap: clay.bumpMap, bumpScale: .018, roughness: 1, side: THREE.DoubleSide });
  const patchesMaterial = new THREE.MeshStandardMaterial({ color: 0xcad8de, roughness: 1, side: THREE.DoubleSide });
  const batches = new Map();
  const occluders = [];
  const snow = [];
  const crops = [];
  const lights = [];

  function instance(shape, material, position, size, color, rotation = identity, shadow = true, layer = 'static') {
    const key = `${shape}:${material.id}:${shadow}:${layer}`;
    if (!batches.has(key)) batches.set(key, { shape, material, rows: [], shadow, layer });
    batches.get(key).rows.push({ position, size, color, rotation });
  }

  function box(position, size, color, rotation = identity, material = wood, layer = 'static') {
    instance('box', material, position, size, color, rotation, layer !== 'snow', layer);
  }

  function stick(a, b, radius, color, material = wood, layer = 'static', shadow = true) {
    const direction = b.clone().sub(a);
    const rotation = new THREE.Quaternion().setFromUnitVectors(axes, direction.clone().normalize());
    const shape = material === straw && layer === 'static' ? 'thatch' : 'rod';
    instance(shape, material, a.clone().lerp(b, 0.5), v(radius, direction.length(), radius), color, rotation, shadow, layer);
  }

  function actual(geometry, material, shadow = true, parent = group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function hiddenBox(position, size, rotation) {
    const mesh = new THREE.Mesh(geom.box, plain);
    mesh.position.copy(position);
    mesh.scale.copy(size);
    mesh.quaternion.copy(rotation);
    mesh.updateMatrixWorld();
    occluders.push(mesh);
  }

  function path(points, width, border = false) {
    const spline = new THREE.CatmullRomCurve3(points.map(([x, z]) => v(x, 0, z)));
    const count = Math.max(10, Math.ceil(spline.getLength() * 6));
    const positions = [];
    const indices = [];
    const rowColors = [];
    const color = new THREE.Color();
    const columns = border ? 6 : 10;
    for (let i = 0; i <= count; i++) {
      const p = spline.getPoint(i / count);
      const tangent = spline.getTangent(i / count);
      const jitter = 0.85 + Math.sin(i * 1.13) * 0.09 + Math.sin(i * 0.17) * 0.12;
      for (let j = 0; j <= columns; j++) {
        const side = (2 * j / columns - 1) * width * jitter;
        const x = p.x + tangent.z * side;
        const z = p.z - tangent.x * side;
        positions.push(x, landHeight(x, z) + 0.043 + Math.sin(Math.PI * j / columns) * 0.013, z);
        const edge = j === 0 || j === columns;
        color.set(edge ? 0x9a8d58 : border ? 0xa58b60 : pick([0xb29566, 0xb59a6d, 0xc1a678, 0xb79e6f])).multiplyScalar(between(0.88, 1.05));
        rowColors.push(color.r, color.g, color.b);
        if (i > 0 && j > 0) {
          const k = i * (columns + 1) + j;
          indices.push(k, k - 1, k - columns - 1, k - 1, k - columns - 2, k - columns - 1);
        }
      }
    }
    actual(meshFromVertices(positions, indices, rowColors), dirt, false);
  }

  function fittedFence(from, to, options = {}) {
    const [x0, z0] = from;
    const [x1, z1] = to;
    const count = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.62);
    const height = options.height || 0.54;
    let previous;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = THREE.MathUtils.lerp(x0, x1, t);
      const z = THREE.MathUtils.lerp(z0, z1, t);
      if (!isLand(x, z)) {
        previous = undefined;
        continue;
      }
      const bottom = v(x, landHeight(x, z) - 0.03, z);
      const top = bottom.clone().add(v(between(-0.04, 0.04), height * between(0.94, 1.1), between(-0.04, 0.04)));
      stick(bottom, top, 0.033, pick(colors.boards));
      instance('ball', snowMaterial, top.clone().add(v(0, 0.016, 0)), v(0.039, 0.024, 0.039), 0xeaf3f6, identity, false, 'snow');
      if (previous) {
        for (const level of [0.31, 0.73]) {
          const a = previous[0].clone().lerp(previous[1], level);
          const b = bottom.clone().lerp(top, level);
          stick(a, b, 0.019, pick(colors.boards));
          stick(a.add(v(0, 0.018, 0)), b.add(v(0, 0.018, 0)), 0.018, 0xf8fcff, snowMaterial, 'snow', false);
        }
        if (i % 2 === 0) stick(previous[0].clone().lerp(previous[1], 0.28), bottom.clone().lerp(top, 0.77), 0.017, 0xaa8756);
      }
      previous = [bottom, top];
    }
  }

  function addLight(point, distance, power) {
    const light = new THREE.PointLight(0xffaa53, 0, distance, 2);
    light.position.copy(point);
    group.add(light);
    lights.push({ light, power, phase: between(0, 6.3) });
  }

  function basket(position, radius, height, color = 0xa47b44) {
    const top = position.clone().add(v(0, height, 0));
    instance('pot', clay, position, v(radius, height, radius), color);
    for (let j = 0; j < 5; j++) {
      const y = height * (0.29 + j * 0.13);
      const band = radius * (j === 4 ? 0.76 : 0.9 + 0.07 * Math.sin(j));
      instance('cylinder', plain, position.clone().add(v(0, y, 0)), v(band, 0.014, band), j % 2 ? 0x826241 : 0xb28c55);
    }
    const a = top.clone().add(v(-radius * 0.56, 0, 0));
    const b = top.clone().add(v(0, radius * 0.76, 0));
    const c = top.clone().add(v(radius * 0.56, 0, 0));
    stick(a, b, 0.015, 0xb18c55);
    stick(b, c, 0.015, 0xb18c55);
  }

  function addLantern(pos, size) {
    instance('ball', lantern, pos, v(size, size * 1.18, size), 0xffffff, identity, false);
    for (const side of [-1, 1]) instance('cylinder', wood, pos.clone().add(v(0, side * size * 1.11, 0)), v(size * 0.72, size * 0.29, size * 0.72), 0x513a2b);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const offset = v(Math.cos(a) * size * 0.94, 0, Math.sin(a) * size * 0.94);
      stick(pos.clone().add(offset).add(v(0, -size * 0.61, 0)), pos.clone().add(offset).add(v(0, size * 0.61, 0)), size * 0.065, 0xd19156);
    }
    stick(pos.clone().add(v(0, size, 0)), pos.clone().add(v(0, size * 2, 0)), size * 0.072, 0x4c3927);
  }

  function house({ x, z, width, depth, height, angle, lit = false, porch = false }) {
    const w = width / 2;
    const d = depth / 2;
    const flat = transformAt(x, 0, z, angle);
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([a, b]) => flat.point(a, 0, b));
    if (corners.some((p) => !isLand(p.x, p.z))) return;
    const highest = Math.max(...corners.map((p) => landHeight(p.x, p.z)), landHeight(x, z));
    const lowest = Math.min(...corners.map((p) => landHeight(p.x, p.z)));
    const y = highest + 0.13;
    const { rotation, point } = transformAt(x, y, z, angle);
    const localBox = (a, b, c, sx, sy, sz, color, material = wood, layer = 'static') => box(point(a, b, c), v(sx, sy, sz), color, rotation, material, layer);
    const localStick = (a, b, radius, color, material = wood, layer = 'static', shadow = true) => stick(point(...a), point(...b), radius, color, material, layer, shadow);
    const plinth = y - lowest + 0.05;
    localBox(0, -plinth / 2, 0, width + 0.11, plinth, depth + 0.11, 0x8c7e66, clay);
    localBox(0, height / 2, 0, width, height, depth, pick(colors.plaster), clay);
    hiddenBox(point(0, height / 2, 0), v(width, height, depth), rotation);

    for (const side of [-1, 1]) {
      for (let i = 0; i <= Math.ceil(width / 0.22); i++) {
        const a = -w + i * width / Math.ceil(width / 0.22);
        instance('stone', clay, point(a, -0.08, d * side), v(between(0.115, 0.18), between(0.075, 0.11), 0.083), pick(colors.stone), q(between(-0.3, 0.3), between(0, 6), 0));
      }
      for (let i = 0; i <= Math.ceil(depth / 0.24); i++) {
        const b = -d + i * depth / Math.ceil(depth / 0.24);
        instance('stone', clay, point(w * side, -0.08, b), v(0.083, between(0.065, 0.12), between(0.11, 0.17)), pick(colors.stone), q(0, between(-0.4, 0.4), 0));
      }
      for (const level of [0.11, height * 0.46, height * 0.94]) {
        localBox(0, level, side * (d + 0.025), width + 0.1, 0.078, 0.078, pick(colors.boards));
        localBox(side * (w + 0.02), level, 0, 0.078, 0.078, depth, pick(colors.boards));
      }
      for (const post of [-w, -w * 0.46, w * 0.46, w]) localBox(post, height * 0.49, side * (d + 0.048), 0.112, height + 0.10, 0.111, pick(colors.boards));
      for (const post of [-d, -d * 0.32, d * 0.38, d]) localBox(side * (w + 0.041), height * 0.49, post, 0.1, height + 0.1, 0.078, pick(colors.boards));
      for (const post of [-w, -w * .46, w * .46, w]) {
        for (const level of [height * .46, height * .94]) {
          instance('cylinder', wood, point(post, level, side * (d + .111)), v(.018, .016, .018),
            0x4c392a, rotation.clone().multiply(q(Math.PI / 2, 0, 0)), false);
        }
      }
    }

    function windowAt(a, h, side, span = 0.49, windowHeight = 0.54) {
      const faceZ = side * (d + 0.065);
      localBox(a, h, faceZ, span + 0.08, windowHeight + 0.065, 0.03, 0x573c25);
      localBox(a, h, faceZ + side * 0.023, span, windowHeight, 0.035, 0xffffff, glow);
      for (let j = 0; j < 5; j++) localBox(a + span * (j / 4 - 0.5), h, faceZ + side * 0.045, 0.029, windowHeight + 0.014, 0.03, 0x765638);
      for (let j = 0; j < 3; j++) localBox(a, h + windowHeight * (j / 2 - 0.5), faceZ + side * 0.051, span + 0.05, 0.035, 0.035, 0x8c6943);
      localBox(a, h - windowHeight / 2 - 0.025, faceZ + side * 0.08, span + 0.16, 0.068, 0.13, 0xa18152);
    }

    windowAt(-w * 0.76, height * 0.61, 1, width * 0.15);
    windowAt(w * 0.75, height * 0.61, 1, width * 0.15);
    windowAt(-w * 0.5, height * 0.61, -1, width * 0.15, 0.43);
    windowAt(w * 0.5, height * 0.61, -1, width * 0.15, 0.43);
    for (const side of [-1, 1]) {
      const x = side * (w + 0.05);
      const base = height * 0.64;
      const span = depth * 0.31;
      localBox(x, base, 0.05, 0.058, 0.51, span + 0.1, 0x523b29);
      localBox(x + side * 0.033, base, 0.05, 0.024, 0.446, span, 0xffffff, glow);
      for (let j = 0; j < 5; j++) localBox(x + side * 0.055, base, 0.05 + span * (j / 4 - 0.5), 0.053, 0.49, 0.042, 0x765638);
      for (const offset of [-0.228, 0, 0.22]) localBox(x + side * 0.065, base + offset, 0.05, 0.065, 0.042, span + 0.057, 0x98774d);
      localBox(x + side * 0.073, base - 0.249, 0.05, 0.14, 0.06, span + 0.16, 0xa18558);
    }

    const entry = porch ? 0.1 : -0.05;
    const doorH = height * 0.85;
    localBox(entry, doorH * 0.5, d + 0.049, 0.72, doorH, 0.046, 0x423025);
    for (let i = 0; i < 5; i++) localBox(entry - 0.265 + i * 0.13, doorH * 0.53, d + 0.074, 0.122, doorH * 0.90, 0.038, pick(colors.boards));
    for (const a of [-0.36, 0.36]) localBox(entry + a, doorH * 0.48, d + 0.09, 0.076, doorH * 1.03, 0.081, 0x78583a);
    localBox(entry, doorH, d + 0.096, 0.8, 0.088, 0.087, 0x9f7747);
    localBox(entry, 0.042, d + 0.17, 0.83, 0.088, 0.34, 0x978870, clay);
    instance('ball', plain, point(entry + 0.14, doorH * 0.49, d + 0.11), v(0.036, 0.032, 0.023), 0x413025);
    instance('ring', plain, point(entry + .14, doorH * .455, d + .139), v(.036, .045, .036), 0x544a39, rotation, false);
    for (const level of [.24, .75]) {
      localBox(entry - .235, doorH * level, d + .103, .12, .036, .012, 0x584c3b, plain);
      for (const a of [-.277, -.198]) {
        instance('ball', plain, point(entry + a, doorH * level, d + .114), v(.009, .009, .006), 0x85735a, rotation, false);
      }
    }
    for (let i = 1; i <= 3; i++) {
      const step = point(entry, 0, d + 0.18 + i * 0.17);
      const floor = landHeight(step.x, step.z);
      const stepTop = Math.max(floor + 0.047, y + 0.045 - i * (Math.max(0.09, (y - floor) / 3)));
      box(v(step.x, (floor + stepTop) / 2, step.z), v(0.86 + i * 0.07, stepTop - floor + 0.03, 0.23), pick(colors.stone), rotation, clay);
    }

    function roof(centerX, centerZ, roofW, run, eave, rise, lean = false) {
      const half = roofW / 2;
      const profile = (t) => eave + rise * (t * 0.82 + t * t * 0.18);
      for (const side of lean ? [1] : [-1, 1]) {
        const slices = 18;
        const verts = [];
        const faces = [];
        const uv = [];
        const snowVerts = [];
        const snowFaces = [];
        for (let i = 0; i <= slices; i++) {
          const a = centerX + roofW * (i / slices - 0.5);
          const drift = Math.sin(i * 2.64) * 0.034 + Math.sin(i * 0.61) * 0.044;
          const edge = 0.14 + 0.085 * Math.sin(i * 1.52) + 0.06 * Math.sin(i * 0.55);
          for (let j = 0; j <= 6; j++) {
            const t = j / 6;
            const c = centerZ + side * ((1 - t) * run + (1 - t) * drift);
            const p = point(a, profile(t) - 0.017, c);
            verts.push(...p);
            uv.push(i / slices * roofW * 1.8, t * run);
            const snowyT = THREE.MathUtils.lerp(edge, 1, t);
            const snowyZ = centerZ + side * ((1 - snowyT) * run + (1 - snowyT) * drift);
            const s = point(a * 0.978 + centerX * 0.022, profile(snowyT) + 0.088 + 0.048 * Math.sin(t * Math.PI / 2) + drift * 0.10, snowyZ);
            snowVerts.push(...s);
            if (i > 0 && j > 0) {
              const k = i * 7 + j;
              faces.push(k, k - 1, k - 7, k - 1, k - 8, k - 7);
              snowFaces.push(k, k - 1, k - 7, k - 1, k - 8, k - 7);
            }
          }
        }
        const shell = actual(meshFromVertices(verts, faces, undefined, uv), roofMaterial);
        occluders.push(shell);
        snow.push(actual(meshFromVertices(snowVerts, snowFaces), patchesMaterial, false));
        const bundles = Math.ceil(roofW / 0.046);
        for (let i = 0; i <= bundles; i++) {
          const a = centerX + roofW * (i / bundles - 0.5) + between(-0.019, 0.018);
          const offset = between(-0.043, 0.043);
          const r = between(0.028, 0.039);
          for (let j = 0; j < 4; j++) {
            const t0 = j / 4 - between(0.018, 0.049);
            const t1 = (j + 1) / 4 + between(0.035, 0.074);
            const lift = .042 + j * .007;
            const tint = pick(colors.thatch);
            localStick([a, profile(t0) + lift, centerZ + side * ((1 - t0) * run + offset)],
              [a + between(-0.018, 0.018), profile(t1) + lift * .7, centerZ + side * ((1 - t1) * run + offset / 2)], r, tint, straw, 'static', false);
          }
          // Loose cut ends below the compact bundles give the eaves a soft edge.
          if (i % 2 === 0) {
            localStick([a, profile(.075) - .023, centerZ + side * run * .92],
              [a + between(-.024, .024), eave - between(.072, .135), centerZ + side * (run + between(.013, .086))],
              .026, pick(colors.thatch), straw, 'static', false);
          }
        }
        localStick([centerX - half, profile(0.09) - 0.055, centerZ + side * run * 0.91],
          [centerX + half, profile(0.09) - 0.055, centerZ + side * run * 0.91], 0.047, 0x86643c);
        for (let t = 0; t < 4; t++) {
          const a = centerX + roofW * (t / 3 - 0.5) * 0.91;
          localStick([a, profile(0) - 0.085, centerZ + side * run * 0.99], [a, profile(1) - 0.12, centerZ], 0.036, 0x896842);
        }
      }
      localStick([centerX - half - 0.06, eave + rise + 0.024, centerZ],
        [centerX + half + 0.06, eave + rise + 0.024, centerZ], 0.072, 0x80613b);
      const ridgeCount = Math.ceil(roofW / .065);
      for (let i = 0; i <= ridgeCount; i++) {
        const a = centerX + roofW * (i / ridgeCount - .5);
        for (const side of [-1, 1]) {
          localStick([a, eave + rise + .095, centerZ],
            [a + between(-.025, .025), eave + rise - .066, centerZ + side * between(.15, .21)],
            .039, pick(colors.thatch), straw, 'static', false);
        }
      }
      for (let i = 0; i < 6; i++) {
        const a = centerX + roofW * (i / 5 - 0.5) * 0.97;
        const b = [a + 0.06, eave + rise + 0.17, centerZ];
        localStick([a - 0.09, eave + rise - 0.015, centerZ - 0.16], b, 0.022, 0x80633e);
        localStick([a - 0.09, eave + rise - 0.015, centerZ + 0.16], b, 0.022, 0xa68756);
      }
    }

    const rise = Math.max(0.82, d * 0.72);
    const gables = [];
    for (const side of [-1, 1]) {
      for (const p of [point(w * side, height - 0.04, -d), point(w * side, height + rise * 0.74, 0), point(w * side, height - 0.04, d)]) gables.push(...p);
      localStick([side * (w + 0.035), height - 0.04, -d], [side * (w + 0.035), height + rise * 0.86, 0], 0.065, 0x78583a);
      localStick([side * (w + 0.035), height - 0.04, d], [side * (w + 0.035), height + rise * 0.86, 0], 0.065, 0x86613c);
      localStick([side * (w + 0.034), height - 0.04, 0], [side * (w + 0.034), height + rise * 0.86, 0], 0.052, 0x6c5035);
      for (const a of [-0.45, 0.45]) localStick([side * (w + 0.032), height - 0.04, a], [side * (w + 0.032), height + rise * 0.51, a], 0.029, 0x8a6944);
    }
    actual(meshFromVertices(gables, [0, 1, 2, 3, 4, 5], undefined, [0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0]), gableMaterial);
    roof(0, 0, width + 0.55, d + 0.39, height - 0.045, rise);

    if (porch) {
      const centerX = -w * 0.38;
      const porchWidth = w * 1.44;
      const depth = 0.83;
      roof(centerX, d + 0.01, porchWidth, depth, height * 0.72, height * 0.27, true);
      for (const a of [centerX - porchWidth * 0.42, centerX + porchWidth * 0.43]) {
        const post = point(a, 0, d + depth * 0.88);
        const base = landHeight(post.x, post.z);
        stick(v(post.x, base - 0.04, post.z), point(a, height * 0.75, d + depth * 0.88), 0.055, 0x765937);
      }
      localBox(centerX, height * 0.69, d + depth * 0.82, porchWidth, 0.093, 0.083, 0x795b3b);
      for (let j = 0; j < 16; j++) {
        const a = -w * 0.76 + (j % 6) * 0.105 + between(-0.025, 0.025);
        const c = d + 0.17;
        const log = point(a, 0, c);
        const base = landHeight(log.x, log.z) - y + 0.07 + Math.floor(j / 6) * 0.088;
        localStick([a, base, c], [a, base + between(-0.025, 0.025), c + between(0.32, 0.55)], between(0.049, 0.067), pick(colors.boards));
        const cap = point(a, base, c + 0.47);
        instance('rod', plain, cap, v(0.05, 0.017, 0.05), 0xc29356, rotation.clone().multiply(q(Math.PI / 2, 0, 0)), false);
      }
    }

    for (let i = 0; i < 3; i++) {
      const p = point(w * (0.59 + 0.16 * i), 0, d + 0.37 + i % 2 * 0.2);
      p.y = landHeight(p.x, p.z);
      if (i === 1) basket(p, 0.15, 0.26);
      else instance('pot', clay, p, v(0.14 + i * 0.037, 0.28 + i * 0.028, 0.14 + i * 0.037), i === 0 ? 0x9f6845 : 0x7a5a3d);
    }
    if (lit) {
      const p = point(entry + 0.48, height * 0.82, d + 0.31);
      addLantern(p, 0.105);
      addLight(p.clone().add(v(0, -0.11, 0.11)), 4.2, 13.5);
    }
  }

  const houses = [
    { x: -1.7, z: -10.8, width: 3.75, depth: 2.55, height: 1.75, angle: -0.09, porch: true, lit: true },
    { x: -6.9, z: -9.4, width: 3.46, depth: 2.35, height: 1.55, angle: 0.16, porch: true },
    { x: -6.6, z: -12.8, width: 3.15, depth: 2.15, height: 1.61, angle: 0.11 },
    { x: 2.95, z: -12.7, width: 2.78, depth: 2.05, height: 1.47, angle: -0.16, porch: true },
    { x: 10.9, z: -9.55, width: 3.27, depth: 2.39, height: 1.62, angle: 0.12, porch: true, lit: true },
    { x: 12.75, z: -12.65, width: 2.74, depth: 2.0, height: 1.48, angle: -0.13 },
  ];
  houses.forEach(house);

  const bridgeZ = -8;
  const bridgeX = riverX(bridgeZ);
  const bridgeHalf = riverWidth(bridgeZ) + 0.65;
  const leftX = bridgeX - bridgeHalf;
  const rightX = bridgeX + bridgeHalf;
  const deckHalf = 0.66;
  const leftY = Math.max(0.38, landHeight(leftX - 0.06, bridgeZ) + 0.12);
  const rightY = Math.max(0.38, landHeight(rightX + 0.06, bridgeZ) + 0.12);
  const deck = (x) => {
    const t = (x - leftX) / (rightX - leftX);
    return THREE.MathUtils.lerp(leftY, rightY, t) + 0.57 * Math.sin(t * Math.PI);
  };
  const planks = Math.ceil((rightX - leftX) / 0.125);
  for (let i = 0; i < planks; i++) {
    const x = THREE.MathUtils.lerp(leftX, rightX, (i + 0.5) / planks);
    const pitch = Math.atan2(deck(x + 0.01) - deck(x - 0.01), 0.02);
    box(v(x, deck(x), bridgeZ + between(-0.013, 0.012)), v((rightX - leftX) / planks - 0.005, 0.079, 2 * deckHalf + between(0.014, 0.04)), pick(colors.boards), q(0, 0, pitch));
    hiddenBox(v(x, deck(x), bridgeZ), v((rightX - leftX) / planks, 0.085, 2 * deckHalf + 0.035), q(0, 0, pitch));
  }
  const railZ = [bridgeZ - deckHalf + 0.04, bridgeZ + deckHalf - 0.04];
  for (const z of railZ) {
    const railSections = 10;
    let previous;
    for (let i = 0; i <= railSections; i++) {
      const x = THREE.MathUtils.lerp(leftX, rightX, i / railSections);
      const y = deck(x);
      const top = y + 0.51;
      if (i % 2 === 0) {
        box(v(x, y + 0.22, z), v(0.083, 0.61, 0.086), 0x8c6844);
        box(v(x, top + 0.026, z), v(0.114, 0.058, 0.116), 0x9a734a);
        instance('ball', snowMaterial, v(x, top + 0.061, z), v(0.061, 0.026, 0.062), 0xf6fbff, identity, false, 'snow');
      }
      if (previous) {
        for (const level of [-0.1, 0.24, 0.46]) {
          const a = v(previous.x, previous.y + level, z);
          const b = v(x, y + level, z);
          stick(a, b, level < 0 ? 0.072 : 0.027, level < 0 ? 0x604632 : 0x9e7345);
          if (level > 0) stick(a.clone().add(v(0, 0.027, 0)), b.clone().add(v(0, 0.027, 0)), 0.021, 0xf4f9ff, snowMaterial, 'snow', false);
        }
      }
      if (i === 2 || i === 8) {
        const below = landHeight(x, z) - 0.09;
        box(v(x, (below + y) / 2, z), v(0.16, y - below, 0.15), 0x73563d);
        instance('stone', clay, v(x, Math.max(below, -0.055), z), v(0.185, 0.13, 0.179), 0x929481);
      }
      previous = { x, y };
    }
  }

  const bridgeLamp = v(rightX + 0.28, Math.max(rightY, landHeight(rightX + 0.28, bridgeZ + 0.85)) + 0.93, bridgeZ + 0.85);
  const stem = v(bridgeLamp.x + 0.21, landHeight(bridgeLamp.x + 0.21, bridgeLamp.z), bridgeLamp.z);
  const cap = v(stem.x, bridgeLamp.y + 0.28, stem.z);
  stick(stem, cap, 0.038, 0x655036);
  stick(cap, v(bridgeLamp.x - 0.021, cap.y, cap.z), 0.032, 0x7f5936);
  instance('stone', clay, stem, v(0.19, 0.12, 0.15), 0x9d937a);
  addLantern(bridgeLamp, 0.112);
  addLight(bridgeLamp, 4.8, 16);

  path([[-8.5, -7.0], [-6.2, -6.2], [-3.6, -6.7], [-1.4, -7.7], [leftX - 0.18, bridgeZ]], 0.57);
  path([[-1.4, -9.18], [-1.0, -8.5], [-1.4, -7.7], [-2.6, -6.1], [-4.3, -4.8]], 0.62);
  path([[-7.25, -8.05], [-6.9, -7.3], [-6.1, -6.4]], 0.38);
  path([[-6.6, -11.65], [-5.22, -11.55], [-5.1, -10.3], [-4.8, -8.0], [-3.6, -6.7]], 0.41);
  path([[2.98, -11.53], [2.3, -10.9], [1.12, -10.2], [1.15, -9.16], [1.54, -8.13], [leftX - 0.12, bridgeZ]], 0.34);
  path([[rightX + 0.1, bridgeZ], [9.1, -7.8], [10.3, -7.8], [12.1, -7.05], [13.6, -6.65]], 0.55);
  path([[rightX + 0.35, bridgeZ + 0.1], [rightX + 0.8, -7.1], [9.5, -6.0], [11.9, -5.49], [13.55, -5.4]], 0.38);
  path([[13.0, -7.0], [13.06, -9.75], [12.99, -10.6], [12.72, -11.48]], 0.41);

  fittedFence([-8.9, -8.22], [-7.65, -8.05]);
  fittedFence([-6.18, -8.05], [-5.15, -8.31]);
  fittedFence([-3.5, -9.14], [-2.18, -8.92]);
  fittedFence([-0.32, -9.03], [0.62, -9.05]);
  fittedFence([0.62, -9.05], [0.58, -11.79]);
  fittedFence([9.06, -8.61], [9.7, -8.44]);
  fittedFence([11.74, -8.26], [12.86, -8.19]);
  fittedFence([12.86, -8.19], [13.0, -9.75]);
  fittedFence([9.15, -5.18], [13.23, -4.89], { height: 0.39 });
  fittedFence([13.42, -4.97], [13.38, -2.69], { height: 0.42 });

  function vegetable(x, z, height) {
    const base = landHeight(x, z) + 0.087;
    const dir = rng() * Math.PI * 2;
    const h = height * between(0.79, 1.13);
    for (let i = 0; i < 6; i++) {
      const a = dir + i * Math.PI / 3;
      const spread = h * between(0.32, 0.55);
      const pos = v(x + Math.cos(a) * spread, base + h * (0.53 + 0.047 * i), z + Math.sin(a) * spread);
      instance('leaf', plain, pos, v(h * 0.63, h * 0.28, h * 0.40), pick(colors.leaves), q(0, -a, between(0.14, 0.47)), false, 'crop');
    }
    instance('ball', plain, v(x, base + h * 0.68, z), v(h * 0.52, h * 0.49, h * 0.5), 0x88994b, identity, false, 'crop');
  }

  function millet(x, z, height) {
    const y = landHeight(x, z) + 0.06;
    const stalk = v(x + between(-0.07, 0.065), y + height, z + between(-0.035, 0.035));
    stick(v(x, y, z), stalk, 0.014, 0x807a3f, plain, 'crop', false);
    instance('ball', plain, stalk, v(0.047, 0.105, 0.047), pick([0xceaf5a, 0xb9a653, 0xd8bd6a]), q(0.23, 0, between(-0.3, 0.3)), false, 'crop');
    for (let i = 0; i < 4; i++) {
      const angle = i * 2.4 + rng() * 0.6;
      const center = v(x, y + height * (0.2 + i * 0.14), z);
      const bend = center.clone().add(v(Math.cos(angle) * 0.15, 0.09, Math.sin(angle) * 0.15));
      const tip = center.clone().add(v(Math.cos(angle) * 0.24, 0.08, Math.sin(angle) * 0.24));
      stick(center, bend, 0.018, pick(colors.leaves), plain, 'crop', false);
      stick(bend, tip, 0.011, pick(colors.leaves), plain, 'crop', false);
    }
  }

  function field(x, z, columns, length, grow) {
    for (let j = 0; j < columns; j++) {
      const a = x + j * 0.50;
      const rows = Math.ceil(length * 12);
      const soil = new THREE.Color();
      const positions = [];
      const indices = [];
      const shades = [];
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const along = z - 0.145 + t * (length + 0.15);
        const edge = 0.73 + 0.27 * Math.sin(Math.PI * Math.min(1, t * 7, (1 - t) * 7) / 2);
        for (let col = 0; col < 7; col++) {
          const cross = col / 3 - 1;
          const across = a + cross * 0.222 * edge + Math.sin(j * 2.6 + row * 0.63) * 0.012;
          const crown = Math.cos(cross * Math.PI / 2);
          positions.push(across, landHeight(across, along) + 0.018 + 0.085 * crown * edge, along);
          soil.set(pick(colors.earth)).multiplyScalar(0.82 + crown * 0.21);
          shades.push(soil.r, soil.g, soil.b);
          if (row > 0 && col > 0) {
            const i = row * 7 + col;
            indices.push(i, i - 7, i - 1, i - 1, i - 7, i - 8);
          }
        }
      }
      actual(meshFromVertices(positions, indices, shades), dirt, false);
      for (let i = 0; i < length * 4; i++) {
        const b = z + i * 0.245;
        if (!isLand(a, b)) continue;
        const p = v(a, landHeight(a, b), b);
        instance('stone', clay, p, v(0.12, 0.104, 0.12), pick(colors.earth), q(0, between(0, 0.9), between(-0.1, 0.1)), false);
        if ((i + j) % 2 === 0 || grow === millet) grow(a + between(-0.064, 0.064), b + between(-0.043, 0.04), grow === millet ? between(0.53, 0.82) : between(0.16, 0.27));
        instance('stone', snowMaterial, p.clone().add(v(0, 0.07, 0)), v(0.229, 0.066, 0.206), 0xf4fbff, identity, false, 'snow');
      }
    }
  }
  field(9.2, -4.68, 5, 1.93, vegetable);
  field(12.03, -4.58, 3, 1.84, millet);
  field(-7.55, -5.81, 3, 1.06, vegetable);

  for (let i = 0; i < 175; i++) {
    const x = between(-8.42, 13.48);
    const z = between(-13.54, -4.66);
    if (!isLand(x, z) || houses.some((house) => Math.abs(x - house.x) < house.width / 2 && Math.abs(z - house.z) < house.depth / 2)) continue;
    const radius = between(0.017, 0.054);
    instance('stone', clay, v(x, landHeight(x, z) + 0.018, z), v(radius, radius * 0.53, radius * 0.88), pick(colors.stone), q(0, between(0, 6.28), 0), false);
  }

  // The snowman stands clear of the bridge approach.
  const snowmanX = rightX + 0.66;
  const snowmanZ = bridgeZ + 1.64;
  const snowmanY = landHeight(snowmanX, snowmanZ);
  const snowman = new THREE.Group();
  snowman.position.set(snowmanX, snowmanY, snowmanZ);
  snowman.rotation.y = 0.43;
  group.add(snowman);
  snow.push(snowman);

  function fitted(parent, geometry, position, scale, color, rotation = identity) {
    const mesh = actual(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.87 }), true, parent);
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.quaternion.copy(rotation);
    return mesh;
  }

  const sphere = (parent, position, scale, color) => fitted(parent, geom.ball, position, scale, color);
  const unitBox = (parent, position, scale, color) => fitted(parent, geom.box, position, scale, color);
  function link(parent, a, b, radius, color) {
    const dir = b.clone().sub(a);
    return fitted(parent, geom.cylinder, a.clone().lerp(b, 0.5), v(radius, dir.length(), radius), color,
      new THREE.Quaternion().setFromUnitVectors(axes, dir.normalize()));
  }

  sphere(snowman, v(0, 0.234, 0), v(0.29, 0.25, 0.28), 0xe6f1f5);
  sphere(snowman, v(0, 0.51, 0), v(0.227, 0.213, 0.226), 0xeaf5f8);
  sphere(snowman, v(0, 0.772, 0.012), v(0.172, 0.17, 0.176), 0xf4f9fc);
  fitted(snowman, geom.cylinder, v(0, 0.641, 0.01), v(0.183, 0.063, 0.184), 0xa6413b, q(0.07, 0, -0.07));
  const scarfTail = unitBox(snowman, v(-0.09, 0.52, 0.206), v(0.075, 0.21, 0.024), 0xb74f44);
  scarfTail.rotation.z = -0.16;
  for (const a of [-1, 1]) {
    sphere(snowman, v(a * 0.069, 0.817, 0.15), v(0.021, 0.022, 0.017), 0x4c4039);
    link(snowman, v(a * 0.16, 0.51, 0), v(a * 0.36, 0.594, 0.016), 0.016, 0x76604a);
    link(snowman, v(a * 0.31, 0.582, 0.01), v(a * 0.38, 0.646, 0.022), 0.011, 0x76604a);
  }
  fitted(snowman, new THREE.ConeGeometry(1, 1, 8), v(0, 0.765, 0.211), v(0.037, 0.128, 0.037), 0xcd773f, q(Math.PI / 2, 0, -0.15));
  for (let i = 0; i < 3; i++) sphere(snowman, v(0.015, 0.49 - i * 0.095, 0.224 + i * 0.01), v(0.026, 0.026, 0.02), 0x5c4a3b);

  function person(color, worker) {
    const model = new THREE.Group();
    group.add(model);
    const shirt = new THREE.Group();
    shirt.position.y = 0.49;
    model.add(shirt);
    fitted(shirt, new THREE.CylinderGeometry(0.13, 0.17, 0.33, 9), v(0, 0.17, 0), v(1, 1, 0.68), color);
    fitted(shirt, geom.cylinder, v(0, 0.106, 0), v(0.164, 0.047, 0.115), 0x5d4c3d);
    sphere(shirt, v(0, 0.42, 0.009), v(0.093, 0.114, 0.09), 0xc69466);
    sphere(shirt, v(0, 0.426, -0.032), v(0.086, 0.097, 0.069), 0x45362d);
    sphere(shirt, v(0.003, 0.404, 0.09), v(0.024, 0.029, 0.028), 0xc79167);
    const hat = fitted(shirt, new THREE.ConeGeometry(1, 1, 15), v(0, 0.535, 0.005), v(0.22, 0.135, 0.211), 0xc6a766);
    hat.rotation.z = 0.07;
    fitted(shirt, geom.cylinder, v(0, 0.47, 0.006), v(0.219, 0.022, 0.212), 0xad874f, q(0, 0, 0.07));
    const legs = [];
    const arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.084, 0.49, 0);
      model.add(leg);
      link(leg, v(0, 0, 0), v(0, -0.424, 0.014), 0.052, 0x504b42);
      sphere(leg, v(0, -0.447, 0.049), v(0.068, 0.042, 0.114), 0x403931);
      legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.126, 0.291, 0);
      shirt.add(arm);
      link(arm, v(0, 0, 0), v(side * 0.056, -0.193, 0.019), 0.049, color);
      link(arm, v(side * 0.056, -0.193, 0.019), v(side * 0.075, -0.272, 0.072), 0.029, 0xc7976e);
      arms.push(arm);
    }
    if (worker) {
      link(shirt, v(0.20, 0.012, 0.19), v(0.20, -0.60, 0.39), 0.018, 0x94714a);
      fitted(shirt, geom.box, v(0.20, -0.58, 0.44), v(0.14, 0.039, 0.12), 0x5f6660, q(-0.66, 0, 0));
    } else {
      link(shirt, v(-0.51, 0.33, -0.018), v(0.51, 0.36, -0.018), 0.020, 0x9c7444);
      for (const side of [-1, 1]) {
        const x = side * 0.48;
        link(shirt, v(x, 0.33, -0.017), v(x, -0.087, 0.02), 0.009, 0x665238);
        fitted(shirt, geom.pot, v(x, -0.225, 0.02), v(0.117, 0.19, 0.117), 0xaf8650);
        fitted(shirt, geom.cylinder, v(x, -0.07, 0.02), v(0.096, 0.019, 0.096), 0xdbb276);
      }
    }
    return { model, shirt, legs, arms };
  }

  const carrier = person(0x9a8d6c, false);
  const farmer = person(0x8f6854, true);
  farmer.model.position.set(8.98, landHeight(8.98, -3.31), -3.31);
  farmer.model.rotation.y = 1.11;

  function chicken(color, comb) {
    const model = new THREE.Group();
    group.add(model);
    const body = sphere(model, v(0, 0.21, 0), v(0.105, 0.106, 0.155), color);
    const neck = new THREE.Group();
    neck.position.set(0, 0.235, 0.076);
    model.add(neck);
    sphere(neck, v(0, 0.056, 0.022), v(0.055, 0.086, 0.068), color);
    sphere(neck, v(0, 0.115, 0.059), v(0.046, 0.045, 0.046), comb ? 0xb86e39 : color);
    fitted(neck, new THREE.ConeGeometry(1, 1, 6), v(0, 0.112, 0.113), v(0.024, 0.055, 0.022), 0xd2a050, q(Math.PI / 2, 0, 0));
    if (comb) {
      for (let i = 0; i < 3; i++) sphere(neck, v(0, 0.151 + i * 0.005, 0.037 + i * 0.016), v(0.017, 0.025, 0.016), 0xb9342a);
      sphere(neck, v(0.005, 0.075, 0.089), v(0.023, 0.031, 0.02), 0xaf3930);
    }
    const feet = [];
    for (const side of [-1, 1]) {
      sphere(neck, v(side * 0.043, 0.126, 0.072), v(0.011, 0.012, 0.011), 0x33281d);
      sphere(model, v(side * 0.077, 0.211, -0.025), v(0.048, 0.065, 0.10), comb ? 0x706249 : color);
      const leg = new THREE.Group();
      leg.position.set(side * 0.049, 0.14, 0);
      model.add(leg);
      link(leg, v(0, 0, 0), v(0, -0.126, -0.019), 0.012, 0xae7a40);
      for (let i = -1; i <= 1; i++) link(leg, v(0, -0.126, -0.019), v(i * 0.026, -0.137, 0.02), 0.006, 0xae7a40);
      feet.push(leg);
    }
    for (let i = -1; i <= 1; i++) fitted(model, geom.ball, v(i * 0.046, 0.286, -0.13), v(0.038, 0.047, 0.118), comb ? 0x445349 : 0xa17145, q(-0.71, i * 0.24, 0));
    return { model, neck, feet, body };
  }

  const chickens = [chicken(0xa46f43, true), chicken(0xcfaa73, false), chicken(0xa47b54, false)];

  function dog() {
    const model = new THREE.Group();
    group.add(model);
    const coat = 0xb98d58;
    sphere(model, v(0, 0.37, -0.055), v(0.115, 0.127, 0.25), coat);
    sphere(model, v(0, 0.423, 0.133), v(0.107, 0.148, 0.117), 0xc19a64);
    sphere(model, v(0, 0.523, 0.202), v(0.107, 0.112, 0.108), coat);
    sphere(model, v(0.0, 0.486, 0.282), v(0.067, 0.059, 0.079), 0xd0ab78);
    sphere(model, v(0, 0.501, 0.348), v(0.043, 0.033, 0.028), 0x4d3b2a);
    const legs = [];
    for (const side of [-1, 1]) {
      fitted(model, new THREE.ConeGeometry(1, 1, 7), v(side * 0.076, 0.626, 0.176), v(0.063, 0.17, 0.059), 0xa77a4a, q(-0.18, 0, -side * 0.19));
      sphere(model, v(side * 0.077, 0.542, 0.272), v(0.014, 0.014, 0.011), 0x3f3428);
      for (const z of [-0.209, 0.109]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.084, 0.318, z);
        model.add(leg);
        link(leg, v(0, 0, 0), v(side * 0.012, -0.275, z < 0 ? 0.036 : 0.01), 0.038, coat);
        sphere(leg, v(side * 0.012, -0.283, 0.037), v(0.047, 0.034, 0.062), 0xa88154);
        legs.push(leg);
      }
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.42, -0.258);
    model.add(tail);
    link(tail, v(0, 0, 0), v(0, 0.103, -0.135), 0.028, coat);
    link(tail, v(0, 0.103, -0.135), v(0.012, 0.223, -0.183), 0.021, coat);
    link(tail, v(0.012, 0.223, -0.183), v(0.03, 0.291, -0.14), 0.014, 0xd0a36b);
    return { model, legs, tail };
  }

  const villageDog = dog();

  const figuresMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87 });
  const animatedParts = new Set(chickens.map(({ body }) => body));
  function batchFigure(parent) {
    const pieces = parent.children.filter((child) => child.isMesh && !animatedParts.has(child));
    if (pieces.length > 1) {
      const parts = pieces.map((piece) => {
        piece.updateMatrix();
        const geometry = piece.geometry.clone().applyMatrix4(piece.matrix);
        const count = geometry.getAttribute('position').count;
        const tint = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) piece.material.color.toArray(tint, i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
        return geometry;
      });
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      for (const piece of pieces) {
        parent.remove(piece);
        piece.material.dispose();
      }
      actual(merged, figuresMaterial, true, parent);
    }
    for (const child of parent.children) if (child.isGroup) batchFigure(child);
  }
  for (const model of [carrier.model, farmer.model, villageDog.model, snowman, ...chickens.map(({ model }) => model)]) batchFigure(model);

  const carrierWalk = new THREE.CatmullRomCurve3([[-6.05, -6.54], [-4.1, -6.43], [-2.25, -7.13], [-0.27, -7.83], [-1.14, -8.59], [-3.33, -8.03], [-5.05, -7.59]].map(([x, z]) => v(x, 0, z)), true);
  const dogWalk = new THREE.CatmullRomCurve3([[-6.62, -7.14], [-5.04, -6.77], [-3.24, -6.45], [-2.41, -7.17], [-3.31, -7.69], [-5.53, -7.49]].map(([x, z]) => v(x, 0, z)), true);
  const walk = (model, curve, progress, rise = 0) => {
    const pos = curve.getPointAt(progress);
    const direction = curve.getTangentAt(progress);
    model.position.set(pos.x, landHeight(pos.x, pos.z) + rise, pos.z);
    model.rotation.y = Math.atan2(direction.x, direction.z);
  };

  for (const { shape, material, rows, shadow, layer } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geom[shape], material, rows.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < rows.length; i++) {
      const data = rows[i];
      mesh.setMatrixAt(i, matrix.compose(data.position, data.rotation, data.size));
      mesh.setColorAt(i, color.set(data.color));
    }
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.name = `村落 ${layer} ${shape}`;
    group.add(mesh);
    if (layer === 'snow') snow.push(mesh);
    if (layer === 'crop') crops.push(mesh);
  }

  function update(time, winter, night) {
    const snowy = winter > 0.53;
    snow.forEach((object) => { object.visible = snowy; });
    crops.forEach((object) => { object.visible = winter < 0.71; });
    glow.emissiveIntensity = night * 1.38;
    lantern.emissiveIntensity = night * 2.55;
    for (const { light, power, phase } of lights) {
      light.intensity = night * power * (0.978 + 0.022 * Math.sin(time * 3.2 + phase));
      light.visible = night > 0.006;
    }

    const carrying = time * 7.1;
    walk(carrier.model, carrierWalk, (time * 0.048) % 1, 0.008 + Math.abs(Math.sin(carrying)) * 0.022);
    carrier.shirt.rotation.z = Math.sin(carrying) * 0.046;
    for (let i = 0; i < 2; i++) {
      carrier.legs[i].rotation.x = Math.sin(carrying + Math.PI * i) * 0.32;
      carrier.arms[i].rotation.x = 0.26 + Math.sin(carrying + Math.PI * i) * 0.14;
    }

    const effort = Math.sin(time * 1.8) * 0.5 + 0.5;
    farmer.shirt.rotation.x = 0.33 + 0.57 * effort;
    farmer.shirt.rotation.z = 0.075 * Math.sin(time * 1.8 + 0.5);
    farmer.arms[0].rotation.x = -0.24 - effort * 0.31;
    farmer.arms[1].rotation.x = -0.51 + effort * 0.24;

    for (let i = 0; i < chickens.length; i++) {
      const chick = chickens[i];
      const theta = time * (0.35 + i * 0.06) + i * 1.9;
      const x = -4.79 + 0.88 * i + Math.sin(theta) * 0.38;
      const z = -7.07 + (i % 2) * 0.42 + Math.cos(theta) * 0.30;
      chick.model.position.set(x, landHeight(x, z), z);
      chick.model.rotation.y = Math.atan2(Math.cos(theta) * 0.38, -Math.sin(theta) * 0.3);
      chick.neck.rotation.x = Math.max(0, Math.sin(time * (3.8 + i * 0.23) + i * 3.1)) ** 5 * 1.32;
      chick.body.rotation.x = Math.sin(time * 5.5 + i) * 0.08;
      chick.feet[0].rotation.x = Math.sin(time * 7.4 + i) * 0.26;
      chick.feet[1].rotation.x = -chick.feet[0].rotation.x;
    }

    const loopTime = time % 17;
    const moving = loopTime < 13;
    walk(villageDog.model, dogWalk, (Math.floor(time / 17) * 0.48 + Math.min(loopTime, 13) * (0.48 / 13)) % 1,
      moving ? Math.abs(Math.sin(time * 9.4)) * 0.017 : 0);
    villageDog.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(time * 9.4 + (i === 1 || i === 2 ? Math.PI : 0)) * 0.36 : 0; });
    villageDog.tail.rotation.y = Math.sin(time * (moving ? 7 : 13)) * (moving ? 0.33 : 0.52);
  }

  update(0, 0, 0);
  return { update, occluders, bridgeLamp };
}
