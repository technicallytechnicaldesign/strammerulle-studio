                                                                                   
export function overlapsSnapZone(min, max, targetMin, targetMax, margin = .08) {
  return [0, 1, 2].every(i => Number.isFinite(min[i]) && Number.isFinite(max[i]) &&
    Number.isFinite(targetMin[i]) && Number.isFinite(targetMax[i]) &&
    max[i] >= targetMin[i] - margin && min[i] <= targetMax[i] + margin);
}

export function rightStickIntent(x, y, deadZone = .2) {
                                                                                
  if (Math.abs(y) > deadZone && Math.abs(y) > Math.abs(x)) return { explode: y, rotate: 0 };
  if (Math.abs(x) > deadZone) return { explode: 0, rotate: x };
  return { explode: 0, rotate: 0 };
}

export function layoutCallouts(anchors, halfWidth, halfHeight) {
  const split = Math.ceil(anchors.length / 2);
  const sorted = [...anchors].sort((a, b) => a.x - b.x || a.index - b.index);
  const result = [];
  const spacing = Math.max(.17, Math.min(.23, halfHeight * .35));
  for (const [side, items] of [[-1, sorted.slice(0, split)], [1, sorted.slice(split)]]) {
    items.sort((a, b) => b.y - a.y || a.index - b.index);
    items.forEach((item, row) => result.push({ index: item.index, x: side * Math.max(.88, halfWidth + .42), y: (items.length - 1) * spacing / 2 - row * spacing, z: -.10 - (row % 2) * .10, side }));
  }
  return result;
}

                                                                                     
export function heldStickMotion(position, x, y, dt) {
  const intent = rightStickIntent(x, y);
  const distance = Math.hypot(...position);
  const next = Math.max(.12, Math.min(5, distance - intent.explode * dt * .8));
  const ratio = distance > 1e-8 ? next / distance : 0;
  return { position: distance > 1e-8 ? position.map(v => v * ratio) : [0, 0, -.12], yaw: -intent.rotate * dt * 1.4 };
}

                                                                                   
export function fallStep(min, max, velocity, dt) {
  const nextVelocity = velocity - 9.81 * dt;
  let dy = nextVelocity * dt;
  let support = 0;
                                                                                 
  const overlaps = max[0] > -.325 && min[0] < .725 && max[2] > -1.375 && min[2] < -.425;
  if (overlaps) support = 1;
  const settled = min[1] + dy <= support;
  if (settled) dy = support - min[1];
  return { dy, velocity: settled ? 0 : nextVelocity, settled };
}
