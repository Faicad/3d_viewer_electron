
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
        triggerAt: 4.6,
        highlightMs: 2500,
        padding: 60,
      },
      {
        type: 'text-annotation',
        target: 'Releases sidebar',
        text: '这里下载',
        triggerAt: 4.6,
        duration: 2.5,
        position: 'top-right',
      },
    ],
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron',
    description: '第二句台词1秒后，页面缓慢滚动到"查看全部发行版"。第三句台词开始时显示一个1秒的点击动画',
    anim: [
      {
        type: 'scroll-to-text',
        text: 'All releases',
        offset: -200,
        triggerAt: 6.87,
        duration: 2.0,
      },
      {
        type: 'click-highlight',
        selector: 'All releases',
        triggerAt: 7.72,
        highlightMs: 1000,
        ripple: true,
      },
    ],
  },
  {
    url: 'https://gitcode.com/Faicad/3d_viewer_electron/releases/',
    description: '点击动画结束后，加载本页面。本页面显示1秒后，高亮"3D_Viewer_1.7.2_x64_cn_Setup.exe"下载链接',
    anim: [
      {
        type: 'highlight-area',
        selector: '3D_Viewer_1.7.2_x64_cn_Setup.exe',
        triggerAt: 9.72,
        highlightMs: 3000,
        padding: 10,
      },
    ],
  },
];
