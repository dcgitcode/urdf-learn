# 机械臂仿真控制台

浏览器端六轴机械臂仿真与真机控制平台。加载 URDF 模型在三维场景中显示机械臂，用键盘驱动关节运动；接入串口后，同一套按键可同时驱动虚拟机械臂与真实舵机。

配套课程：《具身智能技术应用》第 3 章 机器人建模与机械臂任务。

## 功能

- URDF 模型可视化：解析 `public/URDF/*.urdf`，用 three.js 渲染连杆与关节
- 键盘分轴控制：六个关节各对应一对按键，可单步微调
- 速度调节：0.1–1.0 滑块，控制每帧关节增量
- 关节限位保护：超出 URDF 定义的 `limit` 时拒绝运动并在页面顶部提示
- 真机联动控制：通过 Web Serial API 连接 Feetech SCS 舵机，虚拟与真实机械臂同步运动
- 舵机状态面板：逐轴显示 idle / pending / success / warning / error，并给出错误码含义
- 故障回退：真机通信失败时自动回到上一个安全位置，虚拟关节不跟随错误动作

## 环境要求

- Node.js 18 以上
- Chrome 或 Edge 浏览器（真机控制依赖 Web Serial API，Firefox、Safari 不支持）

## 运行

```bash
npm install     # 首次运行，安装依赖
npm run dev     # 启动开发服务器，默认 http://localhost:5173
```

构建静态站点：

```bash
npm run build   # 产物输出到 dist/
npm run preview # 本地预览构建结果
```

## 键盘映射

| 关节 | 索引 | 正转 | 反转 | URDF 关节名 |
|---|---|---|---|---|
| 腰部旋转 | 0 | 1 | Q | Rotation |
| 大臂 | 1 | 2 | W | Rotation2 |
| 小臂 | 2 | 3 | E | Rotation3 |
| 腕部俯仰 | 3 | 4 | R | Rotation4 |
| 腕部旋转 | 4 | 5 | T | Rotation5 |
| 夹爪 | 5 | 6 | Y | Rotation6 |

按键可长按连续运动；速度滑块决定每次增量的角度（度）。

## 连接真实机械臂

1. 用 USB 转串口模块把机械臂舵机总线接到电脑
2. 在受支持的浏览器中打开页面，点击「连接真实机械臂」
3. 在弹出的串口选择框中选择对应端口
4. 连接成功后，键盘控制将同时驱动虚拟模型与真实舵机

连接参数固定，不在界面上开放修改：

| 参数 | 取值 |
|---|---|
| 波特率 | 1000000 |
| 协议 | SCS (1) |
| 舵机 ID | 1–6，与关节序号一一对应 |
| 位置分辨率 | 0–4095（约 4096 步对应一圈） |

连接建立时会依次使能扭矩、设置加速度为 10、速度为 300，并读取各舵机当前位置作为初始基准。此后的键盘操作按**相对位移**下发，因此无论机械臂上电时处于什么姿态都能正常响应。

## 目录结构

```
.
├── index.html          页面结构与样式，含控制面板
├── index.js            three.js 场景、光照、URDF 加载
├── robotControls.js    键盘控制、串口通信、舵机状态管理
├── robotConfig.js      机器人参数与按键映射配置
├── public/URDF/
│   ├── so_arm100.urdf      六轴机械臂 URDF 描述
│   └── meshes/             各连杆的 STL 网格文件
├── feetech/
│   ├── scsservo_sdk.mjs        Web Serial 版舵机通信库
│   ├── scsservo_constants.mjs  寄存器地址与错误码常量
│   └── pysdk/                  Python 版舵机 SDK
└── node_modules/       已安装的依赖（three.js、vite 等），随工程一起分发，无需重新安装
```

## 通信要点

舵机数据按小端序传输，读写位置时需对低 16 位做字节交换，`robotControls.js` 中的 `readServoPosition` 与 `writeServoPosition` 已处理该细节。所有串口操作进入队列串行执行，避免并发访问导致通信错乱。

## 说明

URDF 模型基于开源硬件项目 SO-ARM100 的简化版本，仅保留六自由度运动学描述与外观网格。
