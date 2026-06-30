
const subtitle = `
Windows自带的3D查看器
今天寿命到期了
我推荐一款更好的
支持25种3D文件格式
`;

const image_config = [
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
    description: '1.5秒后在"2026年6月30日"文字上加蓝色边框5秒',
    anim: [
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
    description: '',
    anim: [
    ],
  },
  {
    image: '',
    description: '居中显示文字标注"25种，加载中......"',
    anim: [
      {
        type: 'caption',
        text: '25种，加载中....',
        triggerAt: 0,
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
