
const subtitle = `
你知道吗，只剩三天时间
`;

const image = 'movies/screenshot/win';

const CLICK_TARGET = {
  h: { x: 1170, y: 599 },
  v: { x: 700, y: 765 },
}

export function scene({ imagePath, width, height, duration, fps, index, startTime, totalDuration }) {
  const bg = `<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:#d8d8d8 url('${imagePath}') no-repeat center / contain"></div>`;
  const isLandscape = width > height

  let html = bg
  let animation = ''

  if (startTime + duration >= totalDuration - 0.01) {
    const target = CLICK_TARGET[isLandscape ? 'h' : 'v']
    const tx = target.x - 6
    const ty = target.y - 4
    const sy = Math.round(height * 0.85)
    const t0 = totalDuration - 1.5

    html += `<div id="mc" style="position:absolute;z-index:99;pointer-events:none;left:${tx}px;top:${sy}px;opacity:0"><svg width="36" height="36" viewBox="0 0 26 30"><polygon points="3,2 3,26 10,20 17,29 21,25 13,18 22,11" fill="#fff" stroke="#222" stroke-width="1.8" stroke-linejoin="round"/></svg></div>`
    animation += `  tl.to('#mc', {opacity:1,duration:0.1}, ${t0.toFixed(3)});\n`
    animation += `  tl.to('#mc', {top:${ty},duration:1.0,ease:'power2.out'}, ${t0.toFixed(3)});\n`
    animation += `  tl.to('#mc', {scale:0.5,duration:0.1,yoyo:true,repeat:1,ease:'power2.out'}, ${(t0 + 1.0).toFixed(3)});\n`
    animation += `  tl.to('#mc', {opacity:0,duration:0.3}, ${(t0 + 1.2).toFixed(3)});\n`
  }

  return { html, animation }
}
