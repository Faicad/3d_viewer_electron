
const subtitle = `
也可以用work buddy
选择3D模型查看的技能
然后输入建模的提示词\n(建模一个顶部边长17毫米、底部边长18毫米、高8毫米的长方体)
大约要花掉5个积分(Credit)，比Open code要贵
就能得到一个梯形长方体
`;

// 如果在OpenCode中，则输入'/3d_viewer'
// 当然，你需要提前安装好这个技能\n ((npx skills add faicad/3d_viewer))

// 在xy平面一个边长17毫米的正方形，Z轴向上8毫米平行有一个边长18毫米的正方形，放样连接这两个正方形

const image = 'movies/screenshot/p2/p2';


// 上面的图片是通过下面的命令生成的
// pwsh -c "& ./movies/screenshot-window.ps1 WorkBuddy"
// python movies/mark-text-easyocr.py movies/screenshot/WorkBuddy_h.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"
// python movies/mark-text-easyocr.py movies/screenshot/WorkBuddy_v.png "专家:left" "技能:top13-center50" "3d模型查看:top15" "SkillHub:top"