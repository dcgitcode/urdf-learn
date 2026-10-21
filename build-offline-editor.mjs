import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const result=await build({
  absWorkingDir:root,entryPoints:['xml-editor.js'],bundle:true,format:'iife',platform:'browser',target:'es2020',
  minify:true,write:false,legalComments:'inline',charset:'utf8'
});
const [template,css,threeLicense,urdfLicense]=await Promise.all([
  readFile(path.join(root,'xml-editor.html'),'utf8'),readFile(path.join(root,'xml-editor.css'),'utf8'),
  readFile(path.join(root,'node_modules/three/LICENSE'),'utf8'),readFile(path.join(root,'URDF-LOADER-LICENSE.txt'),'utf8')
]);
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const license=`<!-- Bundled dependencies: Three.js and urdf-loader.\n${threeLicense}\n${urdfLicense}\n-->`;
const output=template.replace('<link rel="stylesheet" href="./xml-editor.css">',`<style>${css}</style>`)
  .replace('<script type="module" src="./xml-editor.js"></script>',()=>`${license}\n<script>${script}</script>`);
const destination=path.join(root,'URDF从零搭建-离线版.html');
await writeFile(destination,output,'utf8');
await mkdir(path.join(root,'dist'),{recursive:true});
await writeFile(path.join(root,'dist','URDF从零搭建-离线版.html'),output,'utf8');
console.log(`Offline editor built: ${destination} (${Buffer.byteLength(output)} bytes)`);
