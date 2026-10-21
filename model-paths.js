// 三个网页都位于站点目录下；不要把模型定位到域名根目录。
export const modelBaseURL = new URL('./URDF/', window.location.href).href;
export function modelURL(path) {
  return new URL(path.replace(/^\/?URDF\//, ''), modelBaseURL).href;
}
