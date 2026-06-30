
const subtitle = `
Windows((自带的3D查看器))
((Windows))自带的3D查看器
今天寿命到期了，结束支持了
我推荐一款更好的开源版
支持25种3D文件格式，来看看吧
`;

const image_config = [
  {
    image: 'movies/screenshot/win2',
    description: '',
  },
  {
    image: 'movies/screenshot/win3',
    description: '0,5秒后显示鼠标点击动画',
    anim: [
      {
        type: 'move-click',
        selector: '3D查看器',
        triggerAt: 0.5,
        moveMs: 800,
      },
    ],
  },
  {
    image: 'movies/screenshot/3D查看器',
    description: '1.5秒后居中显示文字标注"就在今天⏰"，并在"2026年6月30日"文字上加蓝色边框5秒',
    anim: [
      {
        type: 'caption',
        text: '就在今天⏰',
        triggerAt: 1.5,
        duration: 3.53,
        top: { h: 20, v: 20 },
        fontSize: { h: 60, v: 54 },
        color: '#ff3333',
        align: 'center',
        pad: { h: 10, v: 5 },
      },
      {
        type: 'highlight-area',
        selector: '2026年6月30日',
        triggerAt: 1.0,
        highlightMs: 5000,
        padding: 5,
        color: '#2196F3',
      },
    ],
  },
  {
    image: '',
    description: '2秒后取消上面的文字显示"就在今天⏰"',
    anim: [
    ],
  },
  {
    image: '',
    description: '0.5秒后居中显示文字标注"25种，加载中......"',
    anim: [
      {
        type: 'caption',
        text: '25种，加载中......',
        triggerAt: 0.5,
        duration: 3,
        top: { h: 30, v: 30 },
        fontSize: { h: 66, v: 66 },
        color: '#ff6b35',
        align: 'center',
        pad: { h: 10, v: 5 },
      },
    ],
  },
];
