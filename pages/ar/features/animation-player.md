# مشغل الرسوم المتحركة

يتضمن Faicad 3D Viewer مشغل رسوم متحركة مدمج لملفات glTF التي تحتوي على بيانات حركة. يدعم الرسوم المتحركة الهيكلية، وأهداف التشكيل، والتحكم الكامل في التشغيل.

## عرض توضيحي — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  متصفحك لا يدعم تشغيل الفيديو المضمن.
</video>

## التشغيل بملء الشاشة

انقر على زر **تكبير** (⛶) في الزاوية العلوية اليمنى من مربع الحوار للدخول إلى وضع ملء الشاشة. تملأ الرسوم المتحركة النافذة بأكملها، مع إزالة جميع عناصر الواجهة الأخرى — مثالية للمراجعة المركزة والعروض التقديمية. اضغط **Esc** أو انقر على **تصغير** للعودة إلى مربع الحوار.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  متصفحك لا يدعم تشغيل الفيديو المضمن.
</video>

## المزيد من الرسوم المتحركة

يحتوي النموذج التجريبي `RobotExpressive.glb` على 14 مقطع رسوم متحركة، جميعها معروضة في وضع ملء الشاشة. يتم **توليد مقاطع الفيديو هذه تلقائياً** من التطبيق قيد التشغيل — بدون تسجيل يدوي.

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

## جميع المقاطع المتاحة

| المقطع | المدة | | المقطع | المدة |
|--------|-------|---|--------|-------|
| Dance | 3.3 ث | | Death | 1.0 ث |
| Idle | 3.3 ث | | Jump | 0.7 ث |
| No | 1.7 ث | | Punch | 0.8 ث |
| Running | 1.0 ث | | Sitting | 0.4 ث |
| Standing | 0.4 ث | | ThumbsUp | 1.6 ث |
| Walking | 1.0 ث | | WalkJump | 0.8 ث |
| Wave | 1.8 ث | | Yes | 1.7 ث |

## الصيغ المدعومة

| الصيغة | الامتدادات | نوع الرسوم المتحركة |
|--------|-----------|-------------------|
| GLB | `.glb` | هيكل عظمي + هدف تشكيل (glTF 2.0) |
| GLTF | `.gltf` | هيكل عظمي + هدف تشكيل (glTF 2.0) |
| FBX | `.fbx` | رسوم متحركة هيكلية |
| DAE (Collada) | `.dae` | هيكل عظمي + رسوم مشهد |
| BVH | `.bvh` | التقاط حركة هيكلية |
| MD2 | `.md2` | رسوم رؤوس (إطارات تشكيل) |

## عناصر التحكم في التشغيل

| التحكم | الوصف |
|--------|-------|
| **تشغيل / إيقاف مؤقت** | بدء أو إيقاف الرسوم المتحركة الحالية مؤقتاً |
| **السرعة** | ضبط سرعة التشغيل (0.25× – 4×) |
| **البحث** | الانتقال إلى أي نقطة في الخط الزمني |
| **التكرار** | التبديل بين التكرار والتشغيل لمرة واحدة |
| **بنغ بونغ** | التشغيل للأمام ثم للخلف في حلقة |

## كيفية الاستخدام

1. **حمّل** نموذجاً متحركاً (GLB، GLTF، FBX، إلخ) عبر السحب والإفلات أو مربع حوار الملفات أو اللصق من الحافظة
2. **انقر** على زر التشغيل (▶) في شريط الأدوات لفتح مشغل الرسوم المتحركة
3. **اختر** مقطع رسوم متحركة من القائمة المنسدلة
4. **تحكم** في التشغيل باستخدام أزرار التشغيل/الإيقاف المؤقت والسرعة والبحث والتكرار وبنغ بونغ
5. **كبر** مربع الحوار لملء الشاشة للحصول على نافذة عرض رسوم متحركة مخصصة
