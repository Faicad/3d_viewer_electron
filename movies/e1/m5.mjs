
// TTS 生成的字幕时间轴（供参考）:
//   [0] 0.5 — 3.6   海外用户直接Github获取      窗口 3.1s
//   [1] 3.75 — 6.72  国内用户前往Gitcode下载     窗口 2.97s
//   [2] 6.87 — 9.92  文件名带cn的是中文版       窗口 3.05s
//   [3] 10.07 — 12.47 建议你赶紧收藏自取！       窗口 2.4s
// triggerAt 均为相对当前台词行开始的偏移秒数，html-composer 自动加 entries[i].s 换算绝对时间

const subtitle = `
海外用户直接Github获取
国内用户前往Gitcode下载
文件名带cn的是中文版
建议你赶紧收藏自取！
`;


const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
    anim: [
      {
        type: 'highlight-area',
        selector: 'Releases sidebar',
        triggerAt: 1.0,          // 台词开始1秒后（绝对 0.5+1.0=1.5）
        highlightMs: 2100,       // 持续到 1.0+2.1=3.1 ≤ 窗口3.1
        padding: 60,
      },
      {
        type: 'text-annotation',
        target: 'Releases sidebar',
        text: '这里下载',
        triggerAt: 1.0,
        duration: 2.1,
        position: 'top-right',
      },
    ],
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron',
    description: '结束前1秒点击"查看全部发行版"',
    anim: [
      {
        type: 'click-highlight',
        selector: 'All releases',
        triggerAt: 1.97,         // 结束前1秒 = (6.72-3.75)-1.0 = 1.97（绝对 3.75+1.97=5.72）
        highlightMs: 1000,       // 持续到 1.97+1.0=2.97 ≤ 窗口2.97
        ripple: true,
      },
    ],
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: '本页面显示1秒后，高亮"3D_Viewer_1.7.2_x64_cn_Setup.exe"下载链接',
    anim: [
      {
        type: 'highlight-area',
        selector: '3D_Viewer_1.7.2_x64_cn_Setup.exe',
        triggerAt: 1.0,          // 台词开始1秒后（绝对 6.87+1.0=7.87）
        highlightMs: 2050,       // 持续到 1.0+2.05=3.05 ≤ 窗口3.05
        padding: 10,
      },
    ],
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: 'url不变，延续画面内容。居中显示字幕动画"求关注、求转发、求收藏"，分三段显示出来',
    anim: [
      {
        type: 'text-overlay',
        text: '求关注',
        triggerAt: 0,            // 台词开始时（绝对 10.07+0=10.07）
        duration: 2.4,           // 持续到 0+2.4=2.4 ≤ 窗口2.4
        top: 38,
      },
      {
        type: 'text-overlay',
        text: '求转发',
        triggerAt: 0.8,          // 上一个动画结束后（绝对 10.07+0.8=10.87）
        duration: 1.6,           // 持续到 0.8+1.6=2.4
        top: 50,
      },
      {
        type: 'text-overlay',
        text: '求收藏',
        triggerAt: 1.6,          // 上一个动画结束后（绝对 10.07+1.6=11.67）
        duration: 0.8,           // 持续到 1.6+0.8=2.4
        top: 62,
      },
    ],
  },
];
