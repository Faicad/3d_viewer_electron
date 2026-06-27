# 深刻教训

## 1. 永远不要 git checkout 文件
`git checkout <file>` 会直接覆盖工作区内容，未暂存修改永久丢失。
**禁止使用此命令。**

## 2. "不准改代码" = 立即停止一切操作
当用户说「不准改代码」「不准做任何改动」时：
- 停止所有文件写入
- 停止所有 git 操作
- 停止所有编辑
- 只回答，不动作

## 3. "commit" = 只 commit，不做别的
用户说 commit 时：
- 直接 `git add` + `git commit`
- 不读 diff
- 不改代码
- 不改 commit message 除非用户要求

## 4. 本次丢失
- `movies/e1/m1.mjs` — 用户未暂存修改，永久丢失
- `movies/e1/m5.mjs` — 用户未暂存修改，永久丢失

## 5. 已恢复
- `movies/e1/m0.mjs` — 从 `git show 0eb7b08:movies/e1/m0.mjs` 恢复
