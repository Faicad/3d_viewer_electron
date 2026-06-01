# Pemutar Animasi

Faicad 3D Viewer menyertakan pemutar animasi bawaan untuk file glTF yang berisi data animasi. Mendukung animasi kerangka, target morph, dan kontrol pemutaran penuh.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Browser Anda tidak mendukung video tersemat.
</video>

## Pemutaran Layar Penuh

Klik tombol **Maksimalkan** (⛶) di pojok kanan atas dialog untuk masuk ke mode layar penuh. Animasi memenuhi seluruh jendela, menghilangkan semua UI lainnya — ideal untuk tinjauan fokus dan presentasi. Tekan **Esc** atau klik **Minimalkan** untuk kembali ke dialog.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Browser Anda tidak mendukung video tersemat.
</video>

## Animasi Lainnya

Model demo `RobotExpressive.glb` berisi 14 klip animasi, semuanya ditampilkan dalam mode layar penuh. Video ini **dihasilkan secara otomatis** dari aplikasi yang berjalan — tanpa perlu perekaman manual.

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

## Semua Klip yang Tersedia

| Klip | Durasi | | Klip | Durasi |
|------|--------|---|------|--------|
| Dance | 3,3 dtk | | Death | 1,0 dtk |
| Idle | 3,3 dtk | | Jump | 0,7 dtk |
| No | 1,7 dtk | | Punch | 0,8 dtk |
| Running | 1,0 dtk | | Sitting | 0,4 dtk |
| Standing | 0,4 dtk | | ThumbsUp | 1,6 dtk |
| Walking | 1,0 dtk | | WalkJump | 0,8 dtk |
| Wave | 1,8 dtk | | Yes | 1,7 dtk |

## Format yang Didukung

| Format | Ekstensi | Tipe Animasi |
|--------|----------|--------------|
| GLB | `.glb` | Kerangka + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Kerangka + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animasi kerangka |
| DAE (Collada) | `.dae` | Kerangka + Animasi adegan |
| BVH | `.bvh` | Tangkapan gerak kerangka |
| MD2 | `.md2` | Animasi vertex (morph frames) |

## Kontrol Pemutaran

| Kontrol | Deskripsi |
|---------|-----------|
| **Putar / Jeda** | Memulai atau menjeda animasi saat ini |
| **Kecepatan** | Menyesuaikan kecepatan pemutaran (0,25× – 4×) |
| **Cari** | Melompat ke titik mana pun di garis waktu animasi |
| **Ulang** | Beralih antara pengulangan dan putar sekali |
| **Ping-Pong** | Memutar maju lalu mundur dalam putaran |

## Cara Menggunakan

1. **Muat** model animasi (GLB, GLTF, FBX, dll.) melalui seret dan lepas, dialog file, atau tempel papan klip
2. **Klik** tombol Putar (▶) di bilah alat untuk membuka Pemutar Animasi
3. **Pilih** klip animasi dari menu tarik-turun
4. **Kontrol** pemutaran dengan kontrol putar/jeda, kecepatan, cari, ulang, dan ping-pong
5. **Maksimalkan** dialog ke layar penuh untuk area tampilan animasi khusus
