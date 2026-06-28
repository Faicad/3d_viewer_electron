
// TTS 生成的字幕时间轴（供参考）:
//   [0] 0.5 — 3.6   海外用户直接Github获取      窗口 3.1s
//   [1] 3.75 — 6.72  国内用户前往Gitcode下载     窗口 2.97s
//   [2] 6.87 — 9.92  文件名带cn的是中文版       窗口 3.05s
//   [3] 10.07 — 12.47 建议你赶紧收藏自取！       窗口 2.4s
// triggerAt 均为相对当前台词行开始的偏移秒数

const subtitle = `
海外用户直接Github获取
国内用户前往Gitcode下载\n((gitcode.com/Faicad))
文件名带cn的是中文版，建议你下载试用\n((gitcode.com/Faicad))
求关注、求转发、求收藏
`;

const urls = [
  {
    url: 'https://github.com/faicad/3d_viewer_electron/',
    description: '首句台词1秒后高亮显示右侧Releases区域，加一个文字标注"这里下载"',
    anim: [
      {
        type: 'highlight-area',
        selector: 'Releases sidebar',
        triggerAt: 1.0,          // 台词开始1秒后
        highlightMs: 2100,       // end = 1.0+2.1=3.1 ≤ 窗口3.1
        padding: 60,
      },
      {
        type: 'text-annotation',
        target: 'Releases sidebar',
        text: '这里下载',
        triggerAt: 1.0,
        duration: 2.1,
        position: 'center',
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
        triggerAt: 1.97,         // 结束前1秒 = (6.72-3.75)-1.0 = 1.97
        highlightMs: 1000,       // end = 1.97+1.0=2.97 ≤ 窗口2.97
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
        triggerAt: 1.0,          // 台词开始1秒后
        highlightMs: 2050,       // end = 1.0+2.05=3.05 ≤ 窗口3.05
        padding: 10,
      },
    ],
  },
  {
    url: '',
    description: 'url不变，延续画面内容。居中显示字幕动画"求关注、求转发、求收藏"，分三段显示出来。不消失',
    anim: [
      // 一行文字，分三段依次显示
      {
        type: 'caption',
        text: '求关注、求转发、求收藏',
        triggerAt: 0,            // 台词开始时
        duration: 2.4,           // 分段显示耗时
        top: { h: 46, v: 50 },
        fontSize: { h: 68, v: 68 },
        color: '#ff6b35',
        align: { h: 'center', v: 'center' },
        pad: { h: 5, v: 8 },
      },
    ],
  },
];
