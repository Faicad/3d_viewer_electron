
const subtitle = `
安装也很简单，以work buddy为例
点击专家
然后点击技能
在搜索框输入‘3d模型查看’
在SkillHub里点击+号安装
就可以使用了。同时也支持claude code等\n ((npx skills add faicad/3d_viewer))
`;

const image = 'movies/screenshot/WorkBuddy';

//请帮我通过5张图片生成视频，分别生成横屏和竖屏的视频。
//视频的时长由上面的字幕决定。
// 字幕和音频的生成参考 movies\generate-subtitle.mjs，
// 但是稍有不同。其它m1.mjs/m3.mjs是代码生成视频。本文件是图片合成视频。
// 请写脚本来完成这个任务。

//上面的字幕，按行显示。同一行内的\n代表字幕显示的时候折行。
//字幕折行的功能还没有，需要你扩展generate-subtitle.mjs的功能。

//最终所有的m1/m2/m3要合并，所以流程要兼容。

// movies/screenshot
// ├── WorkBuddy_h.png
// ├── WorkBuddy_h_marked_1.png
// ├── WorkBuddy_h_marked_2.png
// ├── WorkBuddy_h_marked_3.png
// ├── WorkBuddy_h_marked_4.png
// ├── WorkBuddy_v.png
// ├── WorkBuddy_v_marked_1.png
// ├── WorkBuddy_v_marked_2.png
// ├── WorkBuddy_v_marked_3.png
// ├── WorkBuddy_v_marked_4.png

// 上面的图片是通过下面的命令生成的
// pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"
// python movies/mark-text-easyocr.py movies/screenshot/WorkBuddy_h.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"
// python movies/mark-text-easyocr.py movies/screenshot/WorkBuddy_v.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"