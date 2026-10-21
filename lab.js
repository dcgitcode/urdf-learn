import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { createSourceView } from './urdfSource.js';
import { modelBaseURL, modelURL } from './model-paths.js';

const $ = id => document.getElementById(id);
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const names = ['腰部旋转', '大臂', '小臂', '腕部俯仰', '腕部旋转', '夹爪开合'];
const simpleXML = `<?xml version="1.0"?>
<robot name="two_link_lab">
  <link name="base"><visual><origin xyz="0 0 0.025"/><geometry><cylinder radius="0.045" length="0.05"/></geometry></visual></link>
  <link name="arm"><visual><origin xyz="0 0 0.1"/><geometry><box size="0.025 0.025 0.2"/></geometry></visual></link>
  <joint name="shoulder" type="revolute"><parent link="base"/><child link="arm"/><origin xyz="0 0 0.05" rpy="0 0 0"/><axis xyz="0 1 0"/><limit lower="-1.4" upper="1.4" effort="10" velocity="1"/></joint>
</robot>`;
// 可选模型来源：file 为源码面板显示的文件名，url 为 public/URDF 下的路径，
// xml 表示内置文本；tip / tipLocal 指定末端测量点，未指定时自动取运动链末梢连杆。
const MODEL_SOURCES = {
  arm: {
    file: 'so_arm100_teaching.urdf',
    url: modelURL('so_arm100_teaching.urdf'),
    tip: 'zhua',
    tipLocal: [0, 0, 0],
    title: 'SO-ARM100',
    tipText: '测量点：夹爪 zhua 原点（非夹持中心）。位置相对 Base 基座。',
    names
  },
  simple: {
    file: 'two_link_lab.urdf',
    xml: simpleXML,
    tip: 'arm',
    tipLocal: [0, 0, .2],
    title: '两连杆 · 一个转动关节',
    tipText: '测量点：连杆顶部（arm 局部 Z = 200 mm）。位置相对 base 基座。'
  },
  my_rebot: {
    file: 'my_rebot.urdf',
    url: modelURL('my_rebot.urdf'),
    title: '我的机器人 my_rebot'
  }
};
const scene = new THREE.Scene();
scene.background = new THREE.Color('#edf0e8');
const camera = new THREE.PerspectiveCamera(37, 1, .001, 20);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
$('viewport').appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '机器人三维模型，可拖动旋转、滚轮缩放');
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = .15;
orbit.maxDistance = 2;
scene.add(new THREE.HemisphereLight('#fffdf4', '#818e78', 2.5));
const light = new THREE.DirectionalLight('#fff5e4', 3);
light.position.set(.5, -.3, .8);
scene.add(light);
const fill = new THREE.DirectionalLight('#e2ecf3', 1.4);
fill.position.set(-.4, .5, .3);
scene.add(fill);
const grid = new THREE.GridHelper(1.5, 30, '#a4b39b', '#cfd7c6');
grid.rotation.x = Math.PI / 2;
grid.position.z = -.001;
scene.add(grid);
const baseAxes = new THREE.AxesHelper(.10);
scene.add(baseAxes);
const marker = new THREE.Mesh(new THREE.SphereGeometry(.006, 20, 12), new THREE.MeshBasicMaterial({ color: '#c3662c' }));
scene.add(marker);
const selectedAxes = new THREE.AxesHelper(.065);
selectedAxes.renderOrder = 5;
selectedAxes.material.depthTest = false;
const trailGeometry = new THREE.BufferGeometry();
const trailBuffer = new Float32Array(2500 * 3);
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailBuffer, 3).setUsage(THREE.DynamicDrawUsage));
trailGeometry.setDrawRange(0, 0);
const trailLine = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: '#b95c27', depthTest: false }));
trailLine.renderOrder = 4;
trailLine.frustumCulled = false;
scene.add(trailLine);

let robot = null, joints = [], selected = '', xmlDocument = null, modelKey = 'arm';
let baseline = null, animation = null, loading = false, revision = 0, trailCount = 0, editing = false;
const records = [];
const jointUI = new Map();
const tipLocal = new THREE.Vector3();
let tipLink = null;
let viewCenter = new THREE.Vector3(0, 0, .2), viewRadius = .26;
const sourceView = createSourceView({ onSelect: selectSourceEntity });

function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.error = String(error);
}
function home() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = viewRadius / Math.sin(Math.min(vertical, horizontal)) * 1.18;
  orbit.target.copy(viewCenter);
  camera.position.copy(viewCenter).add(new THREE.Vector3(.9, -1.3, .65).normalize().multiplyScalar(distance));
  orbit.update();
}
home();
new ResizeObserver(() => {
  const { width, height } = $('viewport').getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  const changedAspect = Math.abs(camera.aspect - width / height) > .15;
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  if (changedAspect) home();
}).observe($('viewport'));

function currentPosition() {
  robot.updateMatrixWorld(true);
  // Convert back through the robot root: measurements stay in base-frame metres,
  // independent of the camera, viewport and any future display transformations.
  const worldPoint = tipLink.localToWorld(tipLocal.clone());
  return robot.worldToLocal(worldPoint);
}
function angles() {
  return Object.fromEntries(joints.map(j => [j.name, j.jointValue[0]]));
}
function clearTrail() {
  trailCount = 0;
  trailGeometry.setDrawRange(0, 0);
}
function appendTrail(point) {
  if (!$('trail').checked) return;
  if (trailCount) {
    const prev = new THREE.Vector3().fromArray(trailBuffer, (trailCount - 1) * 3);
    if (prev.distanceToSquared(point) < 1e-9) return;
  }
  if (trailCount >= 2500) {
    trailBuffer.copyWithin(0, 3);
    trailCount--;
  }
  point.toArray(trailBuffer, trailCount++ * 3);
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.setDrawRange(0, trailCount);
}
function refresh() {
  if (!robot) return;
  const point = currentPosition();
  marker.position.copy(robot.localToWorld(point.clone()));
  appendTrail(marker.position);
  ['x', 'y', 'z'].forEach(axis => { $('p' + axis).textContent = (point[axis] * 1000).toFixed(1); });
  if (baseline) {
    const delta = point.clone().sub(baseline.position).multiplyScalar(1000);
    $('distance').textContent = delta.length().toFixed(1);
    $('delta-components').textContent = `ΔX ${delta.x.toFixed(1)} / ΔY ${delta.y.toFixed(1)} / ΔZ ${delta.z.toFixed(1)} mm`;
  }
  for (const j of joints) {
    const ui = jointUI.get(j.name);
    const value = deg(j.jointValue[0]).toFixed(1);
    ui.slider.value = value;
    if (document.activeElement !== ui.number) ui.number.value = value;
  }
}
function cancelDemo() {
  animation = null;
  $('demo').textContent = '演示一次';
}
function saveBaseline() {
  cancelDemo();
  baseline = { position: currentPosition(), angles: angles() };
  clearTrail();
  refresh();
  status('已保存对照基线。现在只改变一个关节，观察末端位移。');
}
function restoreBaseline() {
  cancelDemo();
  robot.setJointValues(baseline.angles);
  clearTrail();
  refresh();
  status('已回到当前对照基线。');
}
function setAngle(joint, value) {
  if (!Number.isFinite(value)) return;
  cancelDemo();
  const low = deg(joint.limit.lower), high = deg(joint.limit.upper);
  const clamped = THREE.MathUtils.clamp(value, low, high);
  joint.setJointValue(rad(clamped));
  selectJoint(joint.name, selected !== joint.name);
  refresh();
  status(value !== clamped ? `已限制在 ${low.toFixed(1)}°～${high.toFixed(1)}° 范围内。` : `${joint.name} → ${clamped.toFixed(1)}°。URDF 描述结构；当前角度由控件设置。`);
}
function jointNode() {
  return [...xmlDocument.querySelectorAll('joint')].find(n => n.getAttribute('name') === selected);
}
function selectedJointEditable() {
  const joint = robot?.joints[selected];
  return Boolean(joint) && ['revolute', 'prismatic'].includes(joint.jointType);
}
function selectJoint(name, updateFields = true, scrollCode = false) {
  const joint = robot.joints[name];
  if (!joint) return;
  selected = name;
  const movable = joint.jointType !== 'fixed';
  const editable = ['revolute', 'prismatic'].includes(joint.jointType);
  if (movable) joint.add(selectedAxes);
  selectedAxes.visible = $('axes').checked && movable;
  $('apply').disabled = !editable;
  $('lower').disabled = $('upper').disabled = !editable;
  for (const [key, ui] of jointUI) {
    ui.row.classList.toggle('active', key === name);
    ui.button.setAttribute('aria-pressed', String(key === name));
  }
  $('joint-picker').value = name;
  const node = jointNode();
  if (node?.querySelector('child')) highlightLink(node.querySelector('child').getAttribute('link'));
  sourceView.select('joint', name, scrollCode);
  explainNode('joint', name);
  if (!updateFields) return;
  const origin = (node.querySelector('origin')?.getAttribute('xyz') || '0 0 0').trim().split(/\s+/).map(Number);
  ['x', 'y', 'z'].forEach((axis, i) => { $('origin-' + axis).value = +((origin[i] || 0) * 1000).toFixed(3); });
  if (editable) {
    const axis = node.querySelector('axis')?.getAttribute('xyz') || '1 0 0';
    const options = [...$('axis').options];
    options.filter(o => o.dataset.custom).forEach(o => o.remove());
    if (!options.some(o => o.value === axis)) {
      const option = new Option('原模型转轴 ' + axis, axis);
      option.dataset.custom = 'true';
      $('axis').add(option);
    }
    $('axis').value = axis;
    $('lower').value = deg(joint.limit.lower).toFixed(2);
    $('upper').value = deg(joint.limit.upper).toFixed(2);
    for (const key of ['lower', 'upper']) {
      $(key).dataset.radians = joint.limit[key];
      $(key).dataset.shown = $(key).value;
    }
  }
  $('selected-name').textContent = '当前关节：' + name;
}
function clearSelection() {
  // 整机全是固定关节时，没有可调部件：清空关节控件并给出说明。
  selected = '';
  jointUI.clear();
  $('joint-picker').replaceChildren();
  $('joints').replaceChildren();
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '这个模型没有可动关节（全部为 fixed）。可在右侧「编辑全文」中加入 revolute 关节。';
  $('joints').appendChild(hint);
  $('selected-name').textContent = '当前没有可动关节';
  $('apply').disabled = true;
  $('lower').disabled = $('upper').disabled = true;
  $('lower').value = $('upper').value = '';
}
function leafLink() {
  // 运动链末梢：不作为任何关节 parent 的连杆；用于未显式指定 tip 的自定义模型。
  const parents = new Set(Object.values(robot.joints).map(j => j.parent?.name).filter(Boolean));
  return Object.values(robot.links).find(link => !parents.has(link.name)) || null;
}
function highlightLink(linkName) {
  if (!robot) return;
  robot.traverse(mesh => {
    if (!mesh.isMesh) return;
    let owner = mesh;
    while (owner && robot.links[owner.name] !== owner) owner = owner.parent;
    const active = owner?.name === linkName;
    mesh.material.color.set(active ? '#c58b42' : '#759283');
    mesh.material.emissive.set(active ? '#3c2108' : '#000000');
    mesh.material.emissiveIntensity = .18;
  });
}
function explainNode(kind, name) {
  const node = [...xmlDocument.documentElement.children].find(n => n.tagName === kind && n.getAttribute('name') === name);
  if (!node) return;
  if (kind === 'joint') {
    const parent = node.querySelector('parent').getAttribute('link');
    const child = node.querySelector('child').getAttribute('link');
    const xyz = node.querySelector('origin')?.getAttribute('xyz') || '0 0 0';
    const axis = node.querySelector('axis')?.getAttribute('xyz') || '1 0 0';
    $('code-selection').textContent = `${name} · ${parent} → ${child}`;
    $('code-explanation').textContent = `joint 连接两个连杆。origin xyz="${xyz}"（m）指定安装位置；axis="${axis}" 是关节局部转轴。模型中橙色部分为子连杆 ${child}。`;
  } else {
    const mesh = node.querySelector('mesh')?.getAttribute('filename');
    $('code-selection').textContent = `link ${name} · 模型中已用橙色标出`;
    $('code-explanation').textContent = mesh ? `visual 定义这块部件的外形，mesh 加载 ${mesh}；visual/origin 只调整外形相对连杆的位置。` : 'visual/geometry 定义这块部件的外形；它与 joint 定义的连接位置是两回事。';
  }
}
function selectSourceEntity(kind, name, scroll = false) {
  if (!robot || loading) return;
  cancelDemo();
  if (kind === 'joint') selectJoint(name, true, scroll);
  else {
    const incoming = [...xmlDocument.querySelectorAll('joint')].find(n => n.querySelector('child')?.getAttribute('link') === name);
    if (incoming) selectJoint(incoming.getAttribute('name'), true, false);
    highlightLink(name);
    sourceView.select('link', name, scroll);
    explainNode('link', name);
  }
  status(`已对应 ${kind} ${name}。橙色部件与高亮代码是同一模型结构。`);
}
function makeJointUI() {
  $('joints').replaceChildren();
  jointUI.clear();
  joints.forEach((joint, index) => {
    const row = document.createElement('div');
    row.className = 'joint';
    const title = modelKey === 'arm' ? (names[index] || joint.name) : modelKey === 'simple' ? '肩部关节' : joint.name;
    row.innerHTML = `<div class="joint-top"><button class="joint-label" type="button"></button><div class="joint-number"><input type="number" step="0.1"><span>°</span></div></div><input type="range" step="0.1"><div class="range-labels"><span></span><span></span></div>`;
    const button = row.querySelector('button');
    button.textContent = `${String(index + 1).padStart(2, '0')}  ${title}`;
    button.title = joint.name;
    const slider = row.querySelector('[type=range]');
    const number = row.querySelector('[type=number]');
    for (const input of [slider, number]) {
      input.min = deg(joint.limit.lower);
      input.max = deg(joint.limit.upper);
      input.value = deg(joint.jointValue[0]);
      input.setAttribute('aria-label', title + '角度');
    }
    slider.step = 'any';
    row.querySelector('.range-labels span:first-child').textContent = deg(joint.limit.lower).toFixed(1) + '°';
    row.querySelector('.range-labels span:last-child').textContent = deg(joint.limit.upper).toFixed(1) + '°';
    button.onclick = () => selectJoint(joint.name, true, true);
    slider.oninput = () => setAngle(joint, slider.valueAsNumber);
    number.oninput = () => {
      if (Number.isFinite(number.valueAsNumber)) setAngle(joint, number.valueAsNumber);
    };
    number.onchange = () => {
      if (number.value === '' || !Number.isFinite(number.valueAsNumber)) {
        number.value = deg(joint.jointValue[0]).toFixed(1);
        status('请输入有效的关节角度。', true);
        return;
      }
      setAngle(joint, number.valueAsNumber);
      number.value = deg(joint.jointValue[0]).toFixed(1);
    };
    $('joints').appendChild(row);
    jointUI.set(joint.name, { row, button, slider, number });
  });
}
function disposeModel(model) {
  if (!model) return;
  selectedAxes.removeFromParent();
  model.removeFromParent();
  model.traverse(o => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}
function parseModel(xml) {
  return new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    let candidate, failed = false;
    manager.onError = url => { failed = true; reject(new Error('无法加载模型资源：' + url)); };
    manager.onLoad = () => {
      if (failed) { disposeModel(candidate); return; }
      resolve(candidate);
    };
    const loader = new URDFLoader(manager);
    manager.itemStart('lab-model');
    try {
      candidate = loader.parse(xml, modelBaseURL);
      manager.itemEnd('lab-model');
    } catch (error) {
      failed = true;
      disposeModel(candidate);
      reject(error);
      manager.itemEnd('lab-model');
    }
  });
}
async function loadModel(xml, modified = false) {
  if (loading) return false;
  loading = true;
  cancelDemo();
  $('loading').hidden = false;
  $('loading').textContent = '正在加载机器人…';
  const interactive = ['model', 'reset', 'baseline', 'restore', 'demo', 'record', 'apply', 'export-urdf', 'copy-source', 'edit-source', 'joint-picker', 'locate-code', 'editor-apply', 'editor-reset', 'editor-cancel'];
  interactive.forEach(id => { $(id).disabled = true; });
  $('joints').inert = true;
  try {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error('URDF 格式无法解析');
    const candidate = await parseModel(xml);
    candidate.traverse(o => {
      if (o.isMesh) {
        const original = o.material;
        o.material = new THREE.MeshStandardMaterial({ color: '#759283', metalness: .12, roughness: .5 });
        (Array.isArray(original) ? original : [original]).forEach(m => m?.dispose());
      }
    });
    disposeModel(robot);
    robot = candidate;
    xmlDocument = parsed;
    scene.add(robot);
    const bounds = new THREE.Box3().setFromObject(robot);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    viewCenter.copy(sphere.center);
    viewRadius = Math.max(sphere.radius, .15);
    const source = MODEL_SOURCES[modelKey] || {};
    joints = Object.values(robot.joints).filter(j => j.jointType === 'revolute');
    tipLink = (source.tip && robot.links[source.tip]) || leafLink() || robot;
    tipLocal.set(...(source.tipLocal || [0, 0, 0]));
    $('tip-definition').textContent = source.tipText || '测量点：末端连杆原点。位置相对基座。';
    $('view-title').textContent = source.title || robot.name || '自定义模型';
    revision++;
    $('joint-picker').replaceChildren(...joints.map((j, i) => new Option(`${modelKey === 'arm' ? (names[i] || j.name) : modelKey === 'simple' ? '肩部关节' : j.name} · ${j.name}`, j.name)));
    sourceView.render(xmlDocument, source.file || 'model.urdf');
    $('file-origin').textContent = modified ? '当前修改副本 · 原文件未覆盖' : '完整文件 · 与当前模型一致';
    makeJointUI();
    if (joints.length) selectJoint(joints[0].name); else clearSelection();
    saveBaseline();
    home();
    $('loading').hidden = true;
    status('模型已就绪。右侧是完整 URDF；点击代码块或三维部件，查看对应关系。');
    return true;
  } catch (error) {
    $('loading').textContent = '加载失败，请刷新重试。' + error.message;
    status(error.message, true);
    return false;
  } finally {
    loading = false;
    interactive.forEach(id => { $(id).disabled = !robot; });
    $('apply').disabled = !selectedJointEditable();
    $('model').disabled = false;
    $('joints').inert = false;
  }
}

for (const axis of ['x', 'y', 'z']) {
  const label = document.createElement('label');
  label.textContent = axis.toUpperCase();
  const input = document.createElement('input');
  input.id = 'origin-' + axis;
  input.type = 'number';
  input.step = '.1';
  input.min = '-1000';
  input.max = '1000';
  input.required = true;
  label.appendChild(input);
  $('origin-fields').appendChild(label);
}
$('parameters').onsubmit = async event => {
  event.preventDefault();
  if (!selectedJointEditable()) { status('当前关节不支持结构编辑（固定关节没有转轴和限位）。', true); return; }
  const lower = $('lower').valueAsNumber, upper = $('upper').valueAsNumber;
  const origin = ['x', 'y', 'z'].map(axis => $('origin-' + axis).valueAsNumber / 1000);
  if (![lower, upper, ...origin].every(Number.isFinite) || lower >= upper || lower > 0 || upper < 0 || lower < -180 || upper > 180) {
    status('请输入有效连接位置；限位需包含 0°，下限小于上限，且位于 -180°～180°。', true);
    return;
  }
  const copy = xmlDocument.cloneNode(true);
  const node = [...copy.querySelectorAll('joint')].find(n => n.getAttribute('name') === selected);
  let originNode = node.querySelector('origin');
  if (!originNode) { originNode = copy.createElement('origin'); node.insertBefore(originNode, node.querySelector('parent')); }
  originNode.setAttribute('xyz', origin.join(' '));
  node.querySelector('axis')?.setAttribute('xyz', $('axis').value);
  const limit = node.querySelector('limit');
  if (limit) {
    limit.setAttribute('lower', lower === Number($('lower').dataset.shown) ? $('lower').dataset.radians : rad(lower));
    limit.setAttribute('upper', upper === Number($('upper').dataset.shown) ? $('upper').dataset.radians : rad(upper));
  }
  const name = selected;
  if (await loadModel(new XMLSerializer().serializeToString(copy), true)) {
    selectJoint(name, true, true);
    status('结构已更新；关节归零并重置基线。旧实验记录仍保留各自的模型版本。');
  }
};
$('model').onchange = async () => {
  const previous = modelKey;
  const key = $('model').value;
  $('model').disabled = true;
  if (editing) setEditing(false);
  try {
    const xml = await fetchModel(key);
    modelKey = key;
    if (!await loadModel(xml)) { $('model').value = previous; modelKey = previous; }
  } catch (error) { $('model').value = previous; modelKey = previous; status(error.message, true); }
  finally { $('model').disabled = false; }
};
$('reset').onclick = () => {
  cancelDemo();
  joints.forEach(j => j.setJointValue(0));
  clearTrail(); refresh();
  status('所有关节已归零；对照基线保持不变。');
};
$('baseline').onclick = saveBaseline;
$('restore').onclick = restoreBaseline;
$('home').onclick = home;
function mobilePane(pane) {
  document.body.dataset.mobilePane = pane;
  $('show-model').setAttribute('aria-pressed', String(pane === 'model'));
  $('show-source').setAttribute('aria-pressed', String(pane === 'source'));
}
$('show-model').onclick = () => mobilePane('model');
$('show-source').onclick = () => mobilePane('source');
$('joint-picker').onchange = () => selectJoint($('joint-picker').value, true, true);
$('locate-code').onclick = () => {
  sourceView.select('joint', selected, true);
  explainNode('joint', selected);
  if (matchMedia('(max-width:900px)').matches) mobilePane('source');
};
$('copy-source').onclick = async () => {
  try {
    await navigator.clipboard.writeText(sourceView.text());
    status('已复制完整 URDF，包含全部 link 和 joint。');
    $('copy-source').textContent = '已复制';
    setTimeout(() => { $('copy-source').textContent = '复制全文'; }, 1800);
  } catch {
    status('浏览器未允许复制，请使用「下载」获取完整 URDF。', true);
  }
};
const raycaster = new THREE.Raycaster();
let pointerStart = null;
renderer.domElement.addEventListener('pointerdown', event => { pointerStart = { x:event.clientX, y:event.clientY }; });
renderer.domElement.addEventListener('pointerup', event => {
  if (!pointerStart || event.button !== 0 || Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5 || !robot || loading) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1, -(event.clientY-bounds.top)/bounds.height*2+1), camera);
  const hit = raycaster.intersectObject(robot, true).find(h => h.object.isMesh);
  if (!hit) return;
  let link = hit.object;
  while (link && robot.links[link.name] !== link) link = link.parent;
  if (link) selectSourceEntity('link', link.name, true);
});
$('axes').onchange = () => {
  baseAxes.visible = $('axes').checked;
  const joint = robot?.joints[selected];
  selectedAxes.visible = $('axes').checked && Boolean(joint) && joint.jointType !== 'fixed';
};
$('trail').onchange = () => { trailLine.visible = $('trail').checked; clearTrail(); refresh(); };
$('clear-trail').onclick = () => { clearTrail(); refresh(); status('已清除轨迹。'); };
$('demo').onclick = () => {
  if (animation) { cancelDemo(); status('演示已停止，保留当前姿态。'); return; }
  if (!joints.length) { status('当前模型没有可动关节，无法演示。', true); return; }
  restoreBaseline();
  const joint = joints[Math.min(1, joints.length - 1)];
  selectJoint(joint.name);
  const start = joint.jointValue[0];
  const end = start + (joint.limit.upper - start >= rad(10) ? rad(10) : -rad(10));
  animation = { joint, start, end: THREE.MathUtils.clamp(end, joint.limit.lower, joint.limit.upper), time: performance.now() };
  $('demo').textContent = '停止演示';
  status('演示：从基线出发，只改变一个关节，观察橙色末端轨迹。');
};
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('export-urdf').onclick = () => {
  download(`robot-lab-v${revision}.urdf`, sourceView.text(), 'application/xml');
  status('已下载当前结构的 URDF。它保存结构参数，不保存当前关节姿态。');
};
$('record').onclick = () => {
  cancelDemo();
  const point = currentPosition();
  const snapshot = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    model: $('model').selectedOptions[0].textContent,
    revision, note: $('note').value.trim() || '关节姿态对照',
    point: point.toArray().map(v => v * 1000), angles: angles(),
    baselinePoint: baseline.position.toArray().map(v => v * 1000), baselineAngles: { ...baseline.angles },
    distance: point.distanceTo(baseline.position) * 1000,
    urdf: new XMLSerializer().serializeToString(xmlDocument)
  };
  records.push(snapshot);
  if (records.length === 1) $('records').replaceChildren();
  const li = document.createElement('li');
  const strong = document.createElement('strong'); strong.textContent = `${records.length}. ${snapshot.note}`;
  const detail = document.createElement('small');
  detail.textContent = `X ${snapshot.point[0].toFixed(1)} · Y ${snapshot.point[1].toFixed(1)} · Z ${snapshot.point[2].toFixed(1)} mm / 位移 ${snapshot.distance.toFixed(1)} mm`;
  const meta = document.createElement('small'); meta.textContent = `${snapshot.model} · 版本 ${revision} · ${snapshot.time}`;
  li.append(strong, detail, meta); $('records').prepend(li);
  $('record-count').textContent = records.length;
  $('export').disabled = false;
  $('note').value = '';
  status(`已记录第 ${records.length} 次实验。导出文件包含模型结构、关节角度及基线。`);
};
function csvCell(value) {
  // Prevent user-entered notes from becoming spreadsheet formulas.
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
$('export').onclick = () => {
  const header = ['序号', '时间', '模型', '模型版本', '实验说明', 'X_mm', 'Y_mm', 'Z_mm', '位移_mm', '基线X_mm', '基线Y_mm', '基线Z_mm', '关节角度_deg_JSON', '基线关节角度_deg_JSON', 'URDF结构'];
  const degreesJSON = q => JSON.stringify(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, +deg(v).toFixed(3)])));
  const rows = records.map((r, i) => [i + 1, r.time, r.model, r.revision, r.note, ...r.point.map(v => v.toFixed(3)), r.distance.toFixed(3), ...r.baselinePoint.map(v => v.toFixed(3)), degreesJSON(r.angles), degreesJSON(r.baselineAngles), r.urdf]);
  const cell = v => typeof v === 'number' || /^-?\d+\.\d+$/.test(String(v)) ? String(v) : csvCell(v);
  download('机械臂实验记录.csv', '\uFEFF' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  status(`已导出 ${records.length} 条实验记录。`);
};
renderer.setAnimationLoop(time => {
  if (animation && !loading) {
    const t = Math.min((time - animation.time) / 2200, 1);
    animation.joint.setJointValue(THREE.MathUtils.lerp(animation.start, animation.end, t * t * (3 - 2 * t)));
    refresh();
    if (t === 1) { cancelDemo(); status('演示完成。橙色曲线是模型计算的末端轨迹，可以记录本次实验。'); }
  }
  orbit.update();
  renderer.render(scene, camera);
});
function setEditing(on) {
  // 查看与编辑互斥：进入编辑时隐藏高亮源码、搜索栏和说明，显示纯文本编辑区。
  editing = on;
  $('source-editor').hidden = !on;
  $('source-code').hidden = on;
  $('source-toolbar').hidden = on;
  $('source-context').hidden = on;
  $('edit-source').textContent = on ? '退出编辑' : '编辑全文';
  if (on) { $('editor-text').value = sourceView.text(); $('editor-text').focus(); }
}
$('edit-source').onclick = () => setEditing(!editing);
$('editor-reset').onclick = () => { $('editor-text').value = sourceView.text(); status('已恢复为当前模型的文本。'); };
$('editor-cancel').onclick = () => setEditing(false);
$('editor-apply').onclick = async () => {
  const text = $('editor-text').value;
  if (!text.trim()) { status('编辑内容为空，无法应用。', true); return; }
  if (await loadModel(text, true)) {
    setEditing(false);
    status('已按编辑后的文本重建模型；改动只在本页生效，不覆盖原文件。');
  }
};
async function fetchModel(key) {
  const source = MODEL_SOURCES[key];
  if (!source) throw new Error('未知模型：' + key);
  if (source.xml) return source.xml;
  const response = await fetch(source.url);
  if (!response.ok) throw new Error('模型读取失败：HTTP ' + response.status + '（' + source.url + '）');
  return response.text();
}
async function loadModelFor(key) {
  modelKey = key;
  try {
    if (!await loadModel(await fetchModel(key))) $('model').disabled = false;
  } catch (error) {
    $('loading').textContent = error.message;
    status(error.message, true);
    $('model').disabled = false;
  }
}
loadModelFor('arm');
