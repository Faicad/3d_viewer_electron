# アニメーションプレーヤー

Faicad 3D Viewer には、アニメーションデータを含む glTF ファイル用のアニメーションプレーヤーが組み込まれています。スケルトンアニメーション、モーフターゲット、完全な再生コントロールをサポートします。

## デモ — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  お使いのブラウザは埋め込み動画をサポートしていません。
</video>

## 全画面再生

ダイアログの右上隅にある **最大化** ボタン（⛶）をクリックすると、全画面モードになります。アニメーションがウィンドウ全体に表示され、他の UI はすべて非表示になります — 集中したレビューやプレゼンテーションに最適です。**Esc** キーを押すか、**最小化** ボタンをクリックしてダイアログに戻ります。

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  お使いのブラウザは埋め込み動画をサポートしていません。
</video>

## その他のアニメーション

デモモデル `RobotExpressive.glb` には 14 のアニメーションクリップが含まれており、すべて全画面モードで表示されています。これらの動画は実行中のアプリケーションから **自動生成** されており、手動録画は不要です。

### Idle

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Idle-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Idle-fullscreen.mp4" type="video/mp4">
</video>

### Running

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Running-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Running-fullscreen.mp4" type="video/mp4">
</video>

### Dance

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Dance-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Dance-fullscreen.mp4" type="video/mp4">
</video>

## 利用可能な全クリップ

| クリップ | 再生時間 | | クリップ | 再生時間 |
|----------|----------|---|----------|----------|
| Dance | 3.3 秒 | | Death | 1.0 秒 |
| Idle | 3.3 秒 | | Jump | 0.7 秒 |
| No | 1.7 秒 | | Punch | 0.8 秒 |
| Running | 1.0 秒 | | Sitting | 0.4 秒 |
| Standing | 0.4 秒 | | ThumbsUp | 1.6 秒 |
| Walking | 1.0 秒 | | WalkJump | 0.8 秒 |
| Wave | 1.8 秒 | | Yes | 1.7 秒 |

## サポートされている形式

| 形式 | 拡張子 | アニメーションタイプ |
|------|--------|---------------------|
| GLB | `.glb` | スケルトン + モーフターゲット (glTF 2.0) |
| GLTF | `.gltf` | スケルトン + モーフターゲット (glTF 2.0) |
| FBX | `.fbx` | スケルトンアニメーション |
| DAE (Collada) | `.dae` | スケルトン + シーンアニメーション |
| BVH | `.bvh` | モーションキャプチャースケルトン |
| MD2 | `.md2` | 頂点アニメーション (モーフフレーム) |

## 再生コントロール

| コントロール | 説明 |
|-------------|------|
| **再生 / 一時停止** | 現在のアニメーションを開始または一時停止 |
| **速度** | 再生速度を調整 (0.25倍 – 4倍) |
| **シーク** | アニメーションタイムラインの任意の位置にジャンプ |
| **ループ** | 繰り返し再生と単一回再生を切り替え |
| **ピンポン** | 順方向に再生した後、逆方向にループ再生 |

## 使い方

1. **読み込む** — アニメーション付きモデル（GLB、GLTF、FBX 等）をドラッグ＆ドロップ、ファイルダイアログ、またはクリップボード貼り付けで読み込む
2. **クリック** — ツールバーの再生ボタン（▶）をクリックしてアニメーションプレーヤーを開く
3. **選択** — ドロップダウンメニューからアニメーションクリップを選択
4. **操作** — 再生/一時停止、速度、シーク、ループ、ピンポンコントロールで操作
5. **最大化** — ダイアログを全画面に最大化して専用のアニメーションビューポートで表示
