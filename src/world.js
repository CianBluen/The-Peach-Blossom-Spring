const riverSections = [
  [-19, 6.0, 0.2], [-16, 8.0, 1.45], [-12, 7.75, 1.55],
  [-8, 4.65, 1.67], [-5, 0.8, 1.8], [-1.2, -3.05, 1.8],
  [4.8, -3.55, 2.2], [8, -4.1, 2.75], [13, -5.15, 3.6],
  [17, -6.35, 3.85], [22, -6.05, 4.0],
];

export const waterStart = -18;
export const waterEnd = 22;
export const cave = { front: 4.8, back: -1.2, height: 3.6 };

function interpolateRiver(z, column) {
  const index = riverSections.findIndex((section, i) => i > 0 && z <= section[0]);
  if (index === -1) return riverSections.at(-1)[column];
  const a = riverSections[index - 1];
  const b = riverSections[index];
  const previous = riverSections[Math.max(0, index - 2)];
  const next = riverSections[Math.min(riverSections.length - 1, index + 1)];
  const span = b[0] - a[0];
  const t = Math.max(0, (z - a[0]) / span);
  const slopeA = (b[column] - previous[column]) / (b[0] - previous[0]);
  const slopeB = (next[column] - a[column]) / (next[0] - a[0]);
  const square = t * t;
  const cube = square * t;
  return (2 * cube - 3 * square + 1) * a[column]
    + (cube - 2 * square + t) * span * slopeA
    + (-2 * cube + 3 * square) * b[column]
    + (cube - square) * span * slopeB;
}

export const riverX = (z) => interpolateRiver(z, 1);
export const riverWidth = (z) => interpolateRiver(z, 2);

export function islandRadius(angle) {
  const power = 2.75;
  const length = Math.sin(angle) > 0 ? 20.8 : 20.1;
  const side = 18.0 + 0.8 * Math.cos(2 * angle + 0.8) - 0.55 * Math.sin(angle);
  const shape = Math.abs(Math.cos(angle) / side) ** power + Math.abs(Math.sin(angle) / length) ** power;
  const irregularity = 1 + .023 * Math.sin(angle * 5 + 0.3) + .018 * Math.cos(angle * 9 - 0.4)
    + .01 * Math.sin(angle * 15);
  return irregularity * shape ** (-1 / power);
}

export function isInsideIsland(x, z) {
  return Math.hypot(x, z) <= islandRadius(Math.atan2(z, x));
}

export function smoothstep(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function hill(x, z, cx, cz, width, length, height) {
  return height * Math.exp(-(((x - cx) / width) ** 2 + ((z - cz) / length) ** 2));
}

export const islandBottom = -1.55;
const villageTerraces = [
  { x: -1.7, z: -10.8, halfWidth: 2.02, halfDepth: 1.43, height: .47 },
  { x: -6.9, z: -9.4, halfWidth: 1.88, halfDepth: 1.31, height: .66 },
  { x: 2.95, z: -12.7, halfWidth: 1.52, halfDepth: 1.17, height: .57 },
  { x: 10.9, z: -9.55, halfWidth: 1.79, halfDepth: 1.39, height: 1.08 },
  { x: -6.6, z: -12.8, halfWidth: 1.75, halfDepth: 1.24, height: 1.95 },
  { x: 12.75, z: -12.65, halfWidth: 1.52, halfDepth: 1.10, height: 2.25 },
];

export function landHeight(x, z) {
  const radius = islandRadius(Math.atan2(z, x));
  const edge = radius - Math.hypot(x, z);
  const roughness = .08 * Math.sin(x * 1.7 + z * .83) * Math.cos(z * 1.3 - x * .21)
    + .07 * Math.sin(x * .83 - z * .95) + .04 * Math.cos(x * 3.6 + z * 2.6);
  const lowland = .52 + .22 * Math.sin(x * .22 + z * .15) + .1 * Math.cos(z * .37) + roughness;
  const mountains = hill(x, z, -11.8, 1.2, 4.6, 4.5, 4.6)
    + hill(x, z, -9, .2, 4.6, 3.9, 1.3)
    + hill(x, z, .8, 3, 3.5, 3.2, 1.35)
    + hill(x, z, 12.6, 2.9, 4.3, 4.8, 1.05)
    + hill(x, z, -10.6, -16.7, 5.6, 4.7, 5.9)
    + hill(x, z, -3.8, -18.5, 5.5, 3.5, 3.7)
    + hill(x, z, 4, -20.2, 5.3, 3.9, 4.65)
    + hill(x, z, 13.8, -16.8, 5.1, 4.3, 5.5)
    + hill(x, z, 16, -10.2, 3.9, 5, 1.85);
  let heights = (lowland + mountains) * (.69 + .31 * smoothstep(0, 1.7, edge));
  for (const terrace of villageTerraces) {
    const distance = Math.hypot(Math.max(0, Math.abs(x - terrace.x) - terrace.halfWidth),
      Math.max(0, Math.abs(z - terrace.z) - terrace.halfDepth));
    const blend = 1 - smoothstep(0, 1.58, distance);
    heights += (terrace.height + roughness * .28 - heights) * blend;
  }
  const channelBank = Math.abs(x - riverX(z)) - riverWidth(z);
  const channelDepth = -.38 + roughness * .26;
  const shore = smoothstep(-.65, .84, channelBank);
  const stream = smoothstep(-19.3, -17.95, z);
  return heights + (channelDepth - heights) * (1 - shore) * stream;
}

export function isLand(x, z) {
  return isInsideIsland(x, z) && landHeight(x, z) > .06;
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
