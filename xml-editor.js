import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { lessons } from './xml-lessons.js';
import { validateXML } from './xml-validation.js';
import { createMeshAssets } from './mesh-assets.js';
import { attachCompletion } from './xml-completion.js';

const $ = id => document.getElementById(id);
const input = $('xml-input');
const storageKey = 'urdf-zero-xml-draft-v1';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eaf0e4');
const camera = new THREE.PerspectiveCamera(38, 1, .001, 100);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
$('editor-viewport').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '当前 XML 对应的机器人模型，可拖动旋转、滚轮缩放');
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = .08;
orbit.maxDistance = 30;
scene.add(new THREE.HemisphereLight('#fffdf1', '#89997c', 2.5));
const keyLight = new THREE.DirectionalLight('#fff5df', 2.5);
keyLight.position.set(.7, -.5, 1); scene.add(keyLight);
const fill = new THREE.DirectionalLight('#e0e9f5', 1.5);
fill.position.set(-.5, .5, .3); scene.add(fill);
const grid = new THREE.GridHelper(2, 40, '#a6b69a', '#ccd6c0');
grid.rotation.x = Math.PI / 2; grid.position.z = -.001; scene.add(grid);
const worldAxes = new THREE.AxesHelper(.10); scene.add(worldAxes);
let robot = null, timer = null, lastPreviewText = null, previousReplacement = null, previewVersion = 0;
let axes = [], lastLinkCount = -1, viewRadius = .24, viewCenter = new THREE.Vector3(0, 0, .15);
let completion = null;
const assets = createMeshAssets(info=>{
  $('mesh-count').textContent=`已解析 ${info.count} 个 STL · ${info.sources.join(' / ')}`;
  completion?.refresh();
});

function fitView() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = viewRadius / Math.sin(Math.min(vertical, horizontal)) * 1.12;
  camera.near = Math.max(viewRadius / 1000, .0001);
  camera.far = Math.max(viewRadius * 100, 100);
  camera.updateProjectionMatrix();
  orbit.target.copy(viewCenter);
  camera.position.copy(viewCenter).add(new THREE.Vector3(.85, -1.15, .65).normalize().multiplyScalar(distance));
  orbit.maxDistance = Math.max(30, viewRadius * 30);
  orbit.update();
}
fitView();
new ResizeObserver(() => {
  const {width,height} = $('editor-viewport').getBoundingClientRect();
  if (!width || !height) return;
  const aspectChanged = Math.abs(camera.aspect - width / height) > .15;
  renderer.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix();
  if (aspectChanged) fitView();
}).observe($('editor-viewport'));
renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene,camera); });

function diagnostic(kind, title, detail = '') {
  $('diagnostic').dataset.kind=kind;
  $('diagnostic-title').textContent=title;
  $('diagnostic-detail').textContent=detail;
}
function stale(message='源码已修改，等待预览') {
  const unchanged = input.value === lastPreviewText;
  $('preview-state').textContent = unchanged ? '与源码同步' : lastPreviewText === null ? '尚无成功预览' : '上一次成功预览';
  $('preview-state').dataset.kind = unchanged ? 'current' : 'stale';
  $('editor-joints').inert = !unchanged;
  $('editor-joints').setAttribute('aria-disabled', String(!unchanged));
  $('zero-joints').disabled = !unchanged || !robot || !Object.values(robot.joints || {}).some(j=>j.jointType!=='fixed');
  if (!unchanged) diagnostic('pending',message,'当前画面尚未使用新源码。XML 写完整并通过检查后，预览会更新。');
}
function syncLines() {
  const count=input.value.split('\n').length;
  $('line-numbers').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');
  $('line-numbers').scrollTop=input.scrollTop;
  $('line-count').textContent=`${count} 行 · ${input.value.length} 字符`;
}
function saveDraft() {
  try { localStorage.setItem(storageKey,input.value); $('draft-state').textContent='草稿已保存在本机'; }
  catch { $('draft-state').textContent='此浏览器未保存草稿，请下载源码'; }
}
function edited() {
  previewVersion++;
  clearTimeout(timer); syncLines(); saveDraft(); stale($('auto-preview').checked?'正在等你写完这段 XML…':'源码已修改，请点击预览');
  if ($('auto-preview').checked) timer=setTimeout(()=>preview(),600);
}
input.addEventListener('input',edited);
input.addEventListener('scroll',()=>{ $('line-numbers').scrollTop=input.scrollTop; });
input.addEventListener('keydown',event=>{
  if ((event.ctrlKey||event.metaKey) && event.key==='Enter') { event.preventDefault(); preview(true); return; }
  if (event.key==='Tab' && !event.shiftKey) {
    event.preventDefault(); input.setRangeText('  ',input.selectionStart,input.selectionEnd,'end'); edited();
  } else if (event.key==='Enter') {
    const prior=input.value.slice(0,input.selectionStart).split('\n').at(-1);
    const indent=prior.match(/^\s*/)[0];
    event.preventDefault(); input.setRangeText('\n'+indent,input.selectionStart,input.selectionEnd,'end'); edited();
  }
});
function disposeModel(model) {
  if (!model) return;
  model.removeFromParent();
  model.traverse(o=>{
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
  });
}
function makeModel(result,source) {
  if (!result.links.length) return new THREE.Group();
  const loader=new URDFLoader();
  loader.loadMeshCb=(path,manager,done)=>done(new THREE.Mesh(assets.get(path).clone()));
  const model=loader.parse(source,'');
  model.traverse(o=>{ if (o.isMesh) { o.material.side=THREE.DoubleSide; if(o.material.color.getHex()===0xffffff)o.material.color.set('#769d75'); } });
  return model;
}
function jointsUI() {
  $('editor-joints').replaceChildren();
  const movable=Object.values(robot.joints||{}).filter(j=>j.jointType!=='fixed');
  if (!movable.length) {
    const p=document.createElement('p'); p.className='hint';
    p.textContent='当前没有可动关节。写入 joint 后，滑块会自动出现在这里。'; $('editor-joints').append(p); return;
  }
  for (const joint of movable) {
    const linear=joint.jointType==='prismatic';
    const scale=linear?1000:180/Math.PI;
    const unit=linear?'mm':'°';
    const low=joint.jointType==='continuous'?-180:joint.limit.lower*scale;
    const high=joint.jointType==='continuous'?180:joint.limit.upper*scale;
    const row=document.createElement('div'); row.className='joint-control';
    const label=document.createElement('label');
    const title=document.createElement('span'); title.textContent=joint.name;
    const type=document.createElement('small');type.textContent=joint.jointType;
    const output=document.createElement('output');
    const slider=document.createElement('input'); slider.type='range';slider.step='any';slider.min=low;slider.max=high;slider.value=joint.jointValue[0]*scale;
    slider.setAttribute('aria-label',`${joint.name} 关节${linear?'位移':'角度'}`);
    slider.id='joint-'+joint.name; label.htmlFor=slider.id;
    const update=()=>{ joint.setJointValue(Number(slider.value)/scale); output.textContent=(joint.jointValue[0]*scale).toFixed(1)+' '+unit; robot.updateMatrixWorld(true); };
    slider.oninput=update; update();
    label.append(title,type,output);row.append(label,slider);$('editor-joints').append(row);
  }
}
async function preview(forceFit=false, resetAngles=false) {
  clearTimeout(timer);
  const version=++previewVersion, source=input.value;
  let candidate;
  try {
    const result=validateXML(source);
    if(result.doc.querySelector('visual mesh'))diagnostic('pending','正在读取 STL 外形…','网页模式自动读取项目 public/URDF 下的相对路径；本机文件夹优先。');
    await assets.prepare(result.doc);
    if(version!==previewVersion || input.value!==source)return;
    candidate=makeModel(result,source);
    if (!resetAngles && robot?.joints && candidate.joints) {
      for (const [name,joint] of Object.entries(candidate.joints)) {
        const old=robot.joints[name];
        if (old?.jointType===joint.jointType && old.jointType!=='fixed') joint.setJointValue(...old.jointValue);
      }
    }
    candidate.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(candidate);
    const oldRadius=viewRadius;
    if (!bounds.isEmpty()) {
      if (![...bounds.min,...bounds.max].every(Number.isFinite)) throw new Error('模型尺寸不是有效数值，请检查 geometry、origin 和 mesh scale。');
      const sphere=bounds.getBoundingSphere(new THREE.Sphere()); viewCenter.copy(sphere.center);viewRadius=Math.max(sphere.radius,.055);
    } else { viewCenter.set(0,0,.12);viewRadius=.2; }
    disposeModel(robot); robot=candidate; candidate=null;scene.add(robot);
    axes=[];
    for (const link of Object.values(robot.links||{})) {
      const helper=new THREE.AxesHelper(.045); helper.visible=$('show-axes').checked; helper.material.depthTest=false; helper.renderOrder=2;link.add(helper);axes.push(helper);
    }
    lastPreviewText=source;
    $('robot-title').textContent=result.doc.documentElement.getAttribute('name');
    $('model-count').textContent=`${result.links.length} links · ${result.joints.length} joints`;
    $('empty-model').hidden=!bounds.isEmpty();
    $('empty-model').querySelector('strong').textContent=result.links.length?'已定义坐标结构，尚无可见外形':'从一个空机器人开始';
    $('empty-model').querySelector('p').textContent=result.links.length?'给 link 添加 visual / geometry，就能看见外形。':'在左侧 robot 中写入 link 和 visual，这里就会出现第一个部件。';
    jointsUI();stale();
    const warnings=[];
    if(result.doc.querySelector('collision,inertial,gazebo')) warnings.push('检测到物理属性；此处只显示外形和关节，不计算动力学。');
    if(result.doc.querySelector('limit[velocity],limit[effort]')) warnings.push('滑块仅预览关节位置，不模拟 velocity / effort 限值。');
    const fixed=result.joints.filter(j=>j.getAttribute('type')==='fixed').length;
    diagnostic('success',`预览已更新 · ${result.links.length} 个连杆，${result.joints.length} 个关节`,result.links.length?`${fixed?fixed+' 个固定关节不生成滑块。':''}修改源码会重建模型；同名同类型关节尽量保留当前姿态。${warnings.join('')}`:'空 robot 是有效的起点，还没有外形。可选择第 1 步查看底座写法，或直接自己编写。');
    if (forceFit || lastLinkCount!==result.links.length || viewRadius>oldRadius*1.3 || viewRadius<oldRadius*.65) fitView();
    lastLinkCount=result.links.length;
  } catch(error) {
    disposeModel(candidate);
    if(version!==previewVersion || input.value!==source)return;
    stale();
    diagnostic('error','还不能更新预览',`${error.message}\n${lastPreviewText===null?'尚未生成模型。':'右侧保留上一次成功的模型，尚未应用当前源码。'}`);
  }
}
function replaceSource(text,note=null) {
  completion?.close();
  previousReplacement={text:input.value,note:$('lesson-note').textContent};
  $('undo-replace').disabled=false;
  input.value=text;input.scrollTop=0;
  if(note)$('lesson-note').textContent=note;
  syncLines();saveDraft();preview(true,true);
}
$('load-lesson').onclick=()=>{ const lesson=lessons[Number($('lesson').value)];replaceSource(lesson.xml,lesson.note); };
$('undo-replace').onclick=()=>{
  if(!previousReplacement)return;
  const prior=previousReplacement;previousReplacement=null;
  input.value=prior.text;$('lesson-note').textContent=prior.note;
  $('undo-replace').disabled=true;syncLines();saveDraft();preview(true,true);
};
$('apply-xml').onclick=()=>preview(true);
$('auto-preview').onchange=()=>{clearTimeout(timer);if($('auto-preview').checked)preview();else stale('自动预览已关闭，修改后请点击预览');};
$('fit-view').onclick=fitView;
$('show-grid').onchange=()=>{grid.visible=$('show-grid').checked;};
$('show-axes').onchange=()=>{worldAxes.visible=$('show-axes').checked;axes.forEach(a=>a.visible=$('show-axes').checked);};
$('zero-joints').onclick=()=>{for(const joint of Object.values(robot.joints||{}))joint.setJointValue(0);jointsUI();};
$('open-xml').onclick=()=>{$('xml-file').value='';$('xml-file').click();};
$('xml-file').onchange=async()=>{
  const file=$('xml-file').files[0];if(!file)return;
  try{replaceSource(await file.text(),'已打开本机文件。可以直接修改 XML；若引用 STL，请在下方导入外形文件。');}
  catch(error){diagnostic('error','无法读取文件',error.message);}
};
$('open-meshes').onclick=()=>{$('mesh-files').value='';$('mesh-files').click();};
$('open-folder').onclick=()=>{$('model-folder').value='';$('model-folder').click();};
async function importAssets(list){
  try{
    diagnostic('pending','正在读取本机 STL…','模型外形直接在浏览器内解析。');
    await assets.importFiles(list);
    await preview(true);
  }catch(error){diagnostic('error','外形文件读取失败',error.message);}
}
$('mesh-files').onchange=()=>importAssets($('mesh-files').files);
$('model-folder').onchange=()=>importAssets($('model-folder').files);
$('save-xml').onclick=()=>{
  const blob=new Blob([input.value],{type:'application/xml;charset=utf-8'});const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download='my_arm.urdf';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  $('draft-state').textContent=input.value===lastPreviewText?'已下载当前 URDF':'已下载当前源码（尚未通过当前预览）';
};
if(location.protocol==='file:')$('workbench-link').hidden=true;
completion=attachCompletion(input,{paths:()=>assets.paths()});
$('show-completion').onclick=()=>{input.focus();completion.show();};
input.value=lessons[0].xml;$('lesson-note').textContent=lessons[0].note;
try{
  const saved=localStorage.getItem(storageKey);
  if(saved){input.value=saved;$('lesson-note').textContent='已恢复这台浏览器上次的草稿。可继续编辑，或选择“0 · 只有 robot 外壳”重新开始；载入示例后也可撤销替换。';}
}catch{/* Local-file storage may be disabled. Download is always available. */}
syncLines();preview(true,true);
