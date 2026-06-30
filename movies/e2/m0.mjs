
const subtitle = `
Windows自带的3D查看器
今天寿命到期了，结束支持了
我推荐一款更好的
支持25种3D文件格式，来看看吧
`;

const image_config = [
  {
    image: 'movies/screenshot/win2',
    description: '开始1秒后高亮"3D查看器"图标，结束前1秒显示鼠标点击动画',
    anim: [
      {
        type: 'highlight-area',
        selector: '3D查看器',
        triggerAt: 1.0,
        highlightMs: 1650,
        padding: 10,
      },
      {
        type: 'click-highlight',
        selector: '3D查看器',
        triggerAt: 2.65,
        highlightMs: 1000,
      },
    ],
  },
  {
    image: 'movies/screenshot/3D查看器',
    description: '1.5秒后居中显示文字标注"就在今天：6月30日结束 ⏰"',
    anim: [
      {
        type: 'caption',
        text: '就在今天：6月30日结束 ⏰',
        triggerAt: 1.5,
        duration: 1.53,
        hideAt: 4.03,
        top: { h: 50, v: 50 },
        fontSize: { h: 60, v: 54 },
        color: '#ff3333',
        align: 'center',
        pad: { h: 10, v: 5 },
      },
    ],
  },
  {
    image: '',
    description: '1秒后取消上面的文字显示"就在今天：6月30日结束 ⏰"',
    anim: [
    ],
  },
  {
    image: '',
    description: '0.5秒后居中显示文字标注"25种3D文件格式，加载中...", 一行文字分成两段动画显示',
    anim: [
      {
        type: 'caption',
        text: '25种3D文件格式，加载中...',
        triggerAt: 0.5,
        duration: 2.5,
        top: { h: 46, v: 50 },
        fontSize: { h: 56, v: 50 },
        color: '#22aa55',
        align: 'center',
        pad: { h: 10, v: 5 },
      },
    ],
  },
];
