import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { cave, isInsideIsland, landHeight, riverWidth, riverX, seeded, waterEnd, waterStart } from './world.js';

const waterLevel = 0.012;
const rippleLimit = 12;
const rippleLife = 3.8;
const boatLength = 3.25;
const bankOverlap = 0.82;

function transverseX(z, lane) {
  return riverX(z) + lane * (riverWidth(z) + bankOverlap);
}

function findRiverTip(lane) {
  const inside = (z) => isInsideIsland(transverseX(z, lane), z);
  if (inside(waterEnd)) return waterEnd;
  let lower = waterEnd - 6;
  let upper = waterEnd;
  for (let i = 0; i < 18; i++) {
    const midpoint = (lower + upper) * 0.5;
    if (inside(midpoint)) lower = midpoint;
    else upper = midpoint;
  }
  return lower;
}

function makeRiverGeometry() {
  const steps = 218;
  const lanes = 24;
  const position = [];
  const bedDepth = [];
  const lanesAcross = [];
  const index = [];
  const ends = Array.from({ length: lanes + 1 }, (_, i) => findRiverTip(i / lanes * 2 - 1));

  for (let row = 0; row <= steps; row++) {
    for (let col = 0; col <= lanes; col++) {
      const lane = col / lanes * 2 - 1;
      const z = THREE.MathUtils.lerp(waterStart - .35, ends[col], row / steps);
      const x = transverseX(z, lane);
      // Reflector geometry lives in its local XY plane before being laid flat.
      position.push(x, -z, 0);
      bedDepth.push(Math.max(0, waterLevel - landHeight(x, z)));
      lanesAcross.push(lane);
      if (row > 0 && col > 0) {
        const corner = row * (lanes + 1) + col;
        index.push(corner - lanes - 2, corner - 1, corner - lanes - 1);
        index.push(corner - lanes - 1, corner - 1, corner);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('bedDepth', new THREE.Float32BufferAttribute(bedDepth, 1));
  geometry.setAttribute('laneAcross', new THREE.Float32BufferAttribute(lanesAcross, 1));
  return geometry;
}

const riverShader = {
  name: 'River surface',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    time: { value: 0 },
    winter: { value: 0 },
    night: { value: 0 },
    mouth: { value: cave.front },
    caveBack: { value: cave.back },
    boatPosition: { value: new THREE.Vector2(-100, -100) },
    lampPosition: { value: new THREE.Vector3(-100, 0, -100) },
    ripples: { value: Array.from({ length: rippleLimit }, () => new THREE.Vector4(0, 0, -1, 0)) },
    deepDay: { value: new THREE.Color('#416b65') },
    shallowDay: { value: new THREE.Color('#788773') },
    deepNight: { value: new THREE.Color('#142d43') },
    shallowNight: { value: new THREE.Color('#2d4b54') },
    foamColor: { value: new THREE.Color('#c6e4c8') },
    iceColor: { value: new THREE.Color('#b9d8dc') },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    attribute float bedDepth;
    attribute float laneAcross;
    varying vec4 mirrorUv;
    varying vec3 worldPosition;
    varying float depth;
    varying float lane;
    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vec4 local = vec4(position, 1.);
      worldPosition = (modelMatrix * local).xyz;
      mirrorUv = textureMatrix * local;
      depth = bedDepth;
      lane = laneAcross;
      gl_Position = projectionMatrix * modelViewMatrix * local;
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float winter;
    uniform float night;
    uniform float mouth;
    uniform float caveBack;
    uniform vec2 boatPosition;
    uniform vec3 lampPosition;
    uniform vec4 ripples[${rippleLimit}];
    uniform vec3 deepDay;
    uniform vec3 shallowDay;
    uniform vec3 deepNight;
    uniform vec3 shallowNight;
    uniform vec3 foamColor;
    uniform vec3 iceColor;
    varying vec4 mirrorUv;
    varying vec3 worldPosition;
    varying float depth;
    varying float lane;
    #include <common>
    #include <logdepthbuf_pars_fragment>

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(137.37, 373.21))) * 44193.7);
    }

    float noise(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p);
      f = f * f * (3. - 2. * f);
      return mix(
        mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
        mix(hash(cell + vec2(0., 1.)), hash(cell + vec2(1.)), f.x),
        f.y
      );
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = worldPosition.xz;
      float shallow = 1. - smoothstep(.02, .55, depth);
      vec2 stream = vec2(lane * 2.15, p.y - time * .43);
      float wobble = noise(stream * vec2(2.1, 1.6));
      float waveA = sin(stream.y * 15. + wobble * 7. + stream.x * 4.);
      float waveB = sin(stream.y * 24. - stream.x * 8. + wobble * 4. - time * .55);
      float waveC = sin(p.x * 17. + p.y * 7. + wobble * 8. - time * 1.7);
      vec2 shift = vec2(waveB + waveC, waveA + waveC * .4) * .0028;
      float filaments = smoothstep(.78, .99, waveA * .5 + .5) *
        (smoothstep(.36, .76, noise(stream * vec2(4.6, 6.))) * .17);
      float tinyLines = smoothstep(.91, .998, waveB) * smoothstep(.19, .7, wobble) * .052;
      float shoreline = exp(-depth * 28.) * (.18 + .25 * wobble);
      float waterLight = 1. - .72 *
        smoothstep(caveBack - .6, caveBack + .8, p.y) *
        (1. - smoothstep(mouth - .9, mouth + 1.75, p.y));
      float rippled = 0.;
      for (int i = 0; i < ${rippleLimit}; i++) {
        vec4 r = ripples[i];
        if (r.w <= 0.) continue;
        vec2 delta = p - r.xy;
        float d = length(delta * vec2(1.12, .96));
        float radius = r.z * .89 + .065;
        float band = d - radius;
        float envelope = exp(-band * band * 12.96) * r.w;
        float ring = cos(band * 19.) * envelope;
        float trailing = exp(-d * 7.) * max(0., 1. - r.z * 1.3) * r.w;
        shift += (delta / max(d, .03)) * ring * .0038;
        rippled += max(0., ring) * .14 + min(0., ring) * .039 + trailing * .095;
      }

      vec2 nearBoat = p - boatPosition;
      float boatDist = length(nearBoat * vec2(1.45, .54));
      float wakeOffset = boatDist - .75;
      float boatWake = sin(boatDist * 26. - time * 2.2) *
        exp(-wakeOffset * wakeOffset * 19.36) * .06;
      vec3 eye = normalize(cameraPosition - worldPosition);
      float fresnel = pow(1. - max(0., eye.y), 2.2);
      vec2 reflectUv = mirrorUv.xy / mirrorUv.w;
      vec3 sky = mix(vec3(.34, .38, .31), vec3(.007, .017, .034), night);
      vec4 reflected = texture2D(tDiffuse, clamp(reflectUv + shift, .003, .997));
      reflected = mix(reflected, texture2D(tDiffuse,
        clamp(reflectUv - shift * .45 + vec2(.0018, 0.), .003, .997)), .29);
      vec3 reflection = reflected.rgb + sky * (1. - reflected.a);

      vec3 body = mix(deepDay, shallowDay, shallow * .84);
      body = mix(body, mix(deepNight, shallowNight, shallow * .75), night);
      body *= (.84 + .27 * wobble) * waterLight;
      body = mix(body, reflection, (.22 + fresnel * .43) * waterLight);
      vec2 pebble = p * vec2(4.6, 5.4);
      vec2 offset = vec2(hash(floor(pebble)), hash(floor(pebble) + vec2(4.8, 1.1)));
      float mottledBed = 1. - smoothstep(.14, .43, length(fract(pebble) - .5 + (offset - .5) * .35));
      body = mix(body, body * (.68 + .35 * offset.x), mottledBed * shallow * .41);
      body *= 1. - .23 * exp(-pow(boatDist * 1.5, 3.));

      vec2 lightDelta = p - lampPosition.xz;
      float lampFalloff = exp(-dot(lightDelta * vec2(.82, 1.3), lightDelta * vec2(.82, 1.3)));
      float lanternShimmer = lampFalloff * (.2 + waveB * .12 + filaments * 4.);
      body += vec3(1.0, .32, .055) * lanternShimmer * night * .53;
      float frozen = winter * (1. - smoothstep(.05, .22 + noise(p * 2.5) * .14, depth)) *
        smoothstep(.24, .62, noise(p * 1.1 + vec2(4.7, 3.9)));
      float high = filaments + tinyLines + shoreline * .29 + rippled + boatWake;
      body += foamColor * high * mix(1., .44, night) * waterLight * (1. - frozen * .9);
      float crystals = smoothstep(.63, .80, noise(p * 17.)) * .35;
      vec3 ice = iceColor * (.58 + crystals) * mix(1., .44, night);
      body = mix(body, ice, frozen * .89);

      gl_FragColor = vec4(max(body, 0.), 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

function makeShorelineStones(scene) {
  const random = seeded(523);
  const palette = ['#8c8064', '#9b896d', '#655d4c', '#a59675', '#8e7a59'].map((hex) => new THREE.Color(hex));
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .94, flatShading: true });
  const stones = new THREE.InstancedMesh(geometry, material, 22);
  stones.name = 'Pebbles at the diorama shoreline';
  const object = new THREE.Object3D();
  for (let i = 0; i < stones.count; i++) {
    const lane = (i / (stones.count - 1) * 2 - 1) * .94 + (random() - .5) * .027;
    const z = findRiverTip(lane) - .07 - random() * .49;
    const x = transverseX(z, lane);
    const bed = landHeight(x, z);
    const top = Math.max(bed + .13, waterLevel + random() * .16 - .08);
    object.position.set(x, (bed + top) * .5, z);
    object.rotation.set((random() - .5) * .23, random() * 6.2832, (random() - .5) * .22);
    object.scale.set(.135 + random() * .24, (top - bed) * .58, .145 + random() * .22);
    object.updateMatrix();
    stones.setMatrixAt(i, object.matrix);
    stones.setColorAt(i, palette[i % palette.length]);
  }
  stones.receiveShadow = true;
  scene.add(stones);
  return stones;
}

function makeBoat(scene) {
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.88, side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({ color: '#76502c', roughness: 0.9 });
  const oak = new THREE.MeshStandardMaterial({ color: '#a8774c', roughness: 0.88 });
  const paleWood = new THREE.MeshStandardMaterial({ color: '#bb9368', roughness: 0.88 });
  const iron = new THREE.MeshStandardMaterial({ color: '#493a27', roughness: 0.72 });
  const jute = new THREE.MeshStandardMaterial({ color: '#c7a56e', roughness: 1 });
  const outerTones = ['#765233', '#9d744c', '#ad7e50', '#936139', '#c39864', '#ab7f58'];
  const innerTones = ['#8c613e', '#a87c51', '#b28a5e', '#ab8157', '#c8a372', '#b68b61'];
  const partsByMaterial = new Map();
  const boat = new THREE.Group();
  boat.name = 'Moored wooden sampan';
  scene.add(boat);

  const section = (s, u, inner = false) => {
    const width = 0.615 * Math.pow(Math.max(0, 1 - Math.abs(s) ** 1.6), 0.81);
    const rise = Math.pow(Math.abs(s), 2.65);
    return new THREE.Vector3(
      u * Math.max(.013, width - (inner ? .035 : 0)),
      -.095 + rise * .42 + Math.abs(u) ** 2 * .335 + (inner ? .035 : 0),
      s * boatLength / 2,
    );
  };
  const longitudinalSteps = 32;
  const plan = [];
  const color = [];
  for (const inside of [false, true]) {
    for (let side = -1; side <= 1; side += 2) {
      for (let band = 0; band < 6; band++) {
        const tone = new THREE.Color((inside ? innerTones : outerTones)[band]);
        for (let i = 0; i < longitudinalSteps; i++) {
          const s0 = i / longitudinalSteps * 2 - 1;
          const s1 = (i + 1) / longitudinalSteps * 2 - 1;
          const u0 = side * band / 6;
          const u1 = side * (band + 1) / 6;
          const a = section(s0, u0, inside);
          const b = section(s1, u0, inside);
          const c = section(s1, u1, inside);
          const d = section(s0, u1, inside);
          for (const [pos, s] of [[a, s0], [b, s1], [c, s1], [a, s0], [c, s1], [d, s0]]) {
            plan.push(pos.x, pos.y, pos.z);
            const grain = .93 + .07 * Math.sin(s * 29 + band) + .04 * Math.sin(s * 153 + band * 6);
            color.push(tone.r * grain, tone.g * grain, tone.b * grain);
          }
        }
      }
    }
  }
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(plan, 3));
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, hullMaterial);
  hull.castShadow = true;
  hull.receiveShadow = true;
  boat.add(hull);

  const put = (material, geometry) => {
    if (!partsByMaterial.has(material)) partsByMaterial.set(material, []);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    partsByMaterial.get(material).push(part);
  };
  const tubing = (material, points, radius, segments = 18) => {
    const curve = new THREE.CatmullRomCurve3(points);
    put(material, new THREE.TubeGeometry(curve, segments, radius, 5, false));
  };
  const plank = (material, width, height, length, x, y, z) => {
    put(material, new THREE.BoxGeometry(width, height, length).translate(x, y, z));
  };
  for (const side of [-1, 1]) {
    const rail = Array.from({ length: 33 }, (_, i) => section(i / 16 - 1, side));
    tubing(trim, rail, .044, 36);
    const seam = Array.from({ length: 31 }, (_, i) => section(i / 15 - 1, side * .81));
    tubing(oak, seam, .012, 35);
  }
  for (const along of [-.62, -.37, -.13, .13, .37, .62]) {
    const ribs = Array.from({ length: 11 }, (_, i) => {
      const point = section(along, i / 5 - 1, true);
      point.y += .018;
      return point;
    });
    tubing(oak, ribs, .026, 11);
  }
  for (let i = -2; i <= 2; i++) {
    const length = 1.72 - .17 * Math.abs(i);
    plank(i % 2 === 0 ? oak : paleWood, .096, .042, length, i * .102, -.008, 0);
  }
  for (const seat of [-.59, -.005, .53]) {
    const reach = section(seat, 1).x;
    plank(paleWood, reach * 1.84, .063, .205, 0, .247, seat * boatLength / 2);
    plank(trim, reach * 1.61, .042, .075, 0, .198, seat * boatLength / 2);
    for (const x of [reach * -.67, reach * .67]) {
      put(iron, new THREE.CylinderGeometry(.017, .018, .013, 6).translate(x, .28, seat * boatLength / 2));
    }
  }
  // Oar shaft and tapered blade resting across the thwarts.
  const oarAngle = -.39;
  const oarPivot = new THREE.Vector3(.16, .323, -.02);
  put(oak, new THREE.CylinderGeometry(.022, .032, 1.68, 7)
    .rotateX(Math.PI / 2).rotateY(oarAngle).translate(...oarPivot));
  const blade = new THREE.Shape();
  blade.moveTo(0, -.32);
  blade.quadraticCurveTo(.115, -.23, .096, .18);
  blade.quadraticCurveTo(.061, .31, 0, .34);
  blade.quadraticCurveTo(-.061, .31, -.096, .18);
  blade.quadraticCurveTo(-.115, -.23, 0, -.32);
  put(paleWood, new THREE.ExtrudeGeometry(blade, { depth: .015, bevelEnabled: false, curveSegments: 5 })
    .rotateX(Math.PI / 2).translate(0, 0, -.93).rotateY(oarAngle).translate(...oarPivot));
  const coil = Array.from({ length: 42 }, (_, i) => {
    const turn = i * .43;
    const radius = .2 - i * .0033;
    return new THREE.Vector3(-.068 + Math.cos(turn) * radius, .298, .83 + Math.sin(turn) * radius * .64);
  });
  tubing(jute, coil, .012, 60);
  for (const [material, parts] of partsByMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    boat.add(mesh);
    for (const geometry of parts) geometry.dispose();
  }

  const mooringZ = 16.2;
  const mooringX = riverX(mooringZ) - riverWidth(mooringZ) * .35;
  boat.position.set(mooringX, .018, mooringZ);
  boat.rotation.y = -.35;
  boat.updateMatrixWorld(true);

  const stakeZ = mooringZ + .7;
  let stakeX = riverX(stakeZ) - riverWidth(stakeZ) * .86;
  for (let i = 0; i < 12 && landHeight(stakeX, stakeZ) < .08; i++) stakeX -= .12;
  const groundY = landHeight(stakeX, stakeZ);
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(.07, .097, .68, 6), oak);
  stake.position.set(stakeX, Math.max(-.07, groundY) + .25, stakeZ);
  stake.rotation.z = -.065;
  stake.castShadow = true;
  scene.add(stake);
  const end = boat.localToWorld(new THREE.Vector3(0, .53, 1.56));
  const ropeTop = stake.position.clone();
  ropeTop.y += .19;
  const slack = end.clone().lerp(ropeTop, .52);
  slack.y -= .21;
  const rope = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([ropeTop, slack, end]), 24, .018, 5, false,
  ), jute);
  rope.castShadow = true;
  scene.add(rope);

  return {
    anchor: new THREE.Vector2(mooringX, mooringZ),
    occluders: [boat, stake, rope],
    update(time) {
      boat.position.y = .018 + Math.sin(time * 1.85) * .021;
      boat.rotation.x = Math.sin(time * 1.22) * .013;
      boat.rotation.z = Math.cos(time * 1.71) * .024;
      boat.rotation.y = -.35 + Math.sin(time * .63) * .017;
    },
  };
}

function makeFloatingPetals(scene) {
  const random = seeded(793);
  const petals = [];
  const palette = ['#f0849e', '#fac3c0', '#f4a1a9', '#e97792', '#fbe1c9'].map((hex) => new THREE.Color(hex));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, .011, 0, 0, 0, -.85, -.42, 0, -.3, -.38, .01, .24,
    0, .025, .49, .38, .007, .24, .42, 0, -.3,
  ], 3));
  geometry.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 1, 6]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: '#fff0e6', side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, 190);
  mesh.name = 'Floating peach petals';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const shape = new THREE.Object3D();
  for (let i = 0; i < mesh.count; i++) {
    const outer = i < 164;
    const from = outer ? cave.front - .6 : waterStart + 2.1;
    const to = outer ? waterEnd - 1.15 : cave.back + .6;
    petals.push({
      from, to, offset: random(), lane: (random() * 2 - 1) * .8,
      phase: random() * Math.PI * 2, size: .045 + random() * .056,
      speed: .19 + random() * .22,
    });
    mesh.setColorAt(i, palette[i % palette.length]);
  }
  scene.add(mesh);
  return (time, winter, night) => {
    mesh.visible = winter < .98;
    if (!mesh.visible) return;
    material.color.setRGB(1 - night * .64, .86 - night * .60, .8 - night * .5);
    for (let i = 0; i < petals.length; i++) {
      const petal = petals[i];
      const progress = (petal.offset + time * petal.speed / (petal.to - petal.from)) % 1;
      const z = THREE.MathUtils.lerp(petal.from, petal.to, progress);
      const lane = petal.lane + Math.sin(time * .7 + petal.phase) * .045;
      const x = riverX(z) + lane * riverWidth(z);
      const fade = THREE.MathUtils.smoothstep(progress, 0, .05) *
        (1 - THREE.MathUtils.smoothstep(progress, .91, 1));
      const size = petal.size * fade * (1 - winter);
      shape.position.set(x, waterLevel + .017 + Math.sin(time * 3 + petal.phase) * .004, z);
      shape.rotation.set(0, petal.phase + time * .42, 0);
      shape.scale.setScalar(size);
      shape.updateMatrix();
      mesh.setMatrixAt(i, shape.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

export function createWater(scene) {
  const mesh = new Reflector(makeRiverGeometry(), {
    clipBias: .002,
    textureWidth: 480,
    textureHeight: 320,
    multisample: 0,
    shader: riverShader,
  });
  mesh.name = 'Continuous river and cave water';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = waterLevel;
  scene.add(mesh);

  const boat = makeBoat(scene);
  const shorelineStones = makeShorelineStones(scene);
  const updatePetals = makeFloatingPetals(scene);
  const uniforms = mesh.material.uniforms;
  uniforms.boatPosition.value.copy(boat.anchor);
  const activeRipples = [];
  let currentWinter = 0;
  let nextRipple = 0;

  return {
    mesh,
    occluders: [...boat.occluders, shorelineStones],
    get rippleCount() { return activeRipples.filter(Boolean).length; },
    setBridgeLamp(position) {
      const z = position.z - .17;
      const center = riverX(z);
      const edge = riverWidth(z) * .78;
      // Keep the lamp's broken water highlights close to the corresponding bank.
      uniforms.lampPosition.value.set(THREE.MathUtils.clamp(position.x, center - edge, center + edge), position.y, z);
    },
    disturb(point, time, magnitude = 1) {
      if (currentWinter > .65 && landHeight(point.x, point.z) > -.11) return;
      activeRipples[nextRipple] = {
        lane: (point.x - riverX(point.z)) / riverWidth(point.z),
        z: point.z,
        born: time,
        strength: THREE.MathUtils.clamp(magnitude, .12, 1.3),
      };
      nextRipple = (nextRipple + 1) % rippleLimit;
    },
    update(time, winter, night) {
      currentWinter = winter;
      uniforms.time.value = time;
      uniforms.winter.value = winter;
      uniforms.night.value = night;
      boat.update(time);
      updatePetals(time, winter, night);
      for (let i = 0; i < rippleLimit; i++) {
        const disturbance = activeRipples[i];
        const uniform = uniforms.ripples.value[i];
        if (!disturbance) continue;
        const age = Math.max(0, time - disturbance.born);
        const z = disturbance.z + age * .43;
        if (age > rippleLife || z > waterEnd + .2) {
          activeRipples[i] = null;
          uniform.w = 0;
          continue;
        }
        const strength = disturbance.strength * (1 - age / rippleLife) ** 1.65;
        uniform.set(riverX(z) + disturbance.lane * riverWidth(z), z, age, strength);
      }
    },
  };
}
