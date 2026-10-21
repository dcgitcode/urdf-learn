const base = `  <!-- 底座：圆柱的中心上移半个高度，让底面落在 Z=0 -->
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0.025" rpy="0 0 0" />
      <geometry><cylinder radius="0.06" length="0.05" /></geometry>
      <material name="base_green"><color rgba="0.32 0.48 0.38 1" /></material>
    </visual>
  </link>`;
const upper = `  <!-- 大臂：长 0.18 m，外形中心在本连杆 Z=0.09 -->
  <link name="upper_arm">
    <visual>
      <origin xyz="0 0 0.09" />
      <geometry><box size="0.04 0.04 0.18" /></geometry>
      <material name="arm_green"><color rgba="0.48 0.65 0.49 1" /></material>
    </visual>
  </link>

  <!-- 肩关节装在底座顶部，绕自己的 Y 轴转动 -->
  <joint name="shoulder" type="revolute">
    <parent link="base_link" />
    <child link="upper_arm" />
    <origin xyz="0 0 0.05" rpy="0 0 0" />
    <axis xyz="0 1 0" />
    <limit lower="-1.57" upper="1.57" effort="10" velocity="1" />
  </joint>`;
const forearm = `  <link name="forearm">
    <visual>
      <origin xyz="0 0 0.075" />
      <geometry><box size="0.032 0.032 0.15" /></geometry>
      <material name="forearm_amber"><color rgba="0.77 0.51 0.24 1" /></material>
    </visual>
  </link>

  <!-- 小臂接在大臂末端；这里的坐标相对 upper_arm -->
  <joint name="elbow" type="revolute">
    <parent link="upper_arm" />
    <child link="forearm" />
    <origin xyz="0 0 0.18" />
    <axis xyz="0 1 0" />
    <limit lower="-1.57" upper="1.57" effort="10" velocity="1" />
  </joint>`;
const tool = `  <link name="tool_tip">
    <visual>
      <geometry><sphere radius="0.018" /></geometry>
      <material name="tool_red"><color rgba="0.77 0.29 0.2 1" /></material>
    </visual>
  </link>

  <joint name="tool_mount" type="fixed">
    <parent link="forearm" />
    <child link="tool_tip" />
    <origin xyz="0 0 0.15" />
  </joint>`;
const wrap = parts => `<?xml version="1.0" encoding="utf-8"?>
<robot name="my_arm">
${parts.join('\n\n')}
</robot>\n`;
export const lessons = [
  { xml:wrap([]), note:'robot 只是最外层容器，本身没有外形。先在其中写一个 link，再用 visual / geometry 描述底座。只有空 robot 时，预览区为空是正常的。' },
  { xml:wrap([base]), note:'试改 cylinder 的 radius 或 length。visual/origin 只改变圆柱外形在这个连杆中的位置；长度变了，可以把 Z 调成长度的一半，让底面仍在地面上。' },
  { xml:wrap([base,upper]), note:'拖动 shoulder 滑块，让大臂绕 Y 轴运动。修改 joint/origin 的 Z，会改变大臂的安装高度；修改 visual/origin，则只移动大臂外形。' },
  { xml:wrap([base,upper,forearm]), note:'先只动 shoulder，再只动 elbow：父关节会带动后面的整条链。把 elbow 的 axis 从 0 1 0 改成 1 0 0，比较小臂的转动方向。' },
  { xml:wrap([base,upper,forearm,tool]), note:'tool_mount 是 fixed 关节，所以没有滑块。红色小球会随前面两个关节运动；它表示一个示意工具端，不是经过标定的夹持中心。' }
];
