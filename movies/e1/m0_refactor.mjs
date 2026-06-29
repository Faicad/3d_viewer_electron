// 示例文件是movies\e1\m0_refactor.mjs，
// 并且效果等价与目前的m0.mjs + m0_2.mjs。

// TTS 时间轴:
//   [0] 0.5 — 2.83   你知道吗，只剩三天时间            TTS 2.33s
//   [1] 2.98 — 5.62  Windows自带的3D查看器            TTS 2.64s
//   [2] 5.77 — 7.59  即将结束支持                      TTS 1.82s
//
// 场景时长（含静音间隙）:
//   imageDurations[0] = 2.33+0.5+0.15=2.98s  (t=0～2.98)
//   imageDurations[1] = 2.64+0.15=2.79s      (t=2.98～5.77)
//   imageDurations[2] = 1.82s                (t=5.77～7.59)
//
// triggerAt 均为相对当前场景起始时刻的偏移秒数

const subtitle = `
你知道吗，只剩三天时间
Windows自带的3D查看器
即将结束支持
`;

const image_config = [
  {
    image: 'movies/screenshot/win',
    description: '开始1秒后高亮显示"3D查看器"图标并点击',
    anim: [
      {
        type: 'caption',
        text: '你知道吗，只剩三天时间',
        triggerAt: 0,
        duration: 2.98,
        top: { h: 80, v: 75 },
        fontSize: { h: 48, v: 42 },
        color: '#ff6b35',
        align: 'center',
        pad: { h: 5, v: 5 },
      },
      {
        type: 'click-highlight',
        selector: '3D查看器',
        triggerAt: 1.0,
        highlightMs: 1500,
      },
    ],
  },
  {
    image: 'movies/screenshot/3D查看器',
    description: '显示文字标注"2026年6月30日结束 ⏰"',
    anim: [
      {
        type: 'caption',
        text: '2026年6月30日结束 ⏰',
        triggerAt: 0.5,
        duration: 2.0,
        top: { h: 20, v: 25 },
        fontSize: { h: 72, v: 72 },
        color: '#ff6b35',
        align: { h: 'left', v: 'center' },
        pad: { h: 22, v: 10 },
      },
    ],
  },
  {
    image: '',
    description: '结束前1秒点击右上角"详细信息"按钮',
    anim: [
      {
        type: 'click-highlight',
        selector: '详细信息',
        triggerAt: 0.82,
        highlightMs: 1000,
      },
    ],
  },
];
