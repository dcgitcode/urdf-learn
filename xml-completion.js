const cursor='\u0001';
const children={robot:['link','joint','material'],link:['visual','collision','inertial'],visual:['origin','geometry','material'],collision:['origin','geometry'],geometry:['box','cylinder','sphere','mesh'],joint:['parent','child','origin','axis','limit','dynamics'],material:['color'],inertial:['origin','mass','inertia']};
const tags={
  robot:['机器人根节点',`robot name="my_arm">\n  ${cursor}\n</robot>`],
  link:['连杆；写入外形',`link name="${cursor}">\n  <visual>\n    <geometry><box size="0.04 0.04 0.18" /></geometry>\n  </visual>\n</link>`],
  joint:['连接父子连杆的关节',`joint name="joint_1" type="revolute">\n  <parent link="base_link" />\n  <child link="${cursor}" />\n  <origin xyz="0 0 0.05" />\n  <axis xyz="0 1 0" />\n  <limit lower="-1.57" upper="1.57" effort="10" velocity="1" />\n</joint>`],
  visual:['外形描述',`visual>\n  ${cursor}\n</visual>`],collision:['碰撞几何（本页不计算碰撞）',`collision>\n  ${cursor}\n</collision>`],
  geometry:['几何体或网格',`geometry>\n  ${cursor}\n</geometry>`],origin:['安装位置 m；姿态 rad',`origin xyz="${cursor}0 0 0" rpy="0 0 0" />`],
  box:['长方体，size 单位 m',`box size="${cursor}0.04 0.04 0.18" />`],cylinder:['圆柱，半径与长度单位 m',`cylinder radius="${cursor}0.05" length="0.05" />`],sphere:['球体，半径单位 m',`sphere radius="${cursor}0.02" />`],mesh:['STL 外形与缩放',`mesh filename="${cursor}" scale="1 1 1" />`],
  parent:['父连杆名称',`parent link="${cursor}" />`],child:['子连杆名称',`child link="${cursor}" />`],axis:['关节局部坐标系中的转动/移动轴',`axis xyz="${cursor}0 1 0" />`],limit:['位置限位；旋转 rad，移动 m',`limit lower="-${cursor}1.57" upper="1.57" effort="10" velocity="1" />`],material:['颜色材质',`material name="color_1">\n  <color rgba="${cursor}0.4 0.6 0.4 1" />\n</material>`],color:['R G B 透明度，四个值为 0～1',`color rgba="${cursor}0.4 0.6 0.4 1" />`],inertial:['质量与惯性（本页不计算动力学）',`inertial>\n  <mass value="${cursor}1" />\n  <inertia ixx="0.01" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01" />\n</inertial>`],mass:['质量 kg',`mass value="${cursor}1" />`],inertia:['惯性矩阵，kg·m²',`inertia ixx="${cursor}0.01" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01" />`],dynamics:['阻尼与摩擦参数',`dynamics damping="${cursor}0.1" friction="0" />`]
};
const attributes={robot:{name:'机器人名称'},link:{name:'唯一的连杆名称'},joint:{name:'唯一的关节名称',type:'关节类型：revolute / continuous / prismatic / fixed'},origin:{xyz:'相对父坐标系的位置，三个值，单位 m',rpy:'绕 X Y Z 的姿态角，三个值，单位 rad'},mesh:{filename:'外形相对路径，例如 meshes/AAA.stl',scale:'三轴缩放，1 1 1 保持原尺寸；毫米模型可用 0.001 0.001 0.001'},box:{size:'X Y Z 三个方向的尺寸，单位 m'},cylinder:{radius:'半径 m',length:'长度 m'},sphere:{radius:'半径 m'},axis:{xyz:'局部轴方向，不能为 0 0 0'},parent:{link:'从已定义的 link 名称中选择'},child:{link:'从已定义的 link 名称中选择'},limit:{lower:'下限：旋转 rad，移动 m',upper:'上限：旋转 rad，移动 m',effort:'最大力/力矩，N 或 N·m',velocity:'最大速度，m/s 或 rad/s'},material:{name:'材质名称'},color:{rgba:'R G B A 四个值，范围 0～1'},mass:{value:'质量 kg'},inertia:{ixx:'kg·m²',ixy:'kg·m²',ixz:'kg·m²',iyy:'kg·m²',iyz:'kg·m²',izz:'kg·m²'},dynamics:{damping:'阻尼系数',friction:'摩擦系数'}};
function stackAt(text) {
  const stack=[];
  for(const match of text.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(\/?)([\w:-]+)\b[^>]*?(\/?)>/g)) {
    if(match[1]) {const i=stack.lastIndexOf(match[2]);if(i>=0)stack.splice(i);}
    else if(!match[3])stack.push(match[2]);
  }
  return stack;
}
export function attachCompletion(input,{paths=()=>[]}={}) {
  const host=input.closest('.code-editor');
  const popup=document.createElement('div');popup.id='xml-completions';popup.className='xml-completions';popup.hidden=true;
  const list=document.createElement('div');list.setAttribute('role','listbox');list.id='xml-completion-list';list.setAttribute('aria-label','XML 补全建议');
  const help=document.createElement('p');help.className='completion-help';popup.append(list,help);host.append(popup);
  input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
  const hint=document.getElementById('xml-context-hint');
  let options=[],active=0,from=0,to=0;
  function close(){popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function position(){
    const css=getComputedStyle(input),lineHeight=parseFloat(css.lineHeight),before=input.value.slice(0,input.selectionStart),lines=before.split('\n');
    const ctx=document.createElement('canvas').getContext('2d');ctx.font=css.font;
    const x=input.offsetLeft+parseFloat(css.paddingLeft)+ctx.measureText(lines.at(-1)).width-input.scrollLeft;
    const y=parseFloat(css.paddingTop)+(lines.length-1)*lineHeight-input.scrollTop+lineHeight;
    const width=Math.min(440,host.clientWidth-12);
    popup.style.width=width+'px';popup.style.left=Math.max(5,Math.min(x,host.clientWidth-width-6))+'px';
    popup.style.top=Math.max(5,Math.min(y,host.clientHeight-230))+'px';
  }
  function select(index){active=(index+options.length)%options.length;[...list.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));help.textContent=options[active].detail+' · ↑↓选择，Enter / Tab 接受，Esc 关闭';input.setAttribute('aria-activedescendant','xml-option-'+active);list.children[active]?.scrollIntoView({block:'nearest'});}
  function accept(){
    const option=options[active];if(!option)return;
    const indent=input.value.slice(0,from).split('\n').at(-1).match(/^\s*/)[0];
    let text=option.insert.replaceAll('\n','\n'+indent);
    const offset=text.indexOf(cursor);text=text.replace(cursor,'');
    input.focus();input.setRangeText(text,from,to,'end');if(offset>=0)input.setSelectionRange(from+offset,from+offset);
    input.dispatchEvent(new Event('input',{bubbles:true}));close();
  }
  function context(force=false){
    const pos=input.selectionStart,before=input.value.slice(0,pos),lastOpen=before.lastIndexOf('<'),lastClose=before.lastIndexOf('>');
    if(lastOpen<lastClose || lastOpen<0){hint.textContent='输入 < 查看可用标签；Ctrl+Space 手动补全。';return null;}
    const fragment=before.slice(lastOpen);
    if(fragment.startsWith('<!--')||fragment.startsWith('<?'))return null;
    const match=fragment.match(/^<(\/?)([\w:-]*)/);if(!match)return null;
    const tag=match[2];
    const value=fragment.match(/([\w:-]+)\s*=\s*["']([^"']*)$/);
    hint.textContent=attributes[tag]?`<${tag}> · `+Object.entries(attributes[tag]).map(([k,v])=>`${k}: ${v}`).join('；'):'输入标签，选择完整写法。';
    if(value){
      const attr=value[1],prefix=value[2];let values=[];
      if(attr==='filename')values=paths();
      else if(attr==='link' && ['parent','child'].includes(tag))values=[...new Set([...input.value.matchAll(/<link\s[^>]*?name\s*=\s*["']([^"']+)/g)].map(m=>m[1]))];
      else if(attr==='type' && tag==='joint')values=['revolute','continuous','prismatic','fixed'];
      else if(attr==='xyz' && tag==='axis')values=['1 0 0','0 1 0','0 0 1'];
      else if(attr==='scale')values=['1 1 1','0.001 0.001 0.001'];
      return {from:pos-prefix.length,options:values.filter(v=>v.toLowerCase().startsWith(prefix.toLowerCase())).map(v=>({label:v,insert:v,detail:attributes[tag]?.[attr]||'属性值'}))};
    }
    if(fragment.length===match[0].length){
      const stack=stackAt(before.slice(0,lastOpen));
      const allowed=match[1]?[...stack].reverse():(children[stack.at(-1)] || (stack.length?[]:['robot']));
      return {from:lastOpen+1+(match[1]?1:0),options:allowed.filter(t=>t.startsWith(tag)).map(t=>({label:match[1]?'/'+t:t,insert:match[1]?t+'>':tags[t][1],detail:tags[t]?.[0]||'闭合标签'}))};
    }
    const word=fragment.match(/([\w:-]*)$/)?.[1]||'';
    const used=new Set([...fragment.matchAll(/([\w:-]+)\s*=/g)].map(m=>m[1]));
    return {from:pos-word.length,options:Object.entries(attributes[tag]||{}).filter(([key])=>!used.has(key)&&key.startsWith(word)).map(([key,detail])=>({label:key,insert:`${key}="${cursor}"`,detail}))};
  }
  function show(force=false){
    if(input.selectionStart!==input.selectionEnd){close();return;}
    const found=context(force);
    if(!found?.options.length){close();return;}
    options=found.options;from=found.from;to=input.selectionStart;active=0;list.replaceChildren();
    options.forEach((option,index)=>{const node=document.createElement('button');node.type='button';node.id='xml-option-'+index;node.setAttribute('role','option');node.textContent=option.label;node.onmousedown=e=>e.preventDefault();node.onclick=()=>{active=index;accept();};list.append(node);});
    popup.hidden=false;input.setAttribute('aria-expanded','true');position();select(0);
  }
  input.addEventListener('input',event=>{if(!event.isComposing)show();});
  input.addEventListener('click',()=>{context();close();});
  input.addEventListener('scroll',close);
  input.addEventListener('blur',close);
  input.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();show(true);return;}
    if(!popup.hidden && ['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(event.key) && !event.ctrlKey && !event.metaKey){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape')close();else if(event.key==='ArrowDown')select(active+1);else if(event.key==='ArrowUp')select(active-1);else accept();return;}
    if(event.key==='>' && !event.ctrlKey && !event.metaKey){
      const before=input.value.slice(0,input.selectionStart),open=before.match(/<([\w:-]+)(?:\s[^<>]*)?$/);
      if(open && !before.endsWith('/') && !input.value.slice(input.selectionStart).trimStart().startsWith(`</${open[1]}>`)){
        event.preventDefault();event.stopImmediatePropagation();const at=input.selectionStart;input.setRangeText(`></${open[1]}>`,at,input.selectionEnd,'end');input.setSelectionRange(at+1,at+1);input.dispatchEvent(new Event('input',{bubbles:true}));close();
      }
    }
  },true);
  return {close,refresh:()=>{context();},show:()=>show(true)};
}
