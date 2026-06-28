
const subtitle = `
windows推荐的替代品(babylon.js sandbox)
只是一个网页版
无法查看3D打印模型文件(3mf)
`;

const image = 'movies/screenshot/babylon';

const TEXT_CONFIG = {
  h: { top: 47, align: 'center', pad: 10, fontSize: 62 },
  v: { top: 47, align: 'center', pad: 10, fontSize: 72 },
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

  if (index === 1) {
    html += `<div id="anno" ${attr.replace('opacity:0', '')}><span id="p1" style="opacity:0">网页版</span><span id="p2" style="opacity:0"> 不支持3MF</span></div>`
    animation += `  tl.to('#p1', {opacity:1,duration:0.8,ease:'power2.out'}, ${(startTime + 0.5).toFixed(3)});\n`
  }

  if (index === 2) {
    html += `<div id="anno" ${attr.replace('opacity:0', '')}><span id="p1" style="opacity:1">网页版</span><span id="p2" style="opacity:0"> 不支持3MF</span></div>`
    animation += `  tl.to('#p2', {opacity:1,duration:0.8,ease:'power2.out'}, ${(startTime + 0.5).toFixed(3)});\n`
  }

  if (index === 0 && !animation) {
    return { html: bg }
  }
  return { html, animation }
}

