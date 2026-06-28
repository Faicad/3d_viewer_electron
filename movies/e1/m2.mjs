
const subtitle = `
也许还有拓竹的程序(Bambu Studio)可用
但是打开一个文件总是要等十多秒
有时甚至是几十秒
`;

const image = 'movies/screenshot/Downloads';

let _seg1StartTime = 0

const TEXT_CONFIG = {
  h: { top: 66, align: 'center', pad: 10, fontSize: 60 },
  v: { top: 66, align: 'center', pad: 10, fontSize: 56 },
};

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
  const attr = textStyle(TEXT_CONFIG, width, height)
  let html = ''
  let animation = ''

  if (index === 0) {
    // 第一秒 bg_0 -> 立刻切为 bg_1 (0.3秒) -> 1.3s 立刻切为 bg_2
    html = `<div id="i0" style="position:absolute;inset:0;background:#d8d8d8 url('bg_0.png') no-repeat center / contain"></div>`
    html += `<div id="i1" style="position:absolute;inset:0;background:#d8d8d8 url('bg_1.png') no-repeat center / contain;opacity:0"></div>`
    html += `<div id="i2" style="position:absolute;inset:0;background:#d8d8d8 url('bg_2.png') no-repeat center / contain;opacity:0"></div>`
    const t = startTime
    animation += `  tl.set('#i0', {opacity:0}, ${(t + 1.0).toFixed(3)});\n`
    animation += `  tl.set('#i1', {opacity:1}, ${(t + 1.0).toFixed(3)});\n`
    animation += `  tl.set('#i1', {opacity:0}, ${(t + 1.3).toFixed(3)});\n`
    animation += `  tl.set('#i2', {opacity:1}, ${(t + 1.3).toFixed(3)});\n`
  }

  if (index === 1) {
    _seg1StartTime = startTime
    const dotBase = startTime + 2.0
    const dotInterval = (totalDuration - 0.5 - dotBase) / 5

    let dotsHtml = ''
    for (let i = 0; i < 6; i++) {
      dotsHtml += `<span id="d1_${i}" style="opacity:0">.</span>`
      animation += `  tl.to('#d1_${i}', {opacity:1,duration:0.05}, ${(dotBase + i * dotInterval).toFixed(3)});\n`
    }

    html = `<div style="position:absolute;inset:0;background:#d8d8d8 url('bg_2.png') no-repeat center / contain"></div>`
    html += `<div id="anno1" ${attr}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;等待漫长的启动${dotsHtml}</div>`
    animation += `  tl.to('#anno1', {opacity:1,duration:0.3,ease:'power2.out'}, ${(startTime + 2.0).toFixed(3)});\n`
  }

  if (index === 2) {
    const dotBase = _seg1StartTime + 2.0
    const dotInterval = (totalDuration - 0.5 - dotBase) / 5
    const seg2Start = startTime

    let dotsHtml = ''
    let dotsAnim = ''
    for (let i = 0; i < 6; i++) {
      const dotTime = dotBase + i * dotInterval
      if (dotTime <= seg2Start) {
        dotsHtml += `<span style="opacity:1">.</span>`
      } else {
        dotsHtml += `<span id="d2_${i}" style="opacity:0">.</span>`
        dotsAnim += `  tl.to('#d2_${i}', {opacity:1,duration:0.05}, ${dotTime.toFixed(3)});\n`
      }
    }

    html = `<div style="position:absolute;inset:0;background:#d8d8d8 url('bg_2.png') no-repeat center / contain"></div>`
    html += `<div ${attr.replace('opacity:0', 'opacity:1')}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;等待漫长的启动${dotsHtml}</div>`
    animation += dotsAnim
  }

  return { html, animation }
}
