import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { modelURL } from './model-paths.js';

export const projectMeshes=['AAA','BBB','CCC','CCC2','DDD','EEE','FFF'].map(name=>`meshes/${name}.stl`);
const normalize=path=>decodeURIComponent(path).replaceAll('\\','/').replace(/^package:\/\/[^/]+\//,'').replace(/^\.\//,'').replace(/^\/+/, '');
export function createMeshAssets(onChange=()=>{}) {
  const files=new Map(), pending=new Map();
  let version=0;
  function find(path) {
    const key=normalize(path);
    const basename=key.split('/').at(-1);
    for(const source of ['本机文件夹','项目目录']) {
      const entries=[...files].filter(([,file])=>file.source===source);
      const exact=entries.find(([p])=>p===key);if(exact)return exact[1];
      const suffix=entries.filter(([p])=>p.endsWith('/'+key)||key.endsWith('/'+p));
      if(suffix.length===1)return suffix[0][1];
      const sameName=entries.filter(([p])=>p.split('/').at(-1)===basename);
      if(sameName.length===1)return sameName[0][1];
      if(sameName.length>1)throw new Error(`存在多个 ${basename}，请在 filename 中写出匹配的文件夹相对路径。`);
    }
    return null;
  }
  function parse(buffer,path) {
    try {
      const bytes=new Uint8Array(buffer);
      const ascii=new TextDecoder().decode(bytes.subarray(0,Math.min(512,bytes.length)));
      const binary=bytes.length>=84 && 84+new DataView(buffer).getUint32(80,true)*50===bytes.length;
      if(!binary && !/^\s*solid\b/i.test(ascii))throw new Error('文件不是 STL 数据（可能返回了网页或错误页面）');
      const geometry=new STLLoader().parse(buffer);
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const box=geometry.boundingBox;
      if(!geometry.getAttribute('position')?.count || box.isEmpty() || ![...box.min,...box.max].every(Number.isFinite)) {geometry.dispose();throw new Error('网格为空或坐标无效');}
      return geometry;
    } catch(error) {throw new Error(`无法解析 ${path}：${error.message}`);}
  }
  function store(path,geometry,source) {
    const key=normalize(path);
    files.get(key)?.geometry.dispose();files.set(key,{geometry,source,path:key});
    version++;onChange(summary());
  }
  function summary(){return {count:files.size,version,paths:[...files.keys()],sources:[...new Set([...files.values()].map(f=>f.source))]};}
  async function load(path) {
    if(find(path))return;
    if(location.protocol==='file:')throw new Error(`未找到 ${path}。离线页面不能直接读取相邻磁盘文件；请点击“选择模型文件夹”，选择包含 URDF 和 meshes 的目录。`);
    const logical=normalize(path);
    if(pending.has(logical))return pending.get(logical);
    const task=(async()=>{
      const url=/^https?:\/\//i.test(path)?new URL(path):new URL(modelURL(logical));
      if(url.origin!==location.origin)throw new Error('外部地址的 STL 请先下载到本机，然后选择模型文件夹导入。');
      const response=await fetch(url);
      if(!response.ok)throw new Error(`未找到 ${path}（HTTP ${response.status}）。项目路径以 public/URDF 为起点；也可以选择模型文件夹。`);
      store(logical,parse(await response.arrayBuffer(),path),'项目目录');
    })();
    pending.set(logical,task);
    try{await task;}finally{pending.delete(logical);}
  }
  async function prepare(doc) {
    const paths=[...new Set([...doc.querySelectorAll('visual mesh')].map(m=>m.getAttribute('filename')))];
    await Promise.all(paths.map(load));
  }
  async function importFiles(list) {
    const stls=[...list].filter(f=>/\.stl$/i.test(f.name));
    if(!stls.length)throw new Error('所选目录中没有 STL 文件。请选择包含 meshes 的模型文件夹。');
    for(const file of stls) {
      const relative=file.webkitRelativePath || file.name;
      const path=file.webkitRelativePath?relative.split('/').slice(1).join('/'):relative;
      store(path,parse(await file.arrayBuffer(),file.name),'本机文件夹');
    }
    return summary();
  }
  function get(path){const file=find(path);if(!file)throw new Error(`尚未加载 ${path}`);return file.geometry;}
  function paths(){return [...new Set([...files.keys(),...(location.protocol==='file:'?[]:projectMeshes)])];}
  return {prepare,importFiles,get,paths,summary};
}
