// Deliberately scoped teaching validator, not a complete URDF/Xacro validator.
export function validateXML(text) {
  if (!text.trim()) throw new Error('源码还是空的。先写 <robot name="my_arm"> 和 </robot>。');
  if (/<!DOCTYPE/i.test(text)) throw new Error('请使用普通 URDF XML；这个入门编辑器不处理 DOCTYPE。');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('XML 标签或属性尚未写完整。\n' + parserError.textContent.replace(/Below is a rendering[\s\S]*/i, '').trim().slice(0, 420));
  const root = doc.documentElement;
  if (root.tagName !== 'robot') throw new Error('最外层必须是 <robot name="…">，不能是单独的 link 或 joint。');
  if (!root.getAttribute('name')?.trim()) throw new Error('请给 robot 填写 name，例如 <robot name="my_arm">。');
  if ([...doc.querySelectorAll('*')].some(n => n.tagName.startsWith('xacro:'))) throw new Error('这里读取普通 URDF；Xacro 宏需要先展开，或先直接编写 link 与 joint。');
  for (const child of root.children) {
    if (!['link','joint','material','transmission','gazebo','ros2_control'].includes(child.tagName)) throw new Error(`robot 中不认识 <${child.tagName}>。检查 link、joint、material 标签是否拼写正确。`);
  }
  const links = [...root.children].filter(n => n.tagName === 'link');
  const joints = [...root.children].filter(n => n.tagName === 'joint');
  function unique(nodes, kind) {
    const seen = new Set();
    for (const node of nodes) {
      const name = node.getAttribute('name')?.trim();
      if (!name) throw new Error(`${kind} 缺少 name 属性。`);
      if (seen.has(name)) throw new Error(`${kind} 名称 ${name} 重复了，请给每个部件或关节使用不同名称。`);
      seen.add(name);
    }
    return seen;
  }
  const linkNames = unique(links, 'link');
  for (const link of links) {
    for (const child of link.children) if(!['visual','collision','inertial'].includes(child.tagName)) throw new Error(`link ${link.getAttribute('name')} 中不认识 <${child.tagName}>。外形应使用 visual / geometry。`);
  }
  unique(joints, 'joint');
  const tuple = (value, length, description, positive = false) => {
    const values = (value || '').trim().split(/\s+/).map(Number);
    if (!value?.trim() || values.length !== length || values.some(v => !Number.isFinite(v) || (positive && v <= 0))) throw new Error(`${description} 需要 ${length} 个${positive ? '大于零的' : '有效'}数值，用空格分隔。`);
    return values;
  };
  for (const origin of doc.querySelectorAll('origin')) {
    if (origin.hasAttribute('xyz')) tuple(origin.getAttribute('xyz'), 3, 'origin xyz');
    if (origin.hasAttribute('rpy')) tuple(origin.getAttribute('rpy'), 3, 'origin rpy');
  }
  for (const visual of doc.querySelectorAll('visual')) {
    const shapes = [...(visual.querySelector(':scope > geometry')?.children || [])];
    if (shapes.length !== 1) throw new Error('每个 visual 需要一个 geometry，里面放一个 box、cylinder、sphere 或 mesh。');
    if (visual.querySelector('geometry > origin')) throw new Error('origin 应放在 visual 下面，与 geometry 并列，不能放进 geometry 里。');
    const shape = shapes[0];
    if (shape.tagName === 'box') tuple(shape.getAttribute('size'), 3, 'box size', true);
    else if (shape.tagName === 'cylinder') {
      tuple(shape.getAttribute('radius'), 1, 'cylinder radius', true);
      tuple(shape.getAttribute('length'), 1, 'cylinder length', true);
    } else if (shape.tagName === 'sphere') tuple(shape.getAttribute('radius'), 1, 'sphere radius', true);
    else if (shape.tagName === 'mesh') {
      if (!/\.stl$/i.test(shape.getAttribute('filename') || '')) throw new Error('外形文件目前支持 STL。入门时建议先使用 box / cylinder / sphere。');
      if (shape.hasAttribute('scale')) tuple(shape.getAttribute('scale'), 3, 'mesh scale', true);
    } else throw new Error(`暂不支持 geometry 中的 ${shape.tagName}；请先使用 box、cylinder、sphere 或 STL mesh。`);
  }
  if (doc.querySelector('texture')) throw new Error('这个离线入门版先使用 color rgba 颜色材质，不加载 texture 纹理图片。');
  for (const color of doc.querySelectorAll('color')) {
    const rgba = tuple(color.getAttribute('rgba'), 4, 'color rgba');
    if (rgba.some(v => v < 0 || v > 1)) throw new Error('color rgba 的四个值都应在 0～1 之间。');
  }
  const parents = new Map();
  const children = new Map(links.map(n => [n.getAttribute('name'), []]));
  for (const joint of joints) {
    const name = joint.getAttribute('name');
    const type = joint.getAttribute('type');
    if (!['fixed', 'revolute', 'continuous', 'prismatic'].includes(type)) throw new Error(`关节 ${name} 的 type 应为 fixed、revolute、continuous 或 prismatic；当前入门版不支持其他类型。`);
    if (joint.querySelector('mimic')) throw new Error(`关节 ${name} 使用了 mimic；当前入门版请先使用独立关节。`);
    const parent = joint.querySelector(':scope > parent')?.getAttribute('link');
    const child = joint.querySelector(':scope > child')?.getAttribute('link');
    if (!parent || !linkNames.has(parent)) throw new Error(`关节 ${name} 的 parent="${parent || ''}" 没有对应 link；检查名称是否一致。`);
    if (!child || !linkNames.has(child)) throw new Error(`关节 ${name} 的 child="${child || ''}" 没有对应 link；先定义这个连杆。`);
    if (parent === child) throw new Error(`关节 ${name} 的 parent 和 child 不能是同一个连杆。`);
    if (parents.has(child)) throw new Error(`连杆 ${child} 被连接到两个父关节。URDF 中一个子连杆只能有一个父关节。`);
    parents.set(child, parent); children.get(parent).push(child);
    if (type !== 'fixed') {
      const axis = joint.querySelector(':scope > axis');
      if (axis) {
        const vector = tuple(axis.getAttribute('xyz'), 3, `${name} 的 axis xyz`);
        if (Math.hypot(...vector) < 1e-10) throw new Error(`${name} 的转轴不能是 0 0 0。`);
      }
      if (['revolute', 'prismatic'].includes(type)) {
        const limit = joint.querySelector(':scope > limit');
        if (!limit?.hasAttribute('lower') || !limit?.hasAttribute('upper')) throw new Error(`关节 ${name} 需要 limit lower 和 upper。旋转关节用 rad，移动关节用 m。`);
        const lower = tuple(limit.getAttribute('lower'), 1, `${name} 的 lower`)[0];
        const upper = tuple(limit.getAttribute('upper'), 1, `${name} 的 upper`)[0];
        if (lower > upper) throw new Error(`${name} 的 lower 不能大于 upper。`);
      }
    }
  }
  const roots = links.filter(n => !parents.has(n.getAttribute('name')));
  if (links.length && roots.length !== 1) throw new Error(roots.length > 1 ? `有 ${roots.length} 个尚未连在一起的根连杆：${roots.map(n => n.getAttribute('name')).join('、')}。新增 link 后，再写一个 joint 将它连接起来。` : '关节连接形成了环，没有独立的根连杆。检查 parent / child。');
  if (links.length) {
    const visited = new Set(), queue = [roots[0].getAttribute('name')];
    while (queue.length) {
      const name = queue.shift();
      if (visited.has(name)) throw new Error('连接链中出现环，请检查 parent / child。');
      visited.add(name); queue.push(...children.get(name));
    }
    if (visited.size !== links.length) throw new Error('有连杆没有连接到根连杆，或局部连接形成了环。检查 parent / child。');
  }
  return { doc, links, joints };
}
