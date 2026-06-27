
const subtitle = `
只剩三天时间
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

export function hyperframes({ imagePath, width, height, duration, fps, index, startTime }) {
  const bg = `<div style="position:absolute;inset:0;background:#d8d8d8 url('${imagePath}') no-repeat center/contain"></div>`;
  const attr = textStyle(TEXT_CONFIG, width, height)
  if (index === 0) {
    return { html: bg }
  }
  return {
    html: bg + `<div id="anno" ${attr}>2026年6月30日结束 ⏰</div>`,
    animation: `  tl.to('#anno', {opacity:1,duration:0.8,ease:'power2.out'}, ${(startTime + 0.5).toFixed(3)});\n`,
  }
}
