import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

//给AI用的软件 vs 给人用的软件




// 还支持一个场景里加载多个文件，而且还支持默认材质。这样的层层嵌套之下，AI很快，至少是目前的国产大模型解决不了这么复杂的问题。最后我就决定了做了一个取舍，一次只能编辑一个材质，不支持多个材质的编辑功能。为什么这么干呢？是因为批量编辑材质本质上是为了节省人力成本，节省人的时间，但是如果材质编辑是让AI来处理的话，他不嫌麻烦，你让他编辑10个材质，其实就是写一个循环一次，每次编辑一个材质，执行10次就行了


// 这个性能优化的问题，我主要是和AI一起解决，AI负责解决的是技术问题，他发现了性能瓶颈，我让他先做性能测量，找到问题瓶颈，然后具体写代码都是AI自己解决的。但是在这个过程中，我发现AI不擅长架构的问题，我这个系统最初设计的很复杂，我为了能够方便编辑材质，设计了批量编辑材质的功能。而且。

const subtitle = `
而编辑材质的时候，需要显示各种类型贴图的小缩略图
AI就在模型加载的时候，一次性生成所有贴图的缩略图
这个地牢模型有大几百个零件，有的零件还有多个贴图
于是就让浏览器卡死了
解决的办法很简单，就是到需要用的时候再生成缩略图
代码很快搞定，模型加载出来了。
`;


lib.makeMovie(
  import.meta.url,
  'movies/dungeon_warkarma.glb',
  // 'movies/p1/exported.glb',
  {
    embed: '1',
    AutoRotate: '0',
    entryAnim: 'zoom', 
    entryZoomDist: '5;10',
    entryZoomEndDist: '1.1;1.8',
    entryDuration: '2000',
    entryTargetShiftY: '0.1',
  },
  async (page, suffix, tPageOpen) => {

    await page.waitForTimeout(2000)


  },
)
