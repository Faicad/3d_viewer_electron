
const subtitle = `
Windows自带的3D查看器
即将结束支持，只剩三天时间了
`;

const image = 'movies/screenshot/3D查看器';

// ─── HyperFrames 动画 ───
// 每段返回 { html, animation? }
//   html:      该段 scene 的 inner HTML
//   animation: GSAP timeline 代码片段（可选），startTime 为当前段起始时间
// imagePath: 已按朝向 _h/_v 选择
export function hyperframes({ imagePath, width, height, duration, fps, index, startTime }) {
  const bg = `<div class="bg" style="position:absolute;inset:0;background:url('${imagePath}') no-repeat center/cover"></div>`
  if (index === 0) {
    return { html: bg }
  }
  return {
    html: bg + `<div id="anno" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);
  color:#ff6b35;font-size:${Math.round(width * 0.04)}px;font-weight:bold;
  font-family:'Microsoft YaHei','PingFang SC',sans-serif;
  text-shadow:0 4px 20px rgba(0,0,0,.95);
  white-space:nowrap;opacity:0">2026年6月30日结束 ⏰</div>`,
    animation: `  tl.to('#anno', {opacity:1,duration:0.8,ease:'power2.out'}, ${(startTime + 0.5).toFixed(3)});\n`,
  }
}