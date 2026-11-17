import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain } from './terrain.js';
import { createVillage } from './village.js';
import { createWater } from './water.js';
import { islandBottom, islandRadius, isInsideIsland, landHeight, riverX, seeded } from './world.js';
import './style.css';

const stage = document.querySelector('#stage');
const status = document.querySelector('#scene-status');
const experience = document.querySelector('.experience');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchScreen = matchMedia('(pointer: coarse)').matches;

function snowParticles(scene) {
  const random = seeded(886);
  const count = touchScreen ? 370 : 680;
  const seeds = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (islandRadius(angle) + 3.5);
    seeds[i * 3] = Math.cos(angle) * radius;
    seeds[i * 3 + 1] = random() * 14;
    seeds[i * 3 + 2] = Math.sin(angle) * radius;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, pixels: { value: 1 } },
    vertexShader: `
      uniform float time;
      uniform float pixels;
      varying float vAlpha;
      void main() {
        float seed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 p = position;
        p.y = mod(p.y - time * (.69 + seed * .57), 14.0) - .15;
        p.x += .65 * sin(time * (.52 + seed * .27) + position.y) + .19 * p.y;
        p.z += .58 * cos(position.y * 1.4 + time * .51);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((.032 + .045 * seed) * pixels / max(1.0, -mv.z), .9, 6.8);
        vAlpha = (.5 + seed * .5) * smoothstep(0.0, .7, p.y) * (1.0 - smoothstep(12.6, 13.7, p.y));
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - vec2(.5));
        gl_FragColor = vec4(.94, .97, 1.0, (1.0 - smoothstep(.18, .49, r)) * vAlpha * opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const flakes = new THREE.Points(geometry, material);
  flakes.frustumCulled = false;
  flakes.visible = false;
  flakes.renderOrder = 5;
  scene.add(flakes);
  return flakes;
}

function studioShadow(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(210, 210), new THREE.ShadowMaterial({ opacity: .18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = islandBottom - .055;
  floor.receiveShadow = true;
  scene.add(floor);

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(57, 63), new THREE.ShaderMaterial({
    uniforms: { strength: { value: .22 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float strength; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - .5) * vec2(2.76, 2.7);
        float shape = pow(abs(p.x + .07 * p.y), 2.65) + pow(abs(p.y), 2.65);
        gl_FragColor = vec4(.14, .107, .081, (1.0 - smoothstep(.42, 1.17, shape)) * strength);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(1.3, islandBottom - .045, -1);
  scene.add(contact);
  return { floor, contact };
}

const presets = {
  island: { eye: [18, 27, 42], target: [0, .35, .9] },
  grove: { eye: [-8.6, 5.45, 26.65], target: [-5.0, 1.2, 13.5] },
  village: { eye: [12, 8.4, 7.1], target: [3, 1.2, -7.1] },
};

function applyPressed(attribute, value) {
  for (const button of document.querySelectorAll(`[${attribute}]`)) {
    button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === value));
  }
}

function initialize() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '拖动可环绕观察小岛');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .12, 215);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .092;
  controls.enablePan = false;
  controls.rotateSpeed = .67;
  controls.zoomSpeed = .86;
  controls.minDistance = 4.6;
  controls.maxDistance = 170;
  controls.minPolarAngle = .26;
  controls.maxPolarAngle = 1.42;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  const colors = {
    daySky: new THREE.Color(0xfff1d5), dayGround: new THREE.Color(0x9c8267),
    winterSky: new THREE.Color(0xe1eaff), winterGround: new THREE.Color(0xb8bbba),
    nightSky: new THREE.Color(0x9bbbff), nightGround: new THREE.Color(0x53587d),
    daySun: new THREE.Color(0xffe1a9), winterSun: new THREE.Color(0xfff5dd),
    moon: new THREE.Color(0x9fbbfd),
  };
  const hemisphere = new THREE.HemisphereLight(colors.daySky, colors.dayGround, 1.7);
  const sun = new THREE.DirectionalLight(colors.daySun, 2.65);
  sun.position.set(-22, 29, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(touchScreen ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -29, right: 29, top: 27, bottom: -27, near: 1, far: 85 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .065;
  sun.shadow.bias = -.0002;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  const rim = new THREE.DirectionalLight(0xa6c6f4, 0.38);
  rim.position.set(12, 14, -19);
  scene.add(hemisphere, sun, sun.target, rim);

  const shadow = studioShadow(scene);
  const terrain = createTerrain(scene);
  const village = createVillage(scene);
  const water = createWater(scene);
  water.setBridgeLamp(village.bridgeLamp);
  const snow = snowParticles(scene);
  const occluders = [...terrain.occluders, ...village.occluders, ...water.occluders];

  let selectedView = 'island';
  let desiredWinter = 0;
  let desiredNight = 0;
  let winter = 0;
  let night = 0;
  let viewport;
  let transition;
  let manuallyMoved = false;
  let lastFrame;
  let time = 0;
  let lastShadowUpdate = -1;
  let contextLost = false;

  const overviewSamples = [];
  for (let j = 0; j < 64; j++) {
    const angle = j * Math.PI / 32;
    const radius = islandRadius(angle);
    for (const fraction of [.67, .86, 1]) {
      const x = Math.cos(angle) * radius * fraction;
      const z = Math.sin(angle) * radius * fraction;
      overviewSamples.push(new THREE.Vector3(x, islandBottom, z));
      overviewSamples.push(new THREE.Vector3(x, landHeight(x, z) + (fraction === 1 ? .55 : 2.75), z));
    }
  }
  const fitCamera = new THREE.PerspectiveCamera(34, 1, .12, 215);
  const projection = new THREE.Vector3();
  const adjusted = new THREE.Vector3();

  function viewPose(name) {
    const { eye, target: look } = presets[name];
    const target = new THREE.Vector3(...look);
    const offset = new THREE.Vector3(...eye).sub(target);
    if (name === 'island') {
      const horizontalMargin = camera.aspect < .9 ? .86 : .94;
      fitCamera.aspect = camera.aspect;
      fitCamera.updateProjectionMatrix();
      let low = .8;
      let high = 3.2;
      for (let i = 0; i < 15; i++) {
        const scale = (low + high) / 2;
        fitCamera.position.copy(target).addScaledVector(offset, scale);
        fitCamera.lookAt(target);
        fitCamera.updateMatrixWorld();
        const fits = overviewSamples.every((sample) => {
          projection.copy(sample).project(fitCamera);
          return Math.abs(projection.x) <= horizontalMargin && Math.abs(projection.y) <= .92 && projection.z < 1;
        });
        if (fits) high = scale;
        else low = scale;
      }
      offset.multiplyScalar(high);
    } else {
      offset.multiplyScalar(Math.max(1, .83 / camera.aspect));
    }
    return { target, eye: target.clone().add(offset) };
  }

  function keepCameraAboveScene() {
    const { x, y, z } = camera.position;
    if (!isInsideIsland(x, z)) return;
    let surface = landHeight(x, z);
    if (z > -2.4 && z < 5.8 && Math.abs(x - riverX(z)) < 4.75) surface = Math.max(surface, 6.1);
    if (z > -17 && z < -2 && x > -11.8 && x < 15.9) surface += 3.3;
    if (z > 6 && Math.abs(x - riverX(z)) > 2.9) surface += 2.4;
    if (y >= surface + .64) return;
    adjusted.set(x, surface + .64, z);
    camera.position.copy(adjusted);
    camera.lookAt(controls.target);
  }

  function setView(name, animate = true) {
    selectedView = name;
    manuallyMoved = false;
    experience.dataset.camera = name;
    applyPressed('data-view', name);
    const pose = viewPose(name);
    if (animate && !reducedMotion.matches) {
      transition = { pose, start: time, eye: camera.position.clone(), target: controls.target.clone() };
    } else {
      transition = undefined;
      controls.target.copy(pose.target);
      camera.position.copy(pose.eye);
      controls.update();
      keepCameraAboveScene();
    }
  }

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, touchScreen ? 1.35 : 1.65));
    renderer.setSize(width, height, false);
    viewport = canvas.getBoundingClientRect();
    snow.material.uniforms.pixels.value = height * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  for (const button of document.querySelectorAll('button[data-view]')) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }
  for (const button of document.querySelectorAll('[data-light]')) {
    button.addEventListener('click', () => {
      desiredNight = Number(button.dataset.light === 'night');
      experience.dataset.night = String(Boolean(desiredNight));
      applyPressed('data-light', button.dataset.light);
    });
  }
  for (const button of document.querySelectorAll('[data-season]')) {
    button.addEventListener('click', () => {
      desiredWinter = Number(button.dataset.season === 'winter');
      experience.dataset.winter = String(Boolean(desiredWinter));
      applyPressed('data-season', button.dataset.season);
    });
  }

  let orbiting = false;
  let lastSample = -1;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitList = [];
  const blockers = [];
  const lastRipple = new THREE.Vector3(Infinity, Infinity, Infinity);
  const touches = new Set();
  let tap;

  function ripple(event, strength) {
    if (!viewport || time - lastSample < .045) return;
    lastSample = time;
    ndc.set((event.clientX - viewport.left) * 2 / viewport.width - 1,
      1 - (event.clientY - viewport.top) * 2 / viewport.height);
    ray.setFromCamera(ndc, camera);
    ray.far = Infinity;
    hitList.length = 0;
    ray.intersectObject(water.mesh, false, hitList);
    const hit = hitList[0];
    if (!hit || (strength < 1 && lastRipple.distanceToSquared(hit.point) < .042)) return;
    ray.far = hit.distance - .025;
    blockers.length = 0;
    ray.intersectObjects(occluders, true, blockers);
    if (blockers.some(({ object }) => {
      for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
      }
      return true;
    })) return;
    lastRipple.copy(hit.point);
    water.disturb(hit.point, time, strength);
  }

  controls.addEventListener('start', () => {
    orbiting = true;
    manuallyMoved = true;
    transition = undefined;
  });
  controls.addEventListener('end', () => { orbiting = false; });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = undefined;
      return;
    }
    if (!orbiting && !event.buttons && !transition) ripple(event, .72);
  });
  canvas.addEventListener('pointerleave', () => lastRipple.set(Infinity, Infinity, Infinity));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    touches.add(event.pointerId);
    tap = touches.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, time } : undefined;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (tap?.id === event.pointerId && time - tap.time < .5) ripple(event, 1);
    touches.delete(event.pointerId);
    tap = undefined;
  });
  canvas.addEventListener('pointercancel', (event) => { touches.delete(event.pointerId); tap = undefined; });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    status.hidden = false;
    status.textContent = '图形连接中断，正在等待恢复…';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    status.hidden = true;
    sun.shadow.needsUpdate = true;
  });

  const resizeObserver = new ResizeObserver(() => {
    const previousAspect = camera.aspect;
    resize();
    if (!manuallyMoved && Math.abs(previousAspect - camera.aspect) > .015) setView(selectedView, Boolean(transition));
  });
  resize();
  setView('island', false);
  resizeObserver.observe(stage);

  renderer.setAnimationLoop((now) => {
    const dt = lastFrame === undefined ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    if (contextLost) return;
    time += dt;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 4.5);
    winter = THREE.MathUtils.lerp(winter, desiredWinter, blend);
    night = THREE.MathUtils.lerp(night, desiredNight, blend);

    if (transition) {
      const t = Math.min(1, (time - transition.start) / 1.13);
      const eased = t * t * (3 - 2 * t);
      controls.target.lerpVectors(transition.target, transition.pose.target, eased);
      camera.position.lerpVectors(transition.eye, transition.pose.eye, eased);
      if (t === 1) transition = undefined;
    }
    controls.update();
    keepCameraAboveScene();

    hemisphere.color.copy(colors.daySky).lerp(colors.winterSky, winter).lerp(colors.nightSky, night);
    hemisphere.groundColor.copy(colors.dayGround).lerp(colors.winterGround, winter).lerp(colors.nightGround, night);
    hemisphere.intensity = THREE.MathUtils.lerp(1.84, .69, night);
    sun.color.copy(colors.daySun).lerp(colors.winterSun, winter).lerp(colors.moon, night);
    sun.intensity = THREE.MathUtils.lerp(2.55 - winter * .28, .19, night);
    rim.intensity = THREE.MathUtils.lerp(.35, .46, night);
    shadow.floor.material.opacity = .085 - night * .04;
    shadow.contact.material.uniforms.strength.value = .26 - night * .075;

    terrain.update(time, winter, night, camera);
    village.update(time, winter, night);
    water.update(time, winter, night);
    snow.visible = winter > .014;
    snow.material.uniforms.opacity.value = winter * .82;
    snow.material.uniforms.time.value = time;
    if (time - lastShadowUpdate > .19) {
      sun.shadow.needsUpdate = true;
      lastShadowUpdate = time;
    }
    renderer.render(scene, camera);
    if (!status.hidden) status.hidden = true;
  });

  if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
    window.peachScene = { scene, camera, controls, renderer, water, terrain, village };
  }
}

try {
  initialize();
} catch (error) {
  status.textContent = '三维场景未能启动，请确认浏览器支持 WebGL 2。';
  console.error(error);
}
