# Animasyon Oynatıcı

Faicad 3D Viewer, animasyon verisi içeren glTF dosyaları için yerleşik bir animasyon oynatıcı içerir. İskelet tabanlı animasyonları, morf hedeflerini ve tam oynatma kontrolünü destekler.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Tarayıcınız gömülü videoyu desteklemiyor.
</video>

## Tam Ekran Oynatma

İletişim kutusunun sağ üst köşesindeki **Büyüt** düğmesine (⛶) tıklayarak tam ekran moduna geçin. Animasyon tüm pencereyi kaplar, diğer tüm arayüz öğelerini kaldırır — odaklanmış inceleme ve sunumlar için idealdir. **Esc** tuşuna basın veya **Küçült** düğmesine tıklayarak iletişim kutusuna dönün.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Tarayıcınız gömülü videoyu desteklemiyor.
</video>

## Daha Fazla Animasyon

Demo modeli `RobotExpressive.glb`, 14 animasyon klibi içerir ve tümü tam ekran modunda gösterilir. Bu videolar, çalışan uygulamadan **otomatik olarak oluşturulur** — manuel kayıt gerekmez.

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

## Mevcut Tüm Klipler

| Klip | Süre | | Klip | Süre |
|------|------|---|------|------|
| Dance | 3,3 sn | | Death | 1,0 sn |
| Idle | 3,3 sn | | Jump | 0,7 sn |
| No | 1,7 sn | | Punch | 0,8 sn |
| Running | 1,0 sn | | Sitting | 0,4 sn |
| Standing | 0,4 sn | | ThumbsUp | 1,6 sn |
| Walking | 1,0 sn | | WalkJump | 0,8 sn |
| Wave | 1,8 sn | | Yes | 1,7 sn |

## Desteklenen Biçimler

| Biçim | Uzantılar | Animasyon Türü |
|-------|-----------|----------------|
| GLB | `.glb` | İskelet + Morf Hedefi (glTF 2.0) |
| GLTF | `.gltf` | İskelet + Morf Hedefi (glTF 2.0) |
| FBX | `.fbx` | İskelet animasyonu |
| DAE (Collada) | `.dae` | İskelet + Sahne animasyonu |
| BVH | `.bvh` | Hareket yakalama iskeleti |
| MD2 | `.md2` | Köşe animasyonu (morf kareleri) |

## Oynatma Kontrolleri

| Kontrol | Açıklama |
|---------|----------|
| **Oynat / Duraklat** | Geçerli animasyonu başlat veya duraklat |
| **Hız** | Oynatma hızını ayarla (0,25× – 4×) |
| **Ara** | Zaman çizelgesinde herhangi bir noktaya atla |
| **Döngü** | Tekrarlama ve tek seferlik oynatma arasında geçiş yap |
| **Ping-Pong** | İleri, ardından geriye doğru döngüyle oynat |

## Nasıl Kullanılır

1. **Yükleyin** — sürükle-bırak, dosya iletişim kutusu veya pano yapıştırma yoluyla animasyonlu bir model (GLB, GLTF, FBX vb.) yükleyin
2. **Tıklayın** — Animasyon Oynatıcıyı açmak için araç çubuğundaki Oynat düğmesine (▶) tıklayın
3. **Seçin** — açılır menüden bir animasyon klibi seçin
4. **Kontrol edin** — oynat/duraklat, hız, ara, döngü ve ping-pong kontrolleriyle oynatmayı kontrol edin
5. **Büyütün** — iletişim kutusunu tam ekrana büyüterek özel bir animasyon görüntü alanı elde edin
