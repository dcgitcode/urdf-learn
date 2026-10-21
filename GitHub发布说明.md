# GitHub Pages 发布

目标仓库：https://github.com/dcgitcode/urdf-learn

## 首次开启

1. 将本项目源码提交到仓库 main 分支。不要上传 node_modules、dist 或私人文件。
2. 打开仓库 Settings → Pages，在 Build and deployment 的 Source 选择 GitHub Actions。
3. 打开 Actions → Publish teaching website，查看自动发布结果；必要时点击 Run workflow 重跑。
4. 等构建、部署均成功后，从部署结果打开网站。

预期入口（只有部署成功后才能访问）：

- XML 从零搭建：https://dcgitcode.github.io/urdf-learn/xml-editor.html
- 完整 URDF 工作台：https://dcgitcode.github.io/urdf-learn/lab.html
- 原控制台：https://dcgitcode.github.io/urdf-learn/

后续提交到 main 会自动更新网页。学生不需要 Node.js；Node.js 只在 GitHub 自动构建时使用。

## 模型与保存

项目自带的 public/URDF/meshes 会一起部署。XML 可使用 meshes/AAA.stl，不需要修改为服务器绝对路径。
学生自己的模型通过“选择模型文件夹”读取，不会上传到 GitHub。编辑草稿留在当前浏览器，下载 URDF 才能另存文件；不自动提交作业，也不跨设备同步。

本项目提供结构与关节运动可视化，不是重力、碰撞、接触等物理仿真。离线版不嵌入 STL，离线时需手动选择模型目录。

## 本地验证

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run preview
```

Pages 工作流只发布 dist 中的构建结果，不会把开发依赖上传到网页。
