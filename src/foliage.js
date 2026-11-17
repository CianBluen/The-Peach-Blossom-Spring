import * as THREE from 'three';
import { landHeight, isLand, seeded } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function leafTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = seeded(31647);
  const base = context.createLinearGradient(0, 512, 256, 0);
  base.addColorStop(0, '#b2bd8c');
  base.addColorStop(.28, '#c9d3a7');
  base.addColorStop(.63, '#e1e7ba');
  base.addColorStop(1, '#b4c18d');
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 5200; i++) {
    context.fillStyle = random() < .52 ? 'rgba(49,72,19,.055)' : 'rgba(255,255,219,.12)';
    context.fillRect(random() * 256, random() * 512, 1 + random() * 2, 1 + random() * 3);
  }
  context.strokeStyle = 'rgba(77,104,28,.25)';
  context.lineWidth = 3;
  for (let row = 0; row < 10; row++) {
    const rootY = 466 - row * 39;
    for (const sign of [-1, 1]) {
      const endX = 128 + sign * (111 - row * 4.3);
      context.beginPath();
      context.moveTo(128, rootY + 1);
      context.bezierCurveTo(128 + sign * 35, rootY - 2, endX, rootY - 36, endX, rootY - 76);
      context.stroke();
      context.strokeStyle = 'rgba(242,247,195,.42)';
      context.lineWidth = 1.05;
      context.beginPath();
      context.moveTo(128, rootY - 1);
      context.bezierCurveTo(128 + sign * 34, rootY - 4, endX, rootY - 38, endX, rootY - 78);
      context.stroke();
      context.strokeStyle = 'rgba(94,119,45,.16)';
      context.lineWidth = .6;
      for (let twig = 1; twig < 5; twig++) {
        const t = twig / 5;
        const x = 128 + (endX - 128) * t;
        const y = rootY - 54 * t * t;
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(x + sign * 14, y - 23, x + sign * 18, y - 40);
        context.stroke();
      }
      context.strokeStyle = 'rgba(77,104,28,.25)';
      context.lineWidth = 3;
    }
  }
  context.strokeStyle = 'rgba(70,91,28,.45)';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(129, 512);
  context.quadraticCurveTo(123, 234, 129, 0);
  context.stroke();
  context.strokeStyle = '#ecedba';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(127, 512);
  context.quadraticCurveTo(121, 234, 127, 0);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function barkTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = seeded(27941);
  context.fillStyle = '#ad9b86';
  context.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 900; i++) {
    const x = random() * 256;
    const y = random() * 512;
    const length = 11 + random() * 110;
    context.strokeStyle = `rgba(${random() < .6 ? '49,36,25' : '235,221,191'},${.08 + random() * .3})`;
    context.lineWidth = .4 + random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x - 2, y + length * .3, x + 3, y + length * .6, x + (random() - .5) * 7, y + length);
    context.stroke();
  }
  for (let i = 0; i < 165; i++) {
    context.fillStyle = `rgba(129,147,100,${.08 + random() * .16})`;
    context.beginPath();
    context.ellipse(random() * 256, random() * 512, random() * 8 + 2, random() * 4 + 1, random() * 3, 0, TAU);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function reliefTexture(colorTexture) {
  if (!colorTexture) return null;
  const texture = colorTexture.clone();
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// A folded blade has its petiole at the origin, with the long axis along +Y.
function leafGeometry() {
  const positions = [], uvs = [], indices = [];
  const rows = [0, .15, .36, .61, .83, 1];
  const widths = [0, .18, .29, .25, .145, 0];
  for (let row = 0; row < rows.length; row++) {
    const t = rows[row];
    const bend = .14 * Math.sin(t * Math.PI) - .11 * t * t;
    for (const side of [-1, 0, 1]) {
      const width = widths[row] * side;
      positions.push(width, t, bend + (side ? -.045 * Math.sin(t * Math.PI) : .018));
      uvs.push((side + 1) / 2, t);
    }
    if (row === 0) continue;
    const lower = (row - 1) * 3;
    const upper = row * 3;
    if (row > 1) indices.push(lower, lower + 1, upper, lower + 1, lower + 2, upper + 2);
    if (row < rows.length - 1) indices.push(lower + 1, upper + 1, upper, lower + 1, upper + 2, upper + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function geometryFrom(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const newGeometryData = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });

function appendBranch(data, points, startRadius, endRadius, color, sides = 6, snow = false) {
  const curve = new THREE.CatmullRomCurve3(points);
  const length = curve.getLength();
  const segments = points.length === 2 ? 1 : Math.min(7, points.length + 1);
  const offset = data.positions.length / 3;
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const reference = Math.abs(tangent.dot(UP)) > .93 ? v(1, 0, 0) : UP;
    const vertical = reference.clone().addScaledVector(tangent, -reference.dot(tangent)).normalize();
    const horizontal = new THREE.Vector3().crossVectors(tangent, vertical).normalize();
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    for (let side = 0; side <= sides; side++) {
      const angle = snow ? -.92 + side / sides * 1.84 : side / sides * TAU;
      const normal = vertical.clone().multiplyScalar(Math.cos(angle)).addScaledVector(horizontal, Math.sin(angle));
      const ripple = snow ? 1 : 1 + .047 * Math.sin(side * 7.1 + row * .39);
      const point = center.clone().addScaledVector(normal, radius * ripple + (snow ? .018 : 0));
      data.positions.push(point.x, point.y, point.z);
      data.normals.push(normal.x, normal.y, normal.z);
      data.uvs.push(side / sides * 1.9, t * length * 1.8);
      const shade = snow ? 1 : .86 + .14 * t + .06 * Math.cos(angle);
      data.colors.push(color.r * shade, color.g * shade, color.b * shade);
      if (row > 0 && side > 0) {
        const i = offset + row * (sides + 1) + side;
        const lower = i - sides - 1;
        data.indices.push(lower - 1, lower, i - 1, lower, i, i - 1);
      }
    }
  }
}

function attachWind(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.leafTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform float leafTime;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 origin = instanceMatrix[3].xyz;
        float flutter = sin(leafTime * 1.23 + origin.x * 1.13 + origin.z * .81);
        float flutterFine = sin(leafTime * 2.84 + origin.x * 4.3 - origin.z * 3.9);
        transformed.z += (flutter * .031 + flutterFine * .012) * position.y * position.y;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'veined-deciduous-leaf-1';
}

export function createLeafyTreeBuilder(scene, seasonUniform) {
  const leafRecords = [];
  const wood = newGeometryData();
  const frost = newGeometryData();
  const canopyProxies = [];
  const treeCenters = [];
  const leafColors = ['#718c3f', '#8caa4c', '#b0bb63', '#7e9f44', '#a2b85b', '#668341', '#c1c577']
    .map((value) => new THREE.Color(value));
  const barkColors = ['#92785c', '#8a7159', '#a0896b', '#76634f'].map((value) => new THREE.Color(value));
  const proxyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const proxyMaterial = new THREE.MeshBasicMaterial();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const leafBasis = new THREE.Matrix4();

  function addTree(x, z, height, seed = 17) {
    if (!isLand(x, z)) return;
    const firstIndex = wood.indices.length;
    const firstVertex = wood.positions.length;
    const random = seeded(seed);
    const between = (lo, hi) => THREE.MathUtils.lerp(lo, hi, random());
    const ground = landHeight(x, z);
    const at = (dx, dy, dz) => v(x + dx * height, ground + dy * height, z + dz * height);
    const bark = barkColors[Math.floor(random() * barkColors.length)];
    const base = at(0, -.026, 0);
    const leanX = between(-.095, .095);
    const leanZ = between(-.085, .085);
    const trunkPoints = [base, at(leanX * .31, .2, leanZ * .22), at(leanX, .45, leanZ),
      at(leanX * 1.18, .66, leanZ * .8), at(leanX * .6, .85, leanZ * 1.4)];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const radius = between(.037, .049) * height;
    appendBranch(wood, trunkPoints, radius, radius * .13, bark, 8);
    for (let root = 0; root < 6; root++) {
      const angle = root * TAU / 6 + between(-.25, .25);
      const distance = height * between(.14, .22);
      const footX = x + Math.cos(angle) * distance;
      const footZ = z + Math.sin(angle) * distance;
      if (!isLand(footX, footZ)) continue;
      const foot = v(footX, landHeight(footX, footZ) + .006, footZ);
      const middle = at(Math.cos(angle) * .07, .025, Math.sin(angle) * .07);
      appendBranch(wood, [at(0, .045, 0), middle, foot], radius * .53, .006 * height, bark, 5);
    }

    const arms = height < 1.5 ? 7 : 9;
    const sprays = height < 1.5 ? 4 : 5;
    const leafPairs = height < 1.5 ? 3 : 4;
    const spin = between(0, TAU);
    const treeTint = leafColors[Math.floor(random() * leafColors.length)];
    for (let arm = 0; arm < arms; arm++) {
      const angle = spin + arm * 2.39996 + between(-.2, .2);
      const high = arm / (arms - 1);
      const origin = trunkCurve.getPoint(.29 + high * .43);
      const reach = height * between(.32, .43) * (1 - .29 * high);
      const lift = height * between(.12, .22);
      const elbow = origin.clone().add(v(Math.cos(angle) * reach * .62, lift * .46, Math.sin(angle) * reach * .62));
      const tip = origin.clone().add(v(Math.cos(angle + .13) * reach, lift, Math.sin(angle + .13) * reach));
      const thickness = radius * (.47 - high * .19);
      appendBranch(wood, [origin, elbow, tip], thickness, thickness * .2, bark, 6);
      appendBranch(frost, [origin, elbow, tip], thickness * 1.01, thickness * .2, new THREE.Color('#dce4df'), 4, true);

      for (let spray = 0; spray < sprays; spray++) {
        const atArm = .38 + spray / sprays * .6;
        const root = elbow.clone().lerp(tip, atArm);
        const bearing = angle + (spray % 2 ? -1 : 1) * between(.48, 1.35);
        const spread = height * between(.11, .2);
        const bend = root.clone().add(v(Math.cos(bearing) * spread * .52, height * .044, Math.sin(bearing) * spread * .52));
        const end = root.clone().add(v(Math.cos(bearing) * spread, height * between(.04, .12), Math.sin(bearing) * spread));
        appendBranch(wood, [root, bend, end], thickness * .3, height * .0018, bark, 4);
        for (let twig = 0; twig < 3; twig++) {
          const start = root.clone().lerp(end, .37 + twig * .2);
          const direction = bearing + (twig - 1) * .92 + between(-.18, .18);
          const reachTwig = height * between(.105, .155);
          const twigEnd = start.clone().add(v(Math.cos(direction) * reachTwig, height * between(.012, .065), Math.sin(direction) * reachTwig));
          appendBranch(wood, [start, twigEnd], height * .0024, height * .0007, bark, 4);
          for (let node = 0; node <= leafPairs; node++) {
            const fraction = .09 + .86 * node / leafPairs;
            for (const sign of [-1, 1]) {
              const attach = start.clone().lerp(twigEnd, fraction);
              const leafAngle = direction + sign * between(.72, 1.23);
              const leafSize = height * between(.083, .118) * (1 - .18 * fraction);
              const bladeDirection = v(Math.cos(leafAngle), between(-.45, .6), Math.sin(leafAngle)).normalize();
              const leafNormal = UP.clone().addScaledVector(bladeDirection, -UP.dot(bladeDirection)).normalize();
              leafNormal.applyAxisAngle(bladeDirection, between(-.94, .94));
              const across = new THREE.Vector3().crossVectors(bladeDirection, leafNormal).normalize();
              leafBasis.makeBasis(across, bladeDirection, leafNormal);
              rotation.setFromRotationMatrix(leafBasis);
              scale.set(leafSize * between(.99, 1.25), leafSize, leafSize);
              matrix.compose(attach, rotation, scale);
              const shade = leafColors[Math.floor(random() * leafColors.length)].clone().lerp(treeTint, .4);
              shade.multiplyScalar(between(.91, 1.1) + high * .04);
              leafRecords.push({ matrix: matrix.clone(), color: shade });
            }
          }
        }
        const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
        proxy.position.copy(end);
        proxy.scale.set(height * .13, height * .11, height * .13);
        proxy.updateMatrixWorld(true);
        canopyProxies.push(proxy);
      }
    }
    const bounds = new THREE.Box3();
    const vertex = new THREE.Vector3();
    for (let i = firstVertex; i < wood.positions.length; i += 3) {
      vertex.set(wood.positions[i], wood.positions[i + 1], wood.positions[i + 2]);
      bounds.expandByPoint(vertex);
    }
    treeCenters.push({ x, z, height, bounds, firstIndex, indexCount: wood.indices.length - firstIndex });
  }

  function finish() {
    const time = { value: 0 };
    const leafMap = leafTexture();
    const material = new THREE.MeshStandardMaterial({
      map: leafMap, bumpMap: reliefTexture(leafMap), bumpScale: .009,
      color: 0xffffff, roughness: .81, side: THREE.DoubleSide,
      emissive: 0x52642c, emissiveIntensity: .035,
    });
    attachWind(material, time);
    const leaves = new THREE.InstancedMesh(leafGeometry(), material, leafRecords.length);
    leaves.name = '桑叶 · 单片叶脉与弯曲叶面';
    for (let i = 0; i < leafRecords.length; i++) {
      leaves.setMatrixAt(i, leafRecords[i].matrix);
      leaves.setColorAt(i, leafRecords[i].color);
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.computeBoundingSphere();
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    attachWind(leaves.customDepthMaterial, time);

    const barkMap = barkTexture();
    const woodMesh = new THREE.Mesh(geometryFrom(wood), new THREE.MeshStandardMaterial({
      map: barkMap, bumpMap: reliefTexture(barkMap), bumpScale: .027,
      vertexColors: true, roughness: .96,
    }));
    woodMesh.name = '桑树 · 弯曲树干、分枝与须根';
    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;
    // Reuse the same vertex buffers with a small bound per tree for pointer rays.
    const woodOccluders = treeCenters.map(({ bounds, firstIndex, indexCount }) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', woodMesh.geometry.attributes.position);
      geometry.setAttribute('normal', woodMesh.geometry.attributes.normal);
      geometry.setIndex(woodMesh.geometry.index);
      geometry.setDrawRange(firstIndex, indexCount);
      geometry.boundingBox = bounds;
      geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
      return new THREE.Mesh(geometry, proxyMaterial);
    });
    const frostMesh = new THREE.Mesh(geometryFrom(frost), new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: .93,
    }));
    frostMesh.name = '桑枝覆雪';
    frostMesh.receiveShadow = true;
    frostMesh.castShadow = true;
    frostMesh.visible = false;
    scene.add(woodMesh, leaves, frostMesh);
    let previousWinter = false;
    return {
      occluders: [...woodOccluders, ...canopyProxies],
      stats: { trees: treeCenters.length, leaves: leafRecords.length, woodTriangles: wood.indices.length / 3,
        leafTriangles: leafRecords.length * leaves.geometry.index.count / 3 },
      update(elapsed, winter = seasonUniform?.value || 0) {
        time.value = elapsed;
        const isWinter = winter > .62;
        if (isWinter === previousWinter) return;
        leaves.visible = !isWinter;
        frostMesh.visible = isWinter;
        for (const proxy of canopyProxies) {
          proxy.visible = !isWinter;
          if (isWinter) proxy.layers.disable(0);
          else proxy.layers.enable(0);
        }
        previousWinter = isWinter;
      },
    };
  }

  return { addTree, finish };
}
