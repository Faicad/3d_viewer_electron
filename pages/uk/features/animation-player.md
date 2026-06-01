# Програвач Анімацій

Faicad 3D Viewer включає вбудований програвач анімацій для файлів glTF, що містять анімаційні дані. Підтримує скелетну анімацію, morph-targets та повне керування відтворенням.

## Демонстрація — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Ваш браузер не підтримує вбудоване відео.
</video>

## Повноекранне Відтворення

Натисніть кнопку **Розгорнути** (⛶) у правому верхньому куті діалогового вікна, щоб перейти в повноекранний режим. Анімація заповнює все вікно, видаляючи весь інтерфейс — ідеально для зосередженого перегляду та презентацій. Натисніть **Esc** або кнопку **Згорнути**, щоб повернутися до діалогу.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Ваш браузер не підтримує вбудоване відео.
</video>

## Більше Анімацій

Демо-модель `RobotExpressive.glb` містить 14 анімаційних кліпів, усі показані в повноекранному режимі. Ці відео **автоматично генеруються** з працюючого додатку — без ручного запису.

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

## Усі Доступні Кліпи

| Кліп | Тривалість | | Кліп | Тривалість |
|------|-----------|---|------|-----------|
| Dance | 3,3 с | | Death | 1,0 с |
| Idle | 3,3 с | | Jump | 0,7 с |
| No | 1,7 с | | Punch | 0,8 с |
| Running | 1,0 с | | Sitting | 0,4 с |
| Standing | 0,4 с | | ThumbsUp | 1,6 с |
| Walking | 1,0 с | | WalkJump | 0,8 с |
| Wave | 1,8 с | | Yes | 1,7 с |

## Підтримувані Формати

| Формат | Розширення | Тип Анімації |
|--------|-----------|-------------|
| GLB | `.glb` | Скелетна + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Скелетна + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Скелетна анімація |
| DAE (Collada) | `.dae` | Скелетна + Сценічна анімація |
| BVH | `.bvh` | Захоплення руху скелета |
| MD2 | `.md2` | Вершинна анімація (morph frames) |

## Елементи Керування

| Елемент | Опис |
|---------|------|
| **Відтв. / Пауза** | Запуск або пауза поточної анімації |
| **Швидкість** | Регулювання швидкості відтворення (0,25× – 4×) |
| **Пошук** | Перехід до будь-якої точки часової шкали |
| **Повтор** | Перемикання між повтором і одноразовим відтворенням |
| **Пінг-понг** | Відтворення вперед, потім назад по циклу |

## Як Використовувати

1. **Завантажте** анімовану модель (GLB, GLTF, FBX тощо) через drag & drop, діалог вибору файлу або вставку з буфера обміну
2. **Натисніть** кнопку Відтворення (▶) на панелі інструментів, щоб відкрити Програвач Анімацій
3. **Виберіть** анімаційний кліп з випадного меню
4. **Керуйте** відтворенням за допомогою кнопок відтв./пауза, швидкості, пошуку, повтору та пінг-понгу
5. **Розгорніть** діалог на весь екран для виділеного вікна перегляду анімації
