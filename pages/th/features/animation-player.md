# โปรแกรมเล่นแอนิเมชัน

Faicad 3D Viewer มีโปรแกรมเล่นแอนิเมชันในตัวสำหรับไฟล์ glTF ที่มีข้อมูลแอนิเมชัน รองรับแอนิเมชันโครงกระดูก เป้าหมายการแปลงร่าง (Morph Target) และการควบคุมการเล่นแบบเต็มรูปแบบ

## การสาธิต — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  เบราว์เซอร์ของคุณไม่รองรับวิดีโอแบบฝัง
</video>

## การเล่นแบบเต็มหน้าจอ

คลิกปุ่ม **ขยายใหญ่สุด** (⛶) ที่มุมขวาบนของกล่องโต้ตอบเพื่อเข้าสู่โหมดเต็มหน้าจอ แอนิเมชันจะเต็มหน้าต่างทั้งหมด และซ่อนส่วนติดต่อผู้ใช้ทั้งหมด — เหมาะสำหรับการตรวจสอบแบบเข้มข้นและการนำเสนอ กด **Esc** หรือคลิก **ย่อเล็กสุด** เพื่อกลับไปยังกล่องโต้ตอบ

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  เบราว์เซอร์ของคุณไม่รองรับวิดีโอแบบฝัง
</video>

## แอนิเมชันเพิ่มเติม

โมเดลสาธิต `RobotExpressive.glb` ประกอบด้วยคลิปแอนิเมชัน 14 คลิป ทั้งหมดแสดงในโหมดเต็มหน้าจอ วิดีโอเหล่านี้ถูก **สร้างขึ้นโดยอัตโนมัติ** จากแอปพลิเคชันที่กำลังทำงาน — ไม่จำเป็นต้องบันทึกด้วยตนเอง

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

## คลิปที่มีทั้งหมด

| คลิป | ระยะเวลา | | คลิป | ระยะเวลา |
|------|---------|---|------|---------|
| Dance | 3.3 วินาที | | Death | 1.0 วินาที |
| Idle | 3.3 วินาที | | Jump | 0.7 วินาที |
| No | 1.7 วินาที | | Punch | 0.8 วินาที |
| Running | 1.0 วินาที | | Sitting | 0.4 วินาที |
| Standing | 0.4 วินาที | | ThumbsUp | 1.6 วินาที |
| Walking | 1.0 วินาที | | WalkJump | 0.8 วินาที |
| Wave | 1.8 วินาที | | Yes | 1.7 วินาที |

## รูปแบบที่รองรับ

| รูปแบบ | นามสกุล | ประเภทแอนิเมชัน |
|--------|---------|----------------|
| GLB | `.glb` | โครงกระดูก + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | โครงกระดูก + Morph Target (glTF 2.0) |
| FBX | `.fbx` | แอนิเมชันโครงกระดูก |
| DAE (Collada) | `.dae` | โครงกระดูก + แอนิเมชันฉาก |
| BVH | `.bvh` | การจับการเคลื่อนไหวโครงกระดูก |
| MD2 | `.md2` | แอนิเมชันจุดยอด (เฟรมแปลงร่าง) |

## การควบคุมการเล่น

| การควบคุม | คำอธิบาย |
|-----------|---------|
| **เล่น / หยุดชั่วคราว** | เริ่มหรือหยุดแอนิเมชันปัจจุบันชั่วคราว |
| **ความเร็ว** | ปรับความเร็วในการเล่น (0.25× – 4×) |
| **ค้นหา** | ข้ามไปยังจุดใดก็ได้บนไทม์ไลน์ |
| **วนซ้ำ** | สลับระหว่างการเล่นซ้ำและเล่นครั้งเดียว |
| **ปิงปอง** | เล่นไปข้างหน้าแล้วย้อนกลับเป็นวง |

## วิธีใช้งาน

1. **โหลด** โมเดลที่มีแอนิเมชัน (GLB, GLTF, FBX ฯลฯ) ผ่านการลากและวาง กล่องโต้ตอบไฟล์ หรือวางจากคลิปบอร์ด
2. **คลิก** ปุ่มเล่น (▶) ในแถบเครื่องมือเพื่อเปิดโปรแกรมเล่นแอนิเมชัน
3. **เลือก** คลิปแอนิเมชันจากเมนูแบบเลื่อนลง
4. **ควบคุม** การเล่นด้วยปุ่มเล่น/หยุดชั่วคราว ความเร็ว ค้นหา วนซ้ำ และปิงปอง
5. **ขยาย** กล่องโต้ตอบเป็นเต็มหน้าจอเพื่อพื้นที่รับชมแอนิเมชันโดยเฉพาะ
