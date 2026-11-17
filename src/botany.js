import * as THREE from 'three';
import { isLand, landHeight, seeded } from './world.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(x, y, z);

function geometryFrom(positions, colors, uvs, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeFlower(detailed = true) {
  const positions = [], colors = [], uvs = [], indices = [];
  const throat = new THREE.Color('#dd7298');
  const edge = new THREE.Color('#fff1e9');
  const center = new THREE.Color('#eab04f');
  const filament = new THREE.Color('#f9e7b8');
  const outline = detailed ? [
    [.07, -.035], [.27, -.20], [.54, -.36], [.78, -.38], [.96, -.23],
    [1.01, -.08], [.955, 0], [1.01, .08], [.96, .23], [.78, .38],
    [.54, .36], [.27, .20], [.07, .035],
  ] : [[.07, -.035], [.40, -.31], [.78, -.38], [1.01, -.08], [.955, 0],
    [1.01, .08], [.78, .38], [.40, .31], [.07, .035]];
  const vertex = (p, color, u, v) => {
    const index = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    colors.push(color.r, color.g, color.b);
    uvs.push(u, v);
    return index;
  };
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * TAU / 5;
    const curve = (radius, width) => point(
      radius * Math.cos(angle) + width * Math.sin(angle),
      .18 * radius * radius + Math.abs(width) * .16 + .025 * Math.sin(radius * 4 + petal),
      radius * Math.sin(angle) - width * Math.cos(angle),
    );
    const middle = vertex(curve(.55, 0), edge.clone().lerp(throat, .17), .5, .55);
    const first = positions.length / 3;
    for (const [radius, width] of outline) {
      vertex(curve(radius, width), throat.clone().lerp(edge, Math.min(1, radius * 1.35)), width + .5, radius);
    }
    for (let i = 0; i < outline.length; i++) indices.push(middle, first + i, first + (i + 1) % outline.length);
  }
  const heart = vertex(point(0, .082, 0), new THREE.Color('#ab5370'), 0, 2);
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8;
    vertex(point(Math.cos(angle) * .15, .08, Math.sin(angle) * .15), center, 0, 2);
  }
  for (let i = 0; i < 8; i++) indices.push(heart, heart + 1 + i, heart + 1 + (i + 1) % 8);
  // Crossed, tapered filaments stay readable from the side as well as above.
  for (let i = 0; i < (detailed ? 7 : 0); i++) {
    const angle = i * TAU / 7;
    const root = point(Math.cos(angle) * .09, .095, Math.sin(angle) * .09);
    const tip = point(Math.cos(angle) * .27, .32 + .025 * Math.sin(i * 2), Math.sin(angle) * .27);
    const across = point(-Math.sin(angle), 0, Math.cos(angle));
    const a = vertex(root.clone().addScaledVector(across, -.018), filament, 0, 2);
    const b = vertex(root.clone().addScaledVector(across, .018), filament, 0, 2);
    const c = vertex(tip, filament, 0, 2);
    indices.push(a, b, c);
    const d = vertex(tip.clone().addScaledVector(across, -.038), center, 0, 2);
    const e = vertex(tip.clone().add(point(0, .046, 0)), center, 0, 2);
    const f = vertex(tip.clone().addScaledVector(across, .038), center, 0, 2);
    const g = vertex(tip.clone().add(point(0, -.034, 0)), center, 0, 2);
    indices.push(d, e, f, d, f, g);
  }
  return geometryFrom(positions, colors, uvs, indices);
}

function makeLeaf() {
  const positions = [], colors = [], uvs = [], indices = [];
  const rows = 9;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const halfWidth = Math.sin(Math.PI * t) ** .82 * .139 * (1 - .17 * t);
    const serration = row % 2 ? 1.06 : .95;
    for (let edge = -1; edge <= 1; edge++) {
      const x = edge * halfWidth * serration;
      const z = .105 * Math.sin(t * Math.PI) - Math.abs(x) * .29 + .09 * t * t;
      positions.push(x, t, z);
      const shade = edge === 0 ? 1.07 : .94;
      colors.push(shade, shade, shade);
      uvs.push(edge * .5 + .5, t);
    }
    if (!row) continue;
    const i = (row - 1) * 3;
    indices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4,
      i + 1, i + 4, i + 2, i + 2, i + 4, i + 5);
  }
  return geometryFrom(positions, colors, uvs, indices);
}

function makeDistantFlower() {
  const positions = [], colors = [], uvs = [], indices = [];
  const blush = new THREE.Color('#e995ad');
  const ivory = new THREE.Color('#ffe8e3');
  for (let petal = 0; petal < 5; petal++) {
    const a = petal * TAU / 5;
    const base = positions.length / 3;
    for (const [r, w] of [[.06, 0], [.55, -.37], [.99, -.19], [.99, .19], [.55, .37]]) {
      positions.push((r * Math.cos(a) + w * Math.sin(a)) * 1.28, r * r * .17,
        (r * Math.sin(a) - w * Math.cos(a)) * 1.28);
      const color = r < .1 ? blush : ivory;
      colors.push(color.r, color.g, color.b);
      uvs.push(w + .5, r);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 3, base + 4);
  }
  return geometryFrom(positions, colors, uvs, indices);
}

function plantMaterial(kind, clock) {
  const material = new THREE.MeshStandardMaterial({
    roughness: kind === 'flower' ? .74 : .69,
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: kind === 'flower' ? 0x7c354a : 0x324a17,
    emissiveIntensity: .025,
  });
  material.customProgramCacheKey = () => `peach-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.botanyTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float botanyTime;\nvarying vec2 plantUv;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        plantUv = uv;
        #ifdef USE_INSTANCING
          vec3 anchor = instanceMatrix[3].xyz;
          transformed.z += ${kind === 'flower' ? '.021' : '.036'} * uv.y * sin(botanyTime * 1.15 + anchor.x * 1.7 + anchor.z * 1.3);
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 plantUv;')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        ${kind === 'flower' ? `
          if (plantUv.y < 1.2) {
            float u = plantUv.x - .5;
            float vein = pow(max(0.0, cos((u / (.14 + plantUv.y)) * 39.0 + plantUv.y * 2.8)), 18.0);
            float root = 1.0 - smoothstep(.08, .62, plantUv.y);
            diffuseColor.rgb *= 1.0 - vein * (root * .13 + .025);
          }
        ` : `
          float distanceFromRib = abs(plantUv.x - .5);
          float rib = 1.0 - smoothstep(.008, .026, distanceFromRib);
          float branches = pow(max(0.0, cos((plantUv.y - distanceFromRib * .39) * 102.0)), 19.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.13, .82), rib * .47 + branches * .13);
        `}
      `);
  };
  return material;
}

function woodMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 woodUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nwoodUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 woodUv;')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        float twisted = woodUv.x * 6.283185 + sin(woodUv.y * 2.7) * .17;
        float grooves = sin(twisted * 23.0 + sin(woodUv.y * 7.5) * .7);
        float grain = sin(twisted * 71.0 + sin(woodUv.y * 17.0));
        float creases = pow(max(0.0, grooves), 7.0);
        float fleck = sin(twisted * 19.0 + woodUv.y * 85.0) * sin(woodUv.y * 33.0);
        float knot = sin(woodUv.y * 7.0 + sin(twisted * 4.0)) * cos(twisted * 3.0 - woodUv.y * .74);
        diffuseColor.rgb *= .78 - .24 * creases + .065 * grain + .045 * fleck + .05 * knot;
      `);
  };
  return material;
}

function newSurface() {
  return { positions: [], colors: [], uvs: [], indices: [] };
}

function appendTube(surface, curve, radius, tipRadius, color, segments, sides, snowy = false) {
  const offset = surface.positions.length / 3;
  const normal = point(0, 0, 0), binormal = point(0, 0, 0);
  const length = curve.getLength();
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    const at = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    normal.copy(UP).addScaledVector(tangent, -tangent.y).normalize();
    if (normal.lengthSq() < .1) normal.set(1, 0, 0);
    binormal.crossVectors(tangent, normal).normalize();
    const r = THREE.MathUtils.lerp(radius, tipRadius, t);
    for (let side = 0; side <= sides; side++) {
      const around = side / sides;
      const angle = snowy ? (around - .5) * Math.PI * .75 : around * TAU;
      const corrugation = snowy ? 1 : 1 + .035 * Math.sin(angle * 5 + t * 7);
      const vertex = at.clone().addScaledVector(normal, Math.cos(angle) * r * corrugation)
        .addScaledVector(binormal, Math.sin(angle) * r * corrugation);
      if (snowy) vertex.y += .018;
      surface.positions.push(vertex.x, vertex.y, vertex.z);
      const light = 1 + Math.sin(angle * 3 + t * 6) * .045;
      surface.colors.push(color.r * light, color.g * light, color.b * light);
      surface.uvs.push(around, t * length * 3);
      if (!ring || !side) continue;
      const index = offset + ring * (sides + 1) + side;
      surface.indices.push(index - sides - 2, index, index - 1, index - sides - 2, index - sides - 1, index);
    }
  }
}

/** Detailed peach trees are built once and share flower, bud and leaf batches. */
export function createPeachBuilder(scene, seasonUniform) {
  const wood = newSurface();
  const snowWood = newSurface();
  const clock = { value: 0 };
  const blossoms = [], leaves = [], buds = [];
  const occluders = [];
  const treeRoots = [];
  const treeRanges = [];
  const snowTint = new THREE.Color('#e6ebeb');
  const flowerPalette = ['#ffd7df', '#ffdfe1', '#f7b7cb', '#ffced5', '#fff0e5'].map((c) => new THREE.Color(c));
  const leafPalette = ['#637e39', '#819b47', '#91a150', '#b09e62', '#688a46'].map((c) => new THREE.Color(c));
  const matrix = new THREE.Matrix4();
  const budGeometry = new THREE.SphereGeometry(1, 6, 4);
  const proxyGeometry = new THREE.SphereGeometry(1, 6, 4);
  const proxyMaterial = new THREE.MeshBasicMaterial();
  const temporaryScale = point(1, 1, 1);
  let complete = false;

  function addRecord(list, at, size, orientation, color, shape = [1, 1, 1]) {
    temporaryScale.set(size * shape[0], size * shape[1], size * shape[2]);
    list.push({ matrix: matrix.compose(at, orientation, temporaryScale).clone(), color });
  }

  function addTree(x, z, height, seed) {
    if (complete) throw new Error('Peach trees must be added before finish().');
    if (!isLand(x, z)) return null;
    const random = seeded(seed);
    const between = (low, high) => THREE.MathUtils.lerp(low, high, random());
    const pick = (values) => values[Math.floor(random() * values.length)];
    const ground = landHeight(x, z);
    const firstBlossom = blossoms.length;
    const origin = point(x, ground, z);
    const bark = new THREE.Color().setHSL(between(.055, .085), between(.26, .41), between(.16, .23));
    const flowerTint = pick(flowerPalette);
    const radius = height * between(.037, .052);
    const lean = point(between(-.085, .085), .57, between(-.075, .075)).multiplyScalar(height);
    const treeBounds = new THREE.Box3();

    function branch(points, width, taper = .35, detail = 5) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const sides = width > .07 ? 9 : width > .025 ? 6 : 4;
      appendTube(wood, curve, width, width * taper, bark, detail, sides);
      if (width > .021 && Math.abs(points.at(-1).y - points[0].y) < curve.getLength() * .78) {
        appendTube(snowWood, curve, width * 1.10, width * taper * 1.10, snowTint, detail, 3, true);
      }
      for (const p of points) treeBounds.expandByPoint(p);
      return curve;
    }

    const trunk = branch([
      origin.clone().add(point(0, -.055, 0)),
      origin.clone().add(point(lean.x * -.16, height * .19, lean.z * .13)),
      origin.clone().add(point(lean.x * .7, height * .39, lean.z * .78)),
      origin.clone().add(lean),
    ], radius, .38, 13);
    for (let i = 0; i < 7; i++) {
      const angle = TAU * i / 7 + between(-.25, .25);
      const reach = height * between(.14, .22);
      const rootX = x + Math.cos(angle) * reach;
      const rootZ = z + Math.sin(angle) * reach;
      if (!isLand(rootX, rootZ)) continue;
      const end = point(rootX, landHeight(rootX, rootZ) + .008, rootZ);
      const sideways = point(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(height * between(-.045, .045));
      branch([origin.clone().add(point(0, height * .045, 0)),
        origin.clone().lerp(end, .35).add(sideways).add(point(0, height * .035, 0)),
        origin.clone().lerp(end, .72).addScaledVector(sideways, -.31).add(point(0, height * .009, 0)), end],
      radius * between(.33, .55), .06, 7);
    }
    const turn = random() * TAU;
    let count = 0;
    for (let arm = 0; arm < 7; arm++) {
      const angle = turn + arm * 2.39996 + between(-.28, .28);
      const start = trunk.getPoint(.33 + arm * .095);
      const reach = height * between(.17, .245) * (1 - arm * .027);
      const end = start.clone().add(point(Math.cos(angle) * reach,
        height * between(.13, .26), Math.sin(angle) * reach));
      const elbow = start.clone().lerp(end, .52).add(point(
        Math.cos(angle - .62) * height * .038, -height * .037, Math.sin(angle - .62) * height * .038));
      const major = branch([start, elbow, end], radius * between(.40, .66), .27, 8);
      const forkCount = height > 3.05 ? 4 : 3;
      for (let fork = 0; fork < forkCount; fork++) {
        const bearing = angle + between(-1.25, 1.25);
        const root = major.getPoint(.36 + fork * .19);
        const extent = height * between(.08, .13);
        const tip = root.clone().add(point(Math.cos(bearing) * extent,
          height * between(.08, .17), Math.sin(bearing) * extent));
        const middle = root.clone().lerp(tip, .52).add(point(0, -height * .022, 0));
        const secondary = branch([root, middle, tip], radius * between(.14, .23), .23, 5);
        const cloud = new THREE.Box3();
        for (let twig = 0; twig < 3; twig++) {
          const azimuth = bearing + between(-1.55, 1.55);
          const base = secondary.getPoint(.37 + twig * .29);
          const twigLength = height * between(.06, .092);
          const finish = base.clone().add(point(Math.cos(azimuth) * twigLength,
            height * between(.025, .095), Math.sin(azimuth) * twigLength));
          const curve = branch([base, base.clone().lerp(finish, .55).add(point(0, .016 * height, 0)), finish],
            radius * .065, .13, 3);

          const nodes = 3;
          for (let node = 0; node < nodes; node++) {
            const t = .2 + node * (.77 / nodes) + between(0, .07);
            const nodePoint = curve.getPoint(t);
            const nodeAngle = between(0, TAU);
            for (let bloom = 0; bloom < 8; bloom++) {
              const a = nodeAngle + bloom * 2.39996 + between(-.4, .4);
              const spread = height * between(.023, .056);
              const latitude = (bloom + .5) / 8 * 2 - 1;
              const horizontal = Math.sqrt(1 - latitude * latitude);
              const flowerPoint = nodePoint.clone().add(point(Math.cos(a) * spread * horizontal,
                latitude * spread * .79 + height * .015, Math.sin(a) * spread * horizontal));
              const normal = point(Math.cos(a) * between(.35, .9), between(-.25, 1.0), Math.sin(a) * between(.35, .9)).normalize();
              const orientation = new THREE.Quaternion().setFromUnitVectors(UP, normal)
                .multiply(new THREE.Quaternion().setFromAxisAngle(UP, between(0, TAU)));
              const size = Math.min(.075, height * between(.0165, .023));
              const tint = flowerTint.clone().lerp(pick(flowerPalette), between(0, .4));
              addRecord(blossoms, flowerPoint, size, orientation, tint);
              cloud.expandByPoint(flowerPoint);
              count++;
            }
          }
          for (let i = 0; i < 2; i++) {
            const leafPoint = curve.getPoint(between(.40, 1));
            const leafBearing = azimuth + (i ? 1 : -1) * between(.55, 1.4);
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
              between(.55, 1.3), leafBearing, between(-.55, .55), 'YXZ'));
            addRecord(leaves, leafPoint, height * between(.060, .090), rotation, pick(leafPalette));
          }
          const budPoint = curve.getPoint(between(.72, 1));
          addRecord(buds, budPoint, height * between(.008, .012),
            new THREE.Quaternion().setFromUnitVectors(UP, curve.getTangent(.9)),
            new THREE.Color('#c16a8c').lerp(flowerTint, .34), [.67, 1.15, .67]);
        }
        const center = cloud.getCenter(new THREE.Vector3());
        const size = cloud.getSize(new THREE.Vector3()).multiplyScalar(.34).addScalar(height * .025);
        const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
        proxy.position.copy(center);
        proxy.scale.copy(size);
        proxy.updateMatrixWorld(true);
        occluders.push(proxy);
      }
    }
    // Ground petals use the same flower mesh, with its silhouette still visible close up.
    for (let i = 0; i < 34; i++) {
      const angle = random() * TAU;
      const reach = height * between(.08, .50);
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
      if (!isLand(px, pz)) continue;
      addRecord(blossoms, point(px, landHeight(px, pz) + .025, pz), height * between(.009, .017),
        new THREE.Quaternion().setFromAxisAngle(UP, angle), flowerTint);
    }
    treeRoots.push({ x, z, height, flowers: count });
    treeRanges.push({ first: firstBlossom, last: blossoms.length, center: origin.clone().add(point(0, height * .7, 0)) });
    return { bounds: treeBounds, center: treeBounds.getCenter(new THREE.Vector3()), flowers: count };
  }

  function instanced(records, geometry, material, name, castShadow) {
    const mesh = new THREE.InstancedMesh(geometry, material, records.length);
    records.forEach((record, index) => {
      mesh.setMatrixAt(index, record.matrix);
      mesh.setColorAt(index, record.color);
    });
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }

  function finish() {
    if (complete) throw new Error('Peach builder has already finished.');
    complete = true;
    const woodMesh = new THREE.Mesh(geometryFrom(wood.positions, wood.colors, wood.uvs, wood.indices), woodMaterial());
    woodMesh.name = '桃树 弯曲主干与末级枝条';
    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;
    scene.add(woodMesh);
    const snowMesh = new THREE.Mesh(geometryFrom(snowWood.positions, snowWood.colors, snowWood.uvs, snowWood.indices),
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .88, side: THREE.DoubleSide }));
    snowMesh.name = '桃枝积雪';
    snowMesh.castShadow = false;
    snowMesh.receiveShadow = true;
    snowMesh.visible = false;
    scene.add(snowMesh);
    const flowerGeometry = makeFlower();
    const distantFlowerGeometry = makeDistantFlower();
    const flowerMaterial = plantMaterial('flower', clock);
    const flowers = treeRanges.map((range) => ({
      mesh: instanced(blossoms.slice(range.first, range.last), distantFlowerGeometry, flowerMaterial,
        '五瓣桃花与花蕊', true), center: range.center, detailed: false,
    }));
    const foliage = instanced(leaves, makeLeaf(), plantMaterial('leaf', clock), '桃树披针形嫩叶', true);
    const budMesh = instanced(buds, budGeometry,
      new THREE.MeshStandardMaterial({ roughness: .78 }), '桃树花苞', true);
    const crownOccluders = [...occluders];
    occluders.push(woodMesh);
    const stats = { trees: treeRoots.length, flowers: blossoms.length, leaves: leaves.length, buds: buds.length,
      triangles: wood.indices.length / 3 + snowWood.indices.length / 3
        + distantFlowerGeometry.index.count / 3 * blossoms.length + foliage.geometry.index.count / 3 * foliage.count
        + budGeometry.index.count / 3 * budMesh.count };
    function update(time, winter = seasonUniform?.value || 0, night = 0, camera) {
      clock.value = time;
      const flowering = winter < .56;
      for (const flowerTree of flowers) {
        flowerTree.mesh.visible = flowering;
        if (camera) {
          const distance = camera.position.distanceToSquared(flowerTree.center);
          if (distance < 169) flowerTree.detailed = true;
          else if (distance > 225) flowerTree.detailed = false;
        }
        flowerTree.mesh.geometry = flowerTree.detailed ? flowerGeometry : distantFlowerGeometry;
      }
      foliage.visible = flowering;
      budMesh.visible = flowering;
      snowMesh.visible = !flowering;
      for (const proxy of crownOccluders) {
        proxy.visible = flowering;
        proxy.layers.mask = flowering ? 1 : 0;
      }
    }
    update(0);
    return { update, occluders, stats };
  }

  return { addTree, finish };
}
