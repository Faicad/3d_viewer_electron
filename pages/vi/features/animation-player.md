# Trình Phát Hoạt Ảnh

Faicad 3D Viewer bao gồm một trình phát hoạt ảnh tích hợp cho các tệp glTF có chứa dữ liệu hoạt ảnh. Hỗ trợ hoạt ảnh khung xương, mục tiêu biến dạng (morph target) và điều khiển phát lại đầy đủ.

## Trình Diễn — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Trình duyệt của bạn không hỗ trợ video nhúng.
</video>

## Phát Lại Toàn Màn Hình

Nhấp vào nút **Phóng to** (⛶) ở góc trên cùng bên phải của hộp thoại để vào chế độ toàn màn hình. Hoạt ảnh chiếm toàn bộ cửa sổ, loại bỏ tất cả giao diện người dùng khác — lý tưởng để xem tập trung và thuyết trình. Nhấn **Esc** hoặc nhấp vào **Thu nhỏ** để quay lại hộp thoại.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Trình duyệt của bạn không hỗ trợ video nhúng.
</video>

## Thêm Hoạt Ảnh

Mô hình trình diễn `RobotExpressive.glb` chứa 14 clip hoạt ảnh, tất cả được hiển thị ở chế độ toàn màn hình. Các video này được **tự động tạo ra** từ ứng dụng đang chạy — không cần ghi hình thủ công.

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

## Tất Cả Các Clip Có Sẵn

| Clip | Thời lượng | | Clip | Thời lượng |
|------|-----------|---|------|-----------|
| Dance | 3,3 giây | | Death | 1,0 giây |
| Idle | 3,3 giây | | Jump | 0,7 giây |
| No | 1,7 giây | | Punch | 0,8 giây |
| Running | 1,0 giây | | Sitting | 0,4 giây |
| Standing | 0,4 giây | | ThumbsUp | 1,6 giây |
| Walking | 1,0 giây | | WalkJump | 0,8 giây |
| Wave | 1,8 giây | | Yes | 1,7 giây |

## Định Dạng Hỗ Trợ

| Định dạng | Phần mở rộng | Loại Hoạt Ảnh |
|-----------|-------------|---------------|
| GLB | `.glb` | Khung xương + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Khung xương + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Hoạt ảnh khung xương |
| DAE (Collada) | `.dae` | Khung xương + Hoạt ảnh cảnh |
| BVH | `.bvh` | Ghi lại chuyển động khung xương |
| MD2 | `.md2` | Hoạt ảnh đỉnh (khung biến dạng) |

## Điều Khiển Phát Lại

| Điều khiển | Mô tả |
|-----------|-------|
| **Phát / Tạm dừng** | Bắt đầu hoặc tạm dừng hoạt ảnh hiện tại |
| **Tốc độ** | Điều chỉnh tốc độ phát lại (0,25× – 4×) |
| **Tìm kiếm** | Nhảy đến bất kỳ điểm nào trên dòng thời gian |
| **Lặp lại** | Chuyển đổi giữa lặp lại và phát một lần |
| **Ping-Pong** | Phát xuôi rồi ngược theo vòng lặp |

## Cách Sử Dụng

1. **Tải** mô hình có hoạt ảnh (GLB, GLTF, FBX, v.v.) qua kéo và thả, hộp thoại tệp hoặc dán từ clipboard
2. **Nhấp** vào nút Phát (▶) trên thanh công cụ để mở Trình Phát Hoạt Ảnh
3. **Chọn** một clip hoạt ảnh từ menu thả xuống
4. **Điều khiển** phát lại bằng các nút phát/tạm dừng, tốc độ, tìm kiếm, lặp lại và ping-pong
5. **Phóng to** hộp thoại ra toàn màn hình để có vùng xem hoạt ảnh chuyên dụng
