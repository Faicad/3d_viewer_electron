# Benchmark

启动时间性能测试工具，用于检测代码变更对启动性能的影响。

## 目录结构

```
benchmark/
├── README.md                     # 本文件
├── run.mjs                       # 运行完整基准测试并保存快照
├── compare.mjs                   # 比较两个启动时间快照
├── lib/
│   ├── measure-startup.mjs       # 启动时间测量 (Playwright + Electron)
│   ├── measure-bundle.mjs        # Bundle 大小分析（辅助）
│   └── snapshot.mjs              # 快照读写工具
└── snapshots/
    ├── baseline-startup.json     # 当前基线
    └── optimized-startup.json    # 优化后
```

## 前置要求

- `pnpm run build`（必须，构建产物在 `out/` 目录）
- Node.js >= 22

> 测量通过 Playwright 启动 Electron 应用完成，不需要 `build:unpacked`。
> 脚本会自动使用 `node_modules/electron/dist/electron.exe` 启动应用。

## 运行基准测试

### 保存一次启动时间快照

```bash
node benchmark/run.mjs <快照名称> --skip-bundle
```

示例：

```bash
# 保存优化后的启动时间（默认迭代 3 次）
node benchmark/run.mjs optimized --skip-bundle

# 仅测量 bundle（不需要 Playwright）
node benchmark/run.mjs optimized --skip-startup

# 指定迭代次数
node benchmark/run.mjs optimized --iterations=5
```

### 比较两个快照

```bash
node benchmark/compare.mjs <基线名称> <优化后名称>
```

示例：

```bash
node benchmark/compare.mjs baseline optimized
```

## 测量指标

| 指标 | 说明 |
|---|---|
| Time to first window | 从进程启动到 Electron 创建第一个窗口 |
| Time to DOM ready (DCL) | 到 DOMContentLoaded 事件触发 |
| Time to page load | 到 window load 事件触发 |

## 检测回归

当怀疑启动性能变差时：

```bash
# 1. 在改动前保存基线
git stash
pnpm run build
node benchmark/run.mjs baseline --skip-bundle

# 2. 恢复改动
git stash pop
pnpm run build

# 3. 测量新代码
node benchmark/run.mjs current --skip-bundle

# 4. 对比
node benchmark/compare.mjs baseline current
```

如果 `Time to page load` 增加超过 100ms，说明有启动性能回归。

## 注意事项

- 每次测量会启动/关闭 Electron 应用多次（由 `--iterations` 控制）
- 单次测量的波动通常在 ±50ms 范围内，建议使用 3 次迭代取中位数
- 结果保存在 `benchmark/snapshots/` 目录，应提交到版本控制
