
const subtitle = `
Windows自带的3D查看器
即将结束支持
`;

const image = 'movies/screenshot/3D查看器';

const TEXT_CONFIG = {
  h: { top: 20, align: 'left', pad: 22, fontSize: 72 },
  v: { top: 25, align: 'center', pad: 10, fontSize: 72 },
}

function textStyle(config, width, height) {
  const isLandscape = width > height
  const { top, align, pad, fontSize } = config[isLandscape ? 'h' : 'v']
  let pos
  switch (align) {
    case 'left':
      pos = `top:${top}%;left:${pad}%;text-align:left;transform:translate(0,-50%)`
      break
    case 'right':
      pos = `top:${top}%;right:${pad}%;text-align:right;transform:translate(0,-50%)`
      break
    case 'center':
    default:
      pos = `top:${top}%;left:50%;text-align:center;transform:translate(-50%,-50%)`
      break
  }
  return `style="position:absolute;${pos};color:#ff6b35;font-size:${fontSize}px;font-weight:bold;font-family:'Microsoft YaHei','PingFang SC',sans-serif;text-shadow:0 4px 20px rgba(0,0,0,.95);white-space:nowrap;opacity:0"`
}

export function scene({ imagePath, width, height, duration, fps, index, startTime, totalDuration }) {
  const bg = `<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:#d8d8d8 url('${imagePath}') no-repeat center / contain"></div>`;
  const attr = textStyle(TEXT_CONFIG, width, height)

  let html = bg
  let animation = ''

  html += `<div id="anno" ${attr}>2026年6月30日结束 ⏰</div>`
  animation += `  tl.to('#anno', {opacity:1,duration:0.8,ease:'power2.out'}, ${(startTime + 0.5).toFixed(3)});\n`

  // 最后1.5秒：鼠标光标移动到右上角"详细信息"按钮
  if (startTime + duration >= totalDuration - 0.01) {
    const tx = Math.round(width * 0.8) - 6
    const ty = Math.round(height * 0.11) - 4
    const sy = Math.round(height * 0.55)
    const t0 = totalDuration - 1.5

    html += `<div id="mc" style="position:absolute;z-index:99;pointer-events:none;left:${tx}px;top:${sy}px;opacity:0"><svg width="36" height="36" viewBox="0 0 26 30"><polygon points="3,2 3,26 10,20 17,29 21,25 13,18 22,11" fill="#fff" stroke="#222" stroke-width="1.8" stroke-linejoin="round"/></svg></div>`
    animation += `  tl.to('#mc', {opacity:1,duration:0.1}, ${t0.toFixed(3)});\n`
    animation += `  tl.to('#mc', {top:${ty},duration:1.0,ease:'power2.out'}, ${t0.toFixed(3)});\n`
    animation += `  tl.to('#mc', {scale:0.5,duration:0.1,yoyo:true,repeat:1,ease:'power2.out'}, ${(t0 + 1.0).toFixed(3)});\n`
    animation += `  tl.to('#mc', {opacity:0,duration:0.3}, ${(t0 + 1.2).toFixed(3)});\n`
  }

  if (index === 0 && !animation) {
    return { html: bg }
  }
  return { html, animation }
}
