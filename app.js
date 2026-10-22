import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { overlapsSnapZone, rightStickIntent, layoutCallouts, heldStickMotion, fallStep } from './interactionMath.js?v=8';
import { tourChapters, tourDuration, chapterStart, sampleTour } from './guidedTour.js?v=8';

const $ = id => document.getElementById(id);
const state = { explosion: 0, scale: 3, cut: .5, identify: false, ghost: false, section: false, drawings: false, practice: false, selected: null, page: 0 };
const tour = { active: false, paused: false, time: 0, index: -1, motion: 'orbit', frame: null, saved: null };
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(.85);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eaeb);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .025, 35);
camera.position.set(1.0, 1.95, 2.75);
const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(-.1, 1.45, -.9); orbit.enableDamping = true; orbit.minDistance = .45; orbit.maxDistance = 7;
orbit.maxPolarAngle = Math.PI * .48;
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = new RoomEnvironment();
const environmentTarget = pmrem.fromScene(environment, .04);
scene.environment = environmentTarget.texture;
environment.dispose(); pmrem.dispose();
scene.environmentIntensity = .9;
scene.add(new THREE.HemisphereLight(0xeaf1ff, 0x73716d, .38));
const assembly = new THREE.Group(); scene.add(assembly);
const parts = [], callouts = [], controllers = [], menuRegions = [];
const sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let data, bounds, ready = false, pointerDrag = null, vrSession = null, offlineRegistration, menuPlacementPending = false;
let uiDirty = false, practiceHint = 'Match the ghost and release to snap.';
const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: .6 });
function block(size, position, material = white) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.position.set(...position); object.receiveShadow = true; scene.add(object); return object;
}
block([9, .12, 9], [0, -.06, 0], new THREE.MeshStandardMaterial({ color: 0xd4d6d7, roughness: .8 }));
block([9, 3.4, .12], [0, 1.7, -3.8]);
block([.12, 3.4, 8], [-4.4, 1.7, 0]); block([.12, 3.4, 8], [4.4, 1.7, 0]);
block([9, .12, 8], [0, 3.46, 0]);
const plinth = block([1.05, 1, .95], [.2, .5, -.9]); plinth.castShadow = true;
const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
block([1.056, .012, .956], [.2, .94, -.9], glow);
block([.85, .06, .56], [.2, 3.18, -.9], new THREE.MeshStandardMaterial({ color: 0x353739, roughness: .7 }));
block([.78, .012, .49], [.2, 3.142, -.9], glow);
function spot(position, target, intensity, angle, shadow = false) {
  const light = new THREE.SpotLight(0xffffff, intensity, 9, angle, .65, 1.5);
  light.position.set(...position); light.target.position.set(...target);
  light.castShadow = shadow; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -.0004;
  scene.add(light, light.target); return light;
}
spot([.15, 3.1, -.3], [.2, 1.3, -.9], 24, .62, true);
spot([-2.2, 2.7, .8], [.2, 1.3, -.9], 16, .7);
spot([2.3, 2.4, -2.8], [.2, 1.4, -.9], 20, .7);
spot([-1.2, .25, -3.5], [-1.2, 2.2, -3.76], 5, .65);
spot([1.2, .25, -3.5], [1.2, 2.2, -3.76], 5, .65);

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}
const panel = canvasTexture(1024, 1536, () => {});
const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(.72, 1.08), new THREE.MeshBasicMaterial({ map: panel.texture, side: THREE.DoubleSide, toneMapped: false }));
panelMesh.position.set(-1.08, 1.55, -.35); panelMesh.rotation.y = .42; panelMesh.visible = false; scene.add(panelMesh);
const drawingGroup = new THREE.Group(); drawingGroup.position.set(1.35, 1.6, -.9); drawingGroup.rotation.y = -.35; scene.add(drawingGroup);
const drawingBacking = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .91), new THREE.MeshBasicMaterial({ color: 0xfafafa, side: THREE.DoubleSide }));
drawingBacking.userData.drawingBoard = true;
drawingGroup.add(drawingBacking);
const drawingMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }));
drawingMesh.position.z = .004; drawingGroup.add(drawingMesh); drawingGroup.visible = false;
drawingMesh.userData.drawingBoard = true;
const boardHeader = canvasTexture(1024, 112, ctx => {
  ctx.fillStyle = '#e7e9e8'; ctx.fillRect(0, 0, 1024, 112);
  ctx.fillStyle = '#20292d'; ctx.font = 'bold 28px monospace'; ctx.fillText('DRAWING / GRIP TO MOVE', 28, 44);
  ctx.font = '24px sans-serif'; ctx.fillText('B / Y: recall board when not holding a part', 28, 86);
});
const drawingHandle = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .1225), new THREE.MeshBasicMaterial({ map: boardHeader.texture, side: THREE.DoubleSide, toneMapped: false }));
drawingHandle.position.set(0, .516, .005); drawingHandle.userData.drawingBoard = true; drawingGroup.add(drawingHandle);
const snapGuide = new THREE.Mesh(new THREE.BoxGeometry(.001, .001, .001), new THREE.MeshBasicMaterial({ color: 0x6a9f8b, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }));
snapGuide.visible = false; snapGuide.renderOrder = 2; assembly.add(snapGuide);
const textureLoader = new THREE.TextureLoader(), drawingTextures = new Map();
let drawingRequest = 0;
function report(message) { $('status').textContent = message; }
function error(message) { $('error').textContent = message; report(message); }
function selectedPages() { return data?.drawings[state.selected?.userData.record.drawingKey] || []; }
function updateDrawings() {
  const token = ++drawingRequest;
  const pages = selectedPages(); state.page = Math.min(state.page, Math.max(0, pages.length - 1));
  const page = pages[state.page];
  $('drawing').style.display = state.drawings && !renderer.xr.isPresenting ? 'block' : 'none';
  drawingGroup.visible = state.drawings && !!page && renderer.xr.isPresenting;
  if (!drawingGroup.visible) controllers.forEach(releaseBoard);
  $('page-prev').disabled = !page || pages.length < 2; $('page-next').disabled = !page || pages.length < 2;
  $('drawing-title').textContent = page ? `${state.selected.userData.record.label} / SHEET ${state.page + 1} OF ${pages.length}` : 'No supplied drawing for this component.';
  if (!page) { $('sheet').removeAttribute('src'); $('sheet').hidden = true; return; }
  $('sheet').hidden = false; $('sheet').src = page.url;
  const apply = texture => {
    if (token !== drawingRequest) return;
    drawingMesh.material.map = texture; drawingMesh.material.needsUpdate = true;
    const ratio = page.width / page.height;
    drawingMesh.scale.set(ratio > 1 ? 1.06 : .79 * ratio, ratio > 1 ? 1.06 / ratio : .79, 1);
  };
  if (drawingTextures.has(page.url)) apply(drawingTextures.get(page.url));
  else textureLoader.load(page.url, texture => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    drawingTextures.set(page.url, texture); apply(texture);
  }, undefined, () => error('Drawing failed to load. Check the connection or save the studio for offline use.'));
}
function selectPart(part) {
  if (!part) return;
  state.selected = part; state.page = 0; $('parts').value = part.userData.record.file;
  report(`${part.userData.record.label} / ${part.userData.record.name}`); updateDrawings(); syncUI();
}
function cyclePart(direction) {
  const groups = [...new Set(parts.map(p => p.userData.record.group))];
  const index = groups.indexOf(state.selected?.userData.record.group);
  selectPart(parts.find(p => p.userData.record.group === groups[(index + direction + groups.length) % groups.length]));
}
function pageStep(direction) { const count = selectedPages().length; if (count) { state.page = (state.page + direction + count) % count; updateDrawings(); paintMenu(); } }
function canFitPart(part) {
  part.updateWorldMatrix(true, false); assembly.updateWorldMatrix(true, false);
  const actual = part.geometry.boundingBox.clone().applyMatrix4(part.matrixWorld);
  const homeMatrix = assembly.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(...part.userData.home.toArray()));
  const target = part.geometry.boundingBox.clone().applyMatrix4(homeMatrix);
                                                                                
  return overlapsSnapZone(actual.min.toArray(), actual.max.toArray(), target.min.toArray(), target.max.toArray());
}
function releasePart(part, restore = false) {
  if (!part) return;
  for (const controller of controllers) if (controller.userData.held === part) controller.userData.held = null;
  if (part.parent !== assembly) assembly.attach(part);
  part.userData.held = false; part.userData.manual = !restore;
  part.userData.falling = false;
  if (restore) part.quaternion.identity();
  if (state.practice) {
    part.userData.snapped = restore || canFitPart(part);
    part.userData.manual = part.userData.snapped;
    part.userData.practicePark = false;
    part.userData.falling = !part.userData.snapped; part.userData.fallVelocity = 0;
    if (!part.userData.snapped) { scene.attach(part); part.userData.manual = true; }
    if (part.userData.snapped) { part.position.copy(part.userData.home); part.quaternion.identity(); part.scale.setScalar(1); }
    report(part.userData.snapped ? fittedCount() === parts.length ? `Assembly complete: all ${parts.length} parts fitted.` : `${part.userData.record.label}: fitted. ${fittedCount()} / ${parts.length}` : `${part.userData.record.label}: outside target; released under gravity.`);
    syncUI();
  }
}
function fittedCount() { return parts.filter(part => part.userData.snapped).length; }
function restartPractice() {
  if (parts.some(p => p.userData.held)) { report('Release the held part before restarting practice.'); return; }
  state.practice = true; state.explosion = 0; state.ghost = false; state.section = false;
  parts.forEach((p, index) => {
    scene.attach(p); p.quaternion.identity(); p.scale.setScalar(state.scale);
    p.position.set(-1.4 + (index % 5) * .7, .85 + Math.floor(index / 5) * .08, .25 + Math.floor(index / 5) * .65);
    Object.assign(p.userData, { manual: true, held: false, snapped: false, practicePark: false, falling: true, fallVelocity: 0 });
  });
  syncUI(); report('Gravity practice: pick up a loose part, match its ghost, then release to fit.');
}
function togglePractice() {
  if (!state.practice) restartPractice();
  else { state.practice = false; snapGuide.visible = false; parts.forEach(p => { if (p.parent !== assembly) assembly.attach(p); p.userData.manual = true; p.userData.practicePark = false; p.userData.falling = false; }); syncUI(); report('Free inspection mode.'); }
}
function releaseBoard(controller) {
  if (!controller.userData.heldBoard) return;
  scene.attach(drawingGroup); controller.userData.heldBoard = false;
}
function bringDrawingHere() {
  controllers.forEach(releaseBoard);
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const eye = viewer.getWorldPosition(new THREE.Vector3());
  const forward = viewer.getWorldDirection(new THREE.Vector3()); forward.y = 0;
  if (forward.lengthSq() < .001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  drawingGroup.position.copy(eye).addScaledVector(forward, 1.4).addScaledVector(right, .72);
  drawingGroup.position.y = Math.max(.8, eye.y - .12);
  drawingGroup.lookAt(eye.x, drawingGroup.position.y, eye.z);
}
function releaseMenu(controller) {
  if (!controller.userData.heldMenu) return;
  scene.attach(panelMesh);
  controller.userData.heldMenu = false;
}
function bringMenuHere(sideOffset = 0) {
  controllers.forEach(releaseMenu);
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const eye = viewer.getWorldPosition(new THREE.Vector3());
  const forward = viewer.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  if (forward.lengthSq() < .001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  panelMesh.position.copy(eye).addScaledVector(forward, 1.2).addScaledVector(right, sideOffset);
  panelMesh.position.y = Math.max(.8, eye.y - .12);
  panelMesh.lookAt(eye.x, panelMesh.position.y, eye.z);
}
function reset() {
  if (tour.active) stopTour();
  state.practice = false; snapGuide.visible = false;
  parts.forEach(part => releasePart(part, true));
  parts.forEach(part => { part.userData.snapped = false; part.userData.practicePark = false; });
  Object.assign(state, { explosion: 0, scale: 3, cut: .5, identify: false, ghost: false, section: false, drawings: false, page: 0 });
  assembly.rotation.set(0, 0, 0); updateDrawings(); syncUI();
}
function toggle(key) {
  state[key] = !state[key];
  if ((key === 'identify' || key === 'drawings') && !state.selected) selectPart(parts.find(p => p.userData.record.group === 'roller') || parts[0]);
  if (key === 'drawings') updateDrawings(); syncUI();
}
function setExplosion(value, repaint = true) {
  if (state.practice) { report("Practice: fitted parts stay locked. Pick up loose parts, or exit practice to explode the assembly."); return; }
  state.explosion = THREE.MathUtils.clamp(Number(value), 0, 1);
  parts.forEach(p => { if (!p.userData.held) { p.userData.manual = false; p.userData.snapped = false; p.userData.practicePark = false; } });
  if (repaint) syncUI(); else uiDirty = true;
}
function syncUI() {
  for (const [key, id] of [['explosion', 'explode'], ['scale', 'scale'], ['cut', 'cut']]) $(id).value = state[key];
  $('explode').disabled = state.practice; $('scale').disabled = state.practice;
  $('explode-value').textContent = `${Math.round(state.explosion * 100)}%`;
  $('scale-value').textContent = `${state.scale.toFixed(1)}x`;
  for (const key of ['identify', 'ghost', 'section', 'drawings']) $(key).setAttribute('aria-pressed', state[key]);
  $('practice').setAttribute('aria-pressed', state.practice);
  $('practice-restart').disabled = !state.practice;
  $('practice-status').textContent = state.practice ? fittedCount() === parts.length ? `Placement practice complete: ${parts.length} / ${parts.length} fitted.` : `Placement practice: ${fittedCount()} / ${parts.length} fitted. Touch the ghost zone and release.` : 'Touch the ghost zone and release to fit; orientation aligns automatically.';
  paintMenu();
}
const tourPanel = canvasTexture(1280, 640, () => {});
const tourPanelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .525), new THREE.MeshBasicMaterial({ map: tourPanel.texture, side: THREE.DoubleSide, depthTest: false, toneMapped: false }));
tourPanelMesh.visible = false; tourPanelMesh.renderOrder = 20; scene.add(tourPanelMesh);
const tourRegions = [];
const spinArrow = new THREE.Group(); assembly.add(spinArrow); spinArrow.visible = false;
const arrowPoints = Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI * 1.6; return new THREE.Vector3(.065, Math.cos(a) * .14, Math.sin(a) * .14); });
spinArrow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arrowPoints), new THREE.LineBasicMaterial({ color: 0x2d8997, depthTest: false })));
const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(.009, .026, 12), new THREE.MeshBasicMaterial({ color: 0x2d8997, depthTest: false }));
const arrowEnd = Math.PI * 1.6;
arrowTip.position.set(.065, Math.cos(arrowEnd) * .14, Math.sin(arrowEnd) * .14);
arrowTip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -Math.sin(arrowEnd), Math.cos(arrowEnd)));
spinArrow.add(arrowTip); spinArrow.traverse(o => { o.renderOrder = 8; });
for (const [index, chapter] of tourChapters.entries()) {
  const option = document.createElement('option'); option.value = index; option.textContent = `${String(index + 1).padStart(2, '0')} / ${chapter.title}`; $('tour-chapter').append(option);
}
function wrapText(ctx, text, x, y, width, lineHeight) {
  let line = '';
  for (const word of text.split(' ')) {
    if (line && ctx.measureText(`${line} ${word}`).width > width) { ctx.fillText(line, x, y); y += lineHeight; line = word; }
    else line += `${line ? ' ' : ''}${word}`;
  }
  ctx.fillText(line, x, y);
}
function syncTourUI() {
  const frame = tour.frame || sampleTour(tour.time), chapter = frame.chapter;
  $('tour-card').hidden = !tour.active; document.body.classList.toggle('touring', tour.active);
  $('tour-start').textContent = tour.active ? 'Guided tour running' : 'Start guided tour / 1 min 44 sec'; $('tour-start').disabled = !ready || tour.active;
  $('tour-motion').disabled = tour.active; $('inspection-settings').disabled = tour.active;
  $('tour-kicker').textContent = `${tour.paused ? frame.complete ? 'COMPLETE' : 'PAUSED' : 'GUIDED TOUR'} / ${frame.index + 1} OF ${tourChapters.length}`;
  $('tour-title').textContent = chapter.title; $('tour-text').textContent = chapter.text; $('tour-detail').textContent = chapter.detail;
  $('tour-chapter').value = frame.index; $('tour-progress').value = tour.time;
  $('tour-pause').textContent = frame.complete ? 'Replay' : tour.paused ? 'Resume' : 'Pause';
  $('tour-prev').disabled = frame.index === 0; $('tour-next').disabled = frame.index === tourChapters.length - 1;
  const ctx = tourPanel.canvas.getContext('2d'); ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, 1280, 640); tourRegions.length = 0;
  ctx.fillStyle = '#626a70'; ctx.font = '24px monospace'; ctx.fillText($('tour-kicker').textContent, 40, 48);
  ctx.fillStyle = '#20272c'; ctx.font = 'bold 40px sans-serif'; ctx.fillText(chapter.title, 40, 110);
  ctx.font = '32px sans-serif'; wrapText(ctx, chapter.text, 40, 170, 1200, 44);
  ctx.fillStyle = '#58646b'; ctx.font = '24px sans-serif'; wrapText(ctx, chapter.detail, 40, 340, 1200, 32);
  ctx.fillStyle = '#d2d8da'; ctx.fillRect(40, 412, 1200, 6); ctx.fillStyle = '#303e45'; ctx.fillRect(40, 412, 1200 * tour.time / tourDuration, 6);
  const labels = ['Previous', $('tour-pause').textContent, 'Next', 'Finish tour'];
  const actions = [() => seekTour(tour.index - 1), pauseTour, () => seekTour(tour.index + 1), stopTour];
  labels.forEach((label, i) => {
    const disabled = (i === 0 && frame.index === 0) || (i === 2 && frame.index === tourChapters.length - 1);
    const x = 40 + i * 305; ctx.fillStyle = disabled ? '#e4e7e7' : '#26343c'; ctx.fillRect(x, 450, 285, 80);
    ctx.fillStyle = disabled ? '#929a9e' : '#fff'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x + 142, 500); ctx.textAlign = 'left';
    if (!disabled) tourRegions.push({ x, y: 450, w: 285, h: 80, action: actions[i] });
  });
  ctx.fillStyle = '#626a70'; ctx.font = '24px sans-serif'; ctx.fillText(tour.motion === 'orbit' ? 'Camera orbit / look freely with your head' : 'Stationary view / the exhibit rotates', 40, 592);
  tourPanel.texture.needsUpdate = true; paintMenu();
}
function startTour() {
  if (!ready || tour.active) return;
  if (parts.some(p => p.userData.held) || controllers.some(c => c.userData.heldMenu || c.userData.heldBoard) || pointerDrag) { report('Release the held object before starting the tour.'); return; }
  tour.saved = { state: { ...state }, camera: camera.position.clone(), cameraQ: camera.quaternion.clone(), target: orbit.target.clone(),
    rig: rig.position.clone(), rigQ: rig.quaternion.clone(), assemblyQ: assembly.quaternion.clone(),
    parts: parts.map(p => ({ parent: p.parent, position: p.position.clone(), quaternion: p.quaternion.clone(), scale: p.scale.clone(), info: { ...p.userData } })) };
  Object.assign(tour, { active: true, paused: false, time: 0, index: -1, motion: $('tour-motion').value, spinAngle: 0 });
  Object.assign(state, { practice: false, explosion: 0, scale: !renderer.xr.isPresenting && camera.aspect < 1 ? 1.5 : 2.5, identify: false, ghost: false, section: false, drawings: false });
  for (const part of parts) { assembly.add(part); part.position.copy(part.userData.home); part.quaternion.identity(); part.scale.setScalar(1); Object.assign(part.userData, { held: false, manual: false, falling: false, snapped: false }); }
  assembly.quaternion.identity(); orbit.enabled = false;
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  tour.localEye = rig.worldToLocal(viewer.getWorldPosition(new THREE.Vector3()));
  const forward = viewer.getWorldDirection(new THREE.Vector3()).applyQuaternion(rig.quaternion.clone().invert());
  tour.headYaw = Math.atan2(-forward.x, -forward.z);
  updateDrawings(); applyTourFrame(); syncUI(); syncTourUI(); report('Guided tour started.');
}
function stopTour() {
  if (!tour.active) return;
  const saved = tour.saved; tour.active = false; spinArrow.visible = false; tourPanelMesh.visible = false;
  parts.forEach((part, index) => {
    const snapshot = saved.parts[index]; snapshot.parent.add(part); part.position.copy(snapshot.position); part.quaternion.copy(snapshot.quaternion); part.scale.copy(snapshot.scale); part.userData = { ...snapshot.info };
  });
  Object.assign(state, saved.state); assembly.quaternion.copy(saved.assemblyQ); rig.position.copy(saved.rig); rig.quaternion.copy(saved.rigQ);
  camera.position.copy(saved.camera); camera.quaternion.copy(saved.cameraQ); orbit.target.copy(saved.target); orbit.enabled = !renderer.xr.isPresenting;
  tour.saved = null; updateDrawings(); syncUI(); syncTourUI(); report('Tour finished. Your inspection view is restored.');
}
function pauseTour() {
  if (!tour.active) return;
  if (tour.time >= tourDuration) { tour.time = 0; tour.index = -1; tour.spinAngle = 0; tour.paused = false; applyTourFrame(); }
  else tour.paused = !tour.paused;
  syncTourUI();
}
function seekTour(index) {
  if (!tour.active) return;
  index = Math.max(0, Math.min(tourChapters.length - 1, index));
  tour.time = chapterStart(index); tour.index = -1; tour.spinAngle = 0; applyTourFrame(); syncTourUI();
}
function applyTourFrame() {
  const frame = sampleTour(tour.time); tour.frame = frame;
  state.explosion = frame.explosion; state.cut = frame.cut;
  if (frame.index !== tour.index) {
    tour.index = frame.index;
    Object.assign(state, { identify: !!frame.chapter.identify, ghost: !!frame.chapter.ghost, section: !!frame.chapter.section });
    state.selected = parts.find(p => p.userData.record.group === frame.chapter.groups[0]) || parts.find(p => p.userData.record.group === 'roller');
    syncTourUI();
  }
}
function updateTour(dt) {
  if (!tour.active) return;
  if (!tour.paused && tour.time >= tourDuration) { tour.paused = true; syncTourUI(); }
  const { frame } = tour;
  spinArrow.visible = !!frame.chapter.spin && frame.progress > .45; spinArrow.rotation.x = frame.spinAngle;
                                                                                
  const box = new THREE.Box3(); parts.forEach(p => box.expandByObject(p));
  const center = box.getCenter(new THREE.Vector3());
  const radius = 2.55;
  if (tour.motion === 'stationary') {
    assembly.rotation.y = frame.angle - .28;
  } else if (renderer.xr.isPresenting) {
                                                                                  
    rig.rotation.set(0, frame.angle - tour.headYaw, 0);
    const localEye = tour.localEye.clone().applyQuaternion(rig.quaternion);
    rig.position.set(center.x + Math.sin(frame.angle) * radius - localEye.x, tour.saved.rig.y, center.z + Math.cos(frame.angle) * radius - localEye.z);
  } else {
                                                                    
    const distance = Math.max(radius, box.getSize(new THREE.Vector3()).length() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect)) + .35);
    const position = new THREE.Vector3(center.x + Math.sin(frame.angle) * distance, center.y + .48, center.z + Math.cos(frame.angle) * distance);
    camera.position.lerp(position, 1 - Math.exp(-4 * dt)); orbit.target.lerp(center, 1 - Math.exp(-4 * dt)); camera.lookAt(orbit.target);
  }
  tourPanelMesh.visible = renderer.xr.isPresenting;
  if (tourPanelMesh.visible) {
    const viewer = renderer.xr.getCamera(), eye = viewer.getWorldPosition(new THREE.Vector3());
                                                                                   
    const forward = tour.motion === 'orbit' ? new THREE.Vector3(-Math.sin(frame.angle), 0, -Math.cos(frame.angle)) : new THREE.Vector3(0, 0, -1).applyQuaternion(tour.saved.rigQ).applyAxisAngle(new THREE.Vector3(0, 1, 0), tour.headYaw);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    tourPanelMesh.position.copy(eye).addScaledVector(forward, 1.2).addScaledVector(right, -.63); tourPanelMesh.position.y = eye.y - .52; tourPanelMesh.lookAt(eye);
  }
}
function paintMenu() {
  const ctx = panel.canvas.getContext('2d'); ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, 1024, 1536); menuRegions.length = 0;
  ctx.fillStyle = '#24292c'; ctx.font = 'bold 36px monospace'; ctx.fillText('//STRAMMERULLE', 48, 70);
  ctx.font = '22px monospace'; ctx.fillStyle = '#626a70'; ctx.fillText('GRIP CONSOLE TO MOVE / A OR X TO RECALL', 48, 112);
  function button(x, y, w, h, text, action, active = false, disabled = false) {
    ctx.fillStyle = disabled ? '#e7e7e5' : active ? '#292e31' : '#fff'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#b8bec1'; ctx.strokeRect(x, y, w, h); ctx.fillStyle = disabled ? '#aaa' : active ? '#fff' : '#24292c';
    ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, x + w / 2, y + h / 2 + 9); ctx.textAlign = 'left';
    if (!disabled) menuRegions.push({ x, y, w, h, action });
  }
  if (tour.active) {
    ctx.font = 'bold 34px sans-serif'; wrapText(ctx, tour.frame?.chapter.title || 'Guided tour', 48, 212, 928, 48);
    ctx.font = '30px sans-serif'; wrapText(ctx, tour.frame?.chapter.text || '', 48, 360, 928, 48);
    button(48, 750, 450, 80, 'Previous chapter', () => seekTour(tour.index - 1), false, tour.index === 0);
    button(526, 750, 450, 80, 'Next chapter', () => seekTour(tour.index + 1), false, tour.index === tourChapters.length - 1);
    button(48, 870, 928, 90, tour.time >= tourDuration ? 'Replay tour' : tour.paused ? 'Resume tour' : 'Pause tour', pauseTour);
    button(48, 1010, 928, 90, 'Finish tour / free inspection', stopTour);
    ctx.font = '28px sans-serif'; wrapText(ctx, 'The tour card also has chapter controls. Look freely; point and trigger to choose.', 48, 1220, 928, 44);
    panel.texture.needsUpdate = true; return;
  }
  button(48, 152, 928, 80, state.explosion > .5 ? 'Reassemble' : 'Explode horizontally', () => setExplosion(state.explosion > .5 ? 0 : 1), state.explosion > .5, state.practice);
  button(48, 252, 450, 74, 'Explode -', () => setExplosion(Math.max(0, state.explosion - .2)), false, state.practice);
  button(526, 252, 450, 74, 'Explode +', () => setExplosion(Math.min(1, state.explosion + .2)), false, state.practice);
  button(48, 346, 450, 74, `Scale -  / ${state.scale.toFixed(1)}x`, () => { if (!state.practice && !parts.some(p => p.userData.held)) state.scale = Math.max(1, state.scale - .5); syncUI(); });
  button(526, 346, 450, 74, 'Scale +', () => { if (!state.practice && !parts.some(p => p.userData.held)) state.scale = Math.min(4, state.scale + .5); syncUI(); });
  button(48, 440, 928, 74, 'Part colours + technical callouts', () => toggle('identify'), state.identify);
  button(48, 534, 928, 74, 'Transparent outer shells', () => toggle('ghost'), state.ghost);
  button(48, 628, 928, 74, 'Cross-section', () => toggle('section'), state.section);
  button(48, 722, 450, 66, 'Section -', () => { state.cut = Math.max(0, state.cut - .1); syncUI(); });
  button(526, 722, 450, 66, 'Section +', () => { state.cut = Math.min(1, state.cut + .1); syncUI(); });
  ctx.fillStyle = '#24292c'; ctx.font = 'bold 26px sans-serif'; ctx.fillText((state.selected?.userData.record.label || 'Select a component').slice(0, 32) + (state.practice ? ` / ${fittedCount()} of ${parts.length} fitted` : ''), 48, 840);
  button(48, 864, 450, 68, 'Previous part', () => cyclePart(-1)); button(526, 864, 450, 68, 'Next part', () => cyclePart(1));
  button(48, 952, 928, 74, 'See the drawings', () => toggle('drawings'), state.drawings);
  const pages = selectedPages();
  button(48, 1046, 450, 66, 'Previous sheet', () => pageStep(-1), false, !state.drawings || pages.length < 2);
  button(526, 1046, 450, 66, 'Next sheet', () => pageStep(1), false, !state.drawings || pages.length < 2);
  button(48, 1132, 450, 66, 'Return part', () => { releasePart(state.selected, true); }); button(526, 1132, 450, 66, 'Reset studio', reset);
  button(48, 1218, 450, 66, 'Assembly practice', togglePractice, state.practice); button(526, 1218, 450, 66, 'Restart practice', restartPractice, false, !state.practice);
  button(48, 1304, 450, 56, 'Guided camera tour', startTour); button(526, 1304, 450, 56, $('tour-motion').value === 'orbit' ? 'Orbit / change view' : 'Stationary / change', () => { $('tour-motion').value = $('tour-motion').value === 'orbit' ? 'stationary' : 'orbit'; paintMenu(); });
  ctx.font = '22px sans-serif'; ctx.fillStyle = '#525b60';
  ctx.fillText('HOLD PART / PANEL: right stick reaches / rotates', 48, 1404);
  ctx.fillText('A / X: console     B / Y: board or return held part', 48, 1444);
  ctx.fillText(state.practice ? practiceHint : 'EMPTY HAND: stick assembles / explodes / rotates', 48, 1484);
  panel.texture.needsUpdate = true;
}

function makeCallouts() {
  const groups = [...new Set(parts.map(p => p.userData.record.group))];
  groups.forEach((group, index) => {
    const members = parts.filter(p => p.userData.record.group === group);
    const texture = canvasTexture(768, 112, ctx => {
      ctx.fillStyle = 'rgba(250,250,248,.98)'; ctx.fillRect(0, 0, 768, 112);
      ctx.fillStyle = `#${members[0].userData.colour.getHexString()}`; ctx.fillRect(0, 0, 12, 112);
      ctx.strokeStyle = '#6f7a80'; ctx.strokeRect(1, 1, 766, 110);
      ctx.fillStyle = '#30383c'; ctx.font = 'bold 32px sans-serif'; ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${members[0].userData.record.label.replace(/ \/ \d+$/, '')}`, 24, 48);
      ctx.font = '24px monospace'; ctx.fillText(`${members.length} INSTANCE${members.length > 1 ? 'S' : ''} / POINT TO SELECT`, 24, 91);
    }).texture;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, toneMapped: false }));
    sprite.scale.set(.67, .098, 1); sprite.userData.calloutPart = members[0]; scene.add(sprite);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length: 3}, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0x34474f, depthTest: false })); line.renderOrder = 4; scene.add(line);
    callouts.push({ members, sprite, line, index });
  });
}
function updateCallouts() {
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const forward = viewer.getWorldDirection(new THREE.Vector3()); forward.y = 0;
  if (forward.lengthSq() < .001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  const center = assembly.localToWorld(bounds.getCenter(new THREE.Vector3()));
  const anchors = callouts.map(item => {
    const representative = item.members.includes(state.selected) ? state.selected : item.members[0];
    const point = representative.getWorldPosition(new THREE.Vector3());
    return { index: item.index, x: point.clone().sub(center).dot(right), y: point.y - center.y, point, representative };
  });
  const halfWidth = Math.min(2.4, Math.max(.45, ...anchors.map(a => Math.abs(a.x))));
  const placements = layoutCallouts(anchors, halfWidth, bounds.getSize(new THREE.Vector3()).y * state.scale / 2);
  for (const place of placements) {
    const item = callouts[place.index], anchor = anchors[place.index];
    const focused = item.members.includes(state.selected);
    item.sprite.visible = state.identify && !tour.active;
                                                                                
    item.line.visible = state.identify && focused && !tour.active;
    if (!item.sprite.visible) continue;
    item.sprite.position.copy(center).addScaledVector(right, place.x).addScaledVector(forward, place.z);
    item.sprite.position.y += place.y;
    item.sprite.scale.set(focused ? .73 : .67, focused ? .106 : .098, 1);
    item.sprite.userData.calloutPart = anchor.representative;
    const end = item.sprite.position.clone().addScaledVector(right, -place.side * .34);
    const elbow = anchor.point.clone().addScaledVector(right, place.side * .12).addScaledVector(forward, -.06);
    const positions = item.line.geometry.attributes.position;
    [anchor.point, elbow, end].forEach((point, i) => positions.setXYZ(i, point.x, point.y, point.z));
    positions.needsUpdate = true; item.line.geometry.computeBoundingSphere();
  }
}
function updatePracticeGuide() {
  const part = state.selected;
  snapGuide.visible = state.practice && !!part && !part.userData.snapped;
  if (!snapGuide.visible) return;
  snapGuide.geometry = part.geometry; snapGuide.position.copy(part.userData.home); snapGuide.quaternion.identity();
  const canSnap = canFitPart(part);
  snapGuide.material.color.setHex(canSnap ? 0x4ba887 : 0x7c8d96);
  snapGuide.material.opacity = canSnap ? .28 : .13;
  const hint = !part.userData.held ? 'Pick up a part. Touch its ghost, then release.' : canSnap ? 'RELEASE TO FIT: overlapping the target zone.' : 'Move any part of the held object into its ghost.';
  if (hint !== practiceHint) { practiceHint = hint; uiDirty = true; }
}
async function load() {
  const response = await fetch('./assets/assembly.json', { cache: 'no-cache' }); if (!response.ok) throw new Error('Assembly manifest could not be loaded.'); data = await response.json();
  bounds = new THREE.Box3(new THREE.Vector3(...data.bounds.min), new THREE.Vector3(...data.bounds.max));
  const groupColours = new Map();
  for (const record of data.parts) {
    if (!groupColours.has(record.group)) groupColours.set(record.group, new THREE.Color().setHSL((groupColours.size * .61803399) % 1, .58, .48));
    const response = await fetch(record.geometry); if (!response.ok) throw new Error(`Mesh failed: ${record.label}`); const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== record.vertices * 24 + record.indices * 4) throw new Error(`Mesh size mismatch: ${record.label}`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 0, record.vertices * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffer, record.vertices * 12, record.vertices * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, record.vertices * 24, record.indices), 1)); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const material = new THREE.MeshStandardMaterial({ color: 0x30373d, metalness: .86, roughness: .29, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...record.center); mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { record, home: mesh.position.clone(), offset: new THREE.Vector3(record.offset[0], 0, 0), colour: groupColours.get(record.group), manual: false, held: false, snapped: false, practicePark: false };
    assembly.add(mesh); parts.push(mesh);
    const option = document.createElement('option'); option.value = record.file; option.textContent = record.label; $('parts').append(option);
    $('loading').textContent = `Loading CAD / ${parts.length} of ${data.parts.length}`;
  }
  const wordResponse = await fetch('./assets/wordmark.bin'); if (!wordResponse.ok) throw new Error('Wall lettering failed to load.');
  const wordGeometry = new THREE.BufferGeometry(); wordGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(await wordResponse.arrayBuffer()), 3)); wordGeometry.computeVertexNormals();
  const wordmark = new THREE.Mesh(wordGeometry, new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: .7, side: THREE.DoubleSide }));
  wordmark.position.set(0, 2.35, -3.725); wordmark.castShadow = true; scene.add(wordmark);
  makeCallouts(); ready = true; $('tour-start').disabled = false; $('loading').remove(); selectPart(parts.find(p => p.userData.record.group === 'roller') || parts[0]);
  report(`${parts.length} parts / ${groupColours.size} component types / ${data.triangles.toLocaleString()} triangles. Ready.`);
  await setupVR(); setupOffline();
}

function visibleHits(ray, includeMenu = true) {
  assembly.updateWorldMatrix(true, true);
  const objects = tour.active ? [] : [...parts];
  if (includeMenu && tourPanelMesh.visible) { tourPanelMesh.updateWorldMatrix(true, false); objects.push(tourPanelMesh); }
  if (includeMenu && panelMesh.visible) { panelMesh.updateWorldMatrix(true, false); objects.push(panelMesh); }
  if (includeMenu && drawingGroup.visible) { drawingGroup.updateWorldMatrix(true, true); objects.push(drawingBacking, drawingMesh, drawingHandle); }
  if (includeMenu && state.identify && !tour.active) objects.push(...callouts.filter(item => item.sprite.visible).map(item => item.sprite));
  return ray.intersectObjects(objects, false).filter(hit => !parts.includes(hit.object) || !state.section || sectionPlane.distanceToPoint(hit.point) >= 0);
}
function controllerRay(controller) {
  controller.updateWorldMatrix(true, false);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
  raycaster.camera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  return raycaster;
}
function menuClick(hit) {
  const x = hit.uv.x * 1024, y = (1 - hit.uv.y) * 1536;
  menuRegions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.action();
}
function activateHit(hit) {
  if (!hit) return;
  if (hit.object === tourPanelMesh) tourClick(hit);
  else if (hit.object === panelMesh) menuClick(hit);
  else if (hit.object.userData.calloutPart) selectPart(hit.object.userData.calloutPart);
  else if (!hit.object.userData.drawingBoard) selectPart(hit.object);
}
function tourClick(hit) {
  const x = hit.uv.x * 1280, y = (1 - hit.uv.y) * 640;
  tourRegions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.action();
}
function beginGrip(controller, partOnly = false) {
  if (!ready || controller.userData.held || controller.userData.heldMenu || controller.userData.heldBoard) return;
  const hit = visibleHits(controllerRay(controller))[0];
  if (!hit) return;
  if (hit.object === tourPanelMesh) { if (partOnly) tourClick(hit); return; }
  if (hit.object === panelMesh) {
    if (partOnly) { menuClick(hit); return; }
    if (controllers.some(c => c.userData.heldMenu)) return;
    controller.attach(panelMesh);
    controller.userData.heldMenu = true;
    return;
  }
  if (hit.object.userData.drawingBoard) {
    if (partOnly) return;
    if (controllers.some(c => c.userData.heldBoard)) return;
    controller.attach(drawingGroup); controller.userData.heldBoard = true; return;
  }
  if (hit.object.userData.calloutPart) { selectPart(hit.object.userData.calloutPart); return; }
  if (hit.object.userData.held) return;
  selectPart(hit.object); hit.object.userData.falling = false; hit.object.userData.manual = true; hit.object.userData.snapped = false; hit.object.userData.practicePark = false;
  controller.attach(hit.object); hit.object.userData.held = true; controller.userData.held = hit.object; uiDirty = true;
}
async function setupVR() {
  if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr')) { $('enter').textContent = 'Open in Quest Browser for VR'; return; }
  $('enter').disabled = false; $('enter').textContent = 'Enter VR';
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i); rig.add(controller); controllers.push(controller);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xeeeeff }));
    line.scale.z = 3; controller.add(line); controller.userData.rayLine = line;
    const grip = renderer.xr.getControllerGrip(i); rig.add(grip);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.018, .023, .10, 10), new THREE.MeshStandardMaterial({ color: 0x34383d, roughness: .5 })); handle.rotation.x = Math.PI / 3; grip.add(handle);
    controller.addEventListener('connected', event => { controller.userData.source = event.data; });
    controller.addEventListener('disconnected', () => { releaseMenu(controller); releaseBoard(controller); releasePart(controller.userData.held); controller.userData.source = null; });
    controller.addEventListener('selectstart', () => { controller.userData.triggerDown = true; beginGrip(controller, true); });
    controller.addEventListener('selectend', () => { controller.userData.triggerDown = false; if (!controller.userData.gripDown) releasePart(controller.userData.held); });
    controller.addEventListener('squeezestart', () => { controller.userData.gripDown = true; beginGrip(controller); });
    controller.addEventListener('squeezeend', () => { controller.userData.gripDown = false; releaseMenu(controller); releaseBoard(controller); if (!controller.userData.triggerDown) releasePart(controller.userData.held); });
  }
  $('enter').onclick = async () => {
    try {
      if (tour.active) stopTour();
      const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });
      camera.userData.desktopPosition = camera.position.clone(); camera.userData.desktopQuaternion = camera.quaternion.clone();
      rig.position.set(0, 0, 1.0); orbit.enabled = false;
      await renderer.xr.setSession(session); vrSession = session; panelMesh.visible = true; menuPlacementPending = true; document.body.classList.add('immersive'); updateDrawings();
      session.addEventListener('end', () => {
        if (tour.active) stopTour();
        controllers.forEach(c => { releaseMenu(c); releaseBoard(c); releasePart(c.userData.held); }); rig.position.set(0, 0, 0);
        camera.position.copy(camera.userData.desktopPosition); camera.quaternion.copy(camera.userData.desktopQuaternion);
        orbit.enabled = true; vrSession = null; panelMesh.visible = false; document.body.classList.remove('immersive'); updateDrawings();
      });
    } catch (e) { rig.position.set(0, 0, 0); orbit.enabled = true; error(`VR could not start: ${e.message}`); }
  };
}
function updateControllers(dt) {
  for (const controller of controllers) {
    const source = controller.userData.source; if (!source) continue;
    const hit = visibleHits(controllerRay(controller))[0];
    controller.userData.rayLine.scale.z = hit ? Math.min(hit.distance, 5) : 3;
    const gamepad = source.gamepad; if (!gamepad) continue;
    const recallPressed = !!gamepad.buttons[4]?.pressed;
    if (recallPressed && !controller.userData.recallPressed) bringMenuHere();
    controller.userData.recallPressed = recallPressed;
    const secondaryPressed = !!gamepad.buttons[5]?.pressed;
    if (secondaryPressed && !controller.userData.secondaryPressed) {
      if (controller.userData.held) releasePart(controller.userData.held, true);
      else if (drawingGroup.visible) bringDrawingHere();
    }
    controller.userData.secondaryPressed = secondaryPressed;
    const x = gamepad.axes[2] || 0, y = gamepad.axes[3] || 0;
    const held = controller.userData.held || (controller.userData.heldMenu ? panelMesh : controller.userData.heldBoard ? drawingGroup : null);
    if (source.handedness === 'right' && held) {
      const motion = heldStickMotion(held.position.toArray(), x, y, dt);
      held.position.fromArray(motion.position);
                                                                               
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()).invert());
      held.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, motion.yaw));
    } else if (!tour.active && source.handedness === 'right' && !parts.some(p => p.userData.held) && !controllers.some(c => c.userData.heldMenu || c.userData.heldBoard) && !state.practice) {
      const intent = rightStickIntent(x, y);
      assembly.rotation.y -= intent.rotate * dt;
      const next = THREE.MathUtils.clamp(state.explosion + intent.explode * dt * .65, 0, 1);
      if (Math.abs(next - state.explosion) > .00001) setExplosion(next, false);
    }
    if (!tour.active && source.handedness === 'left' && (Math.abs(x) > .2 || Math.abs(y) > .2)) {
      const forward = new THREE.Vector3(); renderer.xr.getCamera().getWorldDirection(forward); forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      if (Math.abs(y) > .2) rig.position.addScaledVector(forward, -y * dt * .65);
      if (Math.abs(x) > .2) rig.position.addScaledVector(right, x * dt * .65);
      rig.position.x = THREE.MathUtils.clamp(rig.position.x, -3, 3); rig.position.z = THREE.MathUtils.clamp(rig.position.z, -2.5, 3);
    }
  }
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (!ready || tour.active || event.button !== 0 || renderer.xr.isPresenting) return;
  pointer.set(event.clientX / innerWidth * 2 - 1, -event.clientY / innerHeight * 2 + 1); raycaster.setFromCamera(pointer, camera);
  const hit = visibleHits(raycaster)[0];
  if (hit?.object === panelMesh) { menuClick(hit); orbit.enabled = false; pointerDrag = { menu: true }; renderer.domElement.setPointerCapture(event.pointerId); return; }
  if (!hit) return;
  if (hit.object.userData.calloutPart) { selectPart(hit.object.userData.calloutPart); return; }
  if (hit.object.userData.drawingBoard) return;
  selectPart(hit.object); hit.object.userData.held = true; hit.object.userData.falling = false; orbit.enabled = false; hit.object.userData.manual = true; hit.object.userData.snapped = false; hit.object.userData.practicePark = false;
  const normal = camera.getWorldDirection(new THREE.Vector3());
  pointerDrag = { part: hit.object, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point), last: hit.point, x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!pointerDrag || pointerDrag.menu) return;
  const drag = pointerDrag;
  if (event.shiftKey) { drag.part.rotateY((event.clientX - drag.x) * .01); drag.part.rotateX((event.clientY - drag.y) * .01); }
  else {
    pointer.set(event.clientX / innerWidth * 2 - 1, -event.clientY / innerHeight * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (point) { const world = drag.part.getWorldPosition(new THREE.Vector3()).add(point.clone().sub(drag.last)); drag.part.position.copy(drag.part.parent.worldToLocal(world)); drag.last.copy(point); }
  }
  drag.x = event.clientX; drag.y = event.clientY;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(event, () => { if (pointerDrag?.part) releasePart(pointerDrag.part); pointerDrag = null; orbit.enabled = !renderer.xr.isPresenting && !tour.active; });
$('tour-start').onclick = startTour; $('tour-pause').onclick = pauseTour; $('tour-stop').onclick = stopTour;
$('tour-prev').onclick = () => seekTour(tour.index - 1); $('tour-next').onclick = () => seekTour(tour.index + 1);
$('tour-chapter').onchange = event => seekTour(Number(event.target.value)); $('tour-motion').onchange = paintMenu;
for (const key of ['identify', 'ghost', 'section', 'drawings']) $(key).onclick = () => ready && toggle(key);
$('explode').oninput = event => ready && setExplosion(event.target.value);
$('scale').oninput = event => { if (!state.practice && !parts.some(p => p.userData.held)) state.scale = Number(event.target.value); syncUI(); };
$('cut').oninput = event => { state.cut = Number(event.target.value); syncUI(); };
$('parts').onchange = event => selectPart(parts.find(p => p.userData.record.file === event.target.value));
$('return').onclick = () => releasePart(state.selected, true); $('reset').onclick = reset;
$('practice').onclick = () => ready && togglePractice(); $('practice-restart').onclick = () => ready && restartPractice();
$('page-prev').onclick = () => pageStep(-1); $('page-next').onclick = () => pageStep(1); $('drawing-close').onclick = () => toggle('drawings');
$('rotate-left').onclick = () => { if (!parts.some(p => p.userData.held)) assembly.rotation.y += Math.PI / 12; };
$('rotate-right').onclick = () => { if (!parts.some(p => p.userData.held)) assembly.rotation.y -= Math.PI / 12; };
let drawingDrag = null;
$('drawing-title').addEventListener('pointerdown', event => {
  const rect = $('drawing').getBoundingClientRect(); drawingDrag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  $('drawing-title').setPointerCapture(event.pointerId);
});
$('drawing-title').addEventListener('pointermove', event => {
  if (!drawingDrag) return;
  $('drawing').style.left = `${THREE.MathUtils.clamp(event.clientX - drawingDrag.x, 0, innerWidth - 100)}px`;
  $('drawing').style.top = `${THREE.MathUtils.clamp(event.clientY - drawingDrag.y, 0, innerHeight - 60)}px`;
});
for (const event of ['pointerup', 'pointercancel']) $('drawing-title').addEventListener(event, () => { drawingDrag = null; });
window.addEventListener('keydown', event => {
  if (!ready || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (tour.active) {
    const actions = { ' ': pauseTour, ArrowRight: () => seekTour(tour.index + 1), ArrowLeft: () => seekTour(tour.index - 1), Escape: stopTour };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); } return;
  }
  if (event.key.toLowerCase() === 'g') { startTour(); return; }
  const actions = { e: () => setExplosion(state.explosion > .5 ? 0 : 1), x: () => toggle('section'), t: () => toggle('ghost'), i: () => toggle('identify'), r: reset, Escape: () => releasePart(state.selected, true) };
  actions[event.key]?.();
});
window.addEventListener('resize', () => { if (!renderer.xr.isPresenting) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && tour.active && !tour.paused) { tour.paused = true; syncTourUI(); } });

async function setupOffline() {
  if (!('serviceWorker' in navigator)) { $('offline').disabled = true; return; }
  try {
    offlineRegistration = await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.type === 'CACHE_PROGRESS') $('offline-status').textContent = `Saving offline / ${event.data.done} of ${event.data.total} files`;
      if (event.data.type === 'CACHE_READY') { $('offline-status').textContent = 'Studio and all drawing sheets saved. Browser storage may still be cleared; test once with Wi-Fi off.'; $('offline').disabled = false; }
      if (event.data.type === 'CACHE_ERROR') { $('offline-status').textContent = `Offline save failed: ${event.data.message}`; $('offline').disabled = false; }
    });
  } catch (e) { $('offline-status').textContent = `Offline storage unavailable: ${e.message}`; }
}
$('offline').onclick = async () => {
  if (!offlineRegistration) return;
  $('offline').disabled = true;
  try {
    await navigator.storage?.persist?.();
    const registration = await navigator.serviceWorker.ready; registration.active.postMessage({ type: 'CACHE_ALL' });
  } catch (e) { $('offline-status').textContent = e.message; $('offline').disabled = false; }
};

                                                                       
function recordStudioDiagnostics() {
  $('view').dataset.studio = JSON.stringify({ ready, state: { ...state, selected: state.selected?.userData.record.file },
    tour: { active: tour.active, paused: tour.paused, time: tour.time, index: tour.index, motion: tour.motion },
    camera: camera.position.toArray(), cameraQ: camera.quaternion.toArray(), rig: rig.position.toArray(), rigQ: rig.quaternion.toArray(), assemblyQ: assembly.quaternion.toArray(),
    orbitEnabled: orbit.enabled, parts: parts.map(p => ({ file: p.userData.record.file, group: p.userData.record.group, position: p.position.toArray(), quaternion: p.quaternion.toArray(), scale: p.scale.toArray(),
      parent: p.parent === assembly ? 'assembly' : p.parent === scene ? 'scene' : 'controller', manual: !!p.userData.manual, falling: !!p.userData.falling, snapped: !!p.userData.snapped, opacity: p.material.opacity, clipping: p.material.clippingPlanes?.length || 0 })) });
}
let previousTime = 0, calloutTime = 0, diagnosticsTime = 0;
renderer.setAnimationLoop(time => {
  const elapsed = Math.max(0, (time - previousTime) / 1000 || .016);
  const dt = Math.min(elapsed, .05); previousTime = time;
  if (!renderer.xr.isPresenting && !tour.active) orbit.update();
  if (ready) {
    if (tour.active && !tour.paused) { tour.time = Math.min(tourDuration, tour.time + elapsed); applyTourFrame(); }
    assembly.scale.setScalar(state.scale); assembly.position.set(.2, 1.035 - bounds.min.y * state.scale, -.9); assembly.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(assembly.quaternion);
    const cutZ = THREE.MathUtils.lerp(bounds.min.z - .005, bounds.max.z + .005, state.cut);
    sectionPlane.setFromNormalAndCoplanarPoint(normal, assembly.localToWorld(new THREE.Vector3(0, 0, cutZ)));
    for (const part of parts) {
      const info = part.userData;
      if (!info.manual && !info.held) {
        const home = info.home.clone().addScaledVector(info.offset, state.practice && info.practicePark ? 1 : state.explosion);
        if (tour.active) { part.position.copy(home); part.quaternion.identity(); }
        else { part.position.lerp(home, 1 - Math.exp(-12 * dt)); part.quaternion.slerp(new THREE.Quaternion(), 1 - Math.exp(-12 * dt)); }
        if (tour.active && tour.frame.chapter.spin && ['roller', 'cover_open', 'cover_closed', 'screw_m5'].includes(info.record.group)) {
          const angle = tour.frame.spinAngle;
          part.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), angle); part.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
        }
      }
      if (state.practice && info.falling && !info.held && !info.snapped) {
        part.updateWorldMatrix(true, false);
        const box = new THREE.Box3().setFromObject(part);
        const step = fallStep(box.min.toArray(), box.max.toArray(), info.fallVelocity || 0, dt);
        part.position.y += step.dy; info.fallVelocity = step.velocity;
        if (canFitPart(part)) releasePart(part, true);
        else if (step.settled) info.falling = false;
      }
      const groupSelected = state.selected && ((state.identify || state.drawings) ? state.selected.userData.record.group === info.record.group : state.selected === part);
      part.material.color.copy(state.identify ? info.colour : new THREE.Color(0x30373d));
      const tourFocused = tour.active && tour.frame.chapter.groups.includes(info.record.group);
      part.material.emissive.setHex(tourFocused ? 0x244854 : groupSelected && !tour.active ? 0x182129 : 0x000000);
      const transparent = state.ghost && info.record.outer;
      if (part.material.transparent !== transparent) { part.material.transparent = transparent; part.material.needsUpdate = true; }
      part.material.opacity = transparent ? .16 : 1; part.material.depthWrite = !transparent;
      const clipping = state.section ? [sectionPlane] : [];
      if (part.material.clippingPlanes?.length !== clipping.length) part.material.needsUpdate = true;
      part.material.clippingPlanes = clipping;
    }
    if (tour.active) updateTour(dt);
    calloutTime += dt;
    if (calloutTime > .12) {
      calloutTime = 0;
      updateCallouts(); updatePracticeGuide();
      if (tour.active) { $('tour-progress').value = tour.time; if (Math.floor(tour.time * 2) !== tour.uiTick) { tour.uiTick = Math.floor(tour.time * 2); syncTourUI(); } }
      if (uiDirty) { uiDirty = false; syncUI(); }
    }
    if (renderer.xr.isPresenting) updateControllers(dt);
  }
  renderer.render(scene, camera);
  diagnosticsTime += dt; if (ready && diagnosticsTime > .25) { diagnosticsTime = 0; recordStudioDiagnostics(); }
                                                                              
  if (menuPlacementPending && renderer.xr.isPresenting && renderer.xr.getCamera().cameras.length) {
    menuPlacementPending = false;
    bringMenuHere(-.75);
  }
});

                                                                              
window.studio = { state, tour, parts, scene, camera, renderer, assembly, orbit, rig, selectPart, setExplosion, toggle, reset, pageStep, releasePart, get ready() { return ready; } };
load().catch(e => { error(`Studio could not load: ${e.message}`); const loading = $('loading'); if (loading) loading.textContent = 'Load failed. See the error beside the controls.'; console.error(e); });
