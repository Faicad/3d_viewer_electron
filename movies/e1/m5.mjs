
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
        triggerAt: 1.5,
        highlightMs: 2100,
        padding: 60,
      },
      {
        type: 'text-annotation',
        target: 'Releases sidebar',
        text: '这里下载',
        triggerAt: 1.5,
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
        triggerAt: 5.72,
        highlightMs: 1000,
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
        triggerAt: 7.87,
        highlightMs: 2050,
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
        triggerAt: 10.07,
        duration: 2.4,
        top: 38,
      },
      {
        type: 'text-overlay',
        text: '求转发',
        triggerAt: 10.87,
        duration: 1.6,
        top: 50,
      },
      {
        type: 'text-overlay',
        text: '求收藏',
        triggerAt: 11.67,
        duration: 0.8,
        top: 62,
      },
    ],
  },
];
