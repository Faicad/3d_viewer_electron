# एनिमेशन प्लेयर

Faicad 3D Viewer में एनिमेशन डेटा वाली glTF फ़ाइलों के लिए एक अंतर्निहित एनिमेशन प्लेयर शामिल है। यह कंकाल-आधारित एनिमेशन, मॉर्फ टार्गेट और पूर्ण प्लेबैक नियंत्रण का समर्थन करता है।

## डेमो — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  आपका ब्राउज़र एम्बेडेड वीडियो का समर्थन नहीं करता है।
</video>

## फ़ुलस्क्रीन प्लेबैक

डायलॉग के ऊपरी-दाएँ कोने में **अधिकतम** बटन (⛶) पर क्लिक करें फ़ुलस्क्रीन मोड में जाने के लिए। एनिमेशन पूरी विंडो भर देता है, अन्य सभी UI हटा देता है — केंद्रित समीक्षा और प्रस्तुतियों के लिए आदर्श। **Esc** दबाएँ या **न्यूनतम** बटन पर क्लिक करें डायलॉग पर लौटने के लिए।

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  आपका ब्राउज़र एम्बेडेड वीडियो का समर्थन नहीं करता है।
</video>

## अधिक एनिमेशन

डेमो मॉडल `RobotExpressive.glb` में 14 एनिमेशन क्लिप हैं, सभी फ़ुलस्क्रीन मोड में दिखाए गए हैं। ये वीडियो चल रहे एप्लिकेशन से **स्वचालित रूप से उत्पन्न** होते हैं — किसी मैन्युअल रिकॉर्डिंग की आवश्यकता नहीं।

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

## सभी उपलब्ध क्लिप

| क्लिप | अवधि | | क्लिप | अवधि |
|-------|------|---|-------|------|
| Dance | 3.3 से | | Death | 1.0 से |
| Idle | 3.3 से | | Jump | 0.7 से |
| No | 1.7 से | | Punch | 0.8 से |
| Running | 1.0 से | | Sitting | 0.4 से |
| Standing | 0.4 से | | ThumbsUp | 1.6 से |
| Walking | 1.0 से | | WalkJump | 0.8 से |
| Wave | 1.8 से | | Yes | 1.7 से |

## समर्थित प्रारूप

| प्रारूप | एक्सटेंशन | एनिमेशन प्रकार |
|---------|-----------|---------------|
| GLB | `.glb` | कंकाल + मॉर्फ टार्गेट (glTF 2.0) |
| GLTF | `.gltf` | कंकाल + मॉर्फ टार्गेट (glTF 2.0) |
| FBX | `.fbx` | कंकाल एनिमेशन |
| DAE (Collada) | `.dae` | कंकाल + दृश्य एनिमेशन |
| BVH | `.bvh` | मोशन कैप्चर कंकाल |
| MD2 | `.md2` | वर्टेक्स एनिमेशन (मॉर्फ फ़्रेम) |

## प्लेबैक नियंत्रण

| नियंत्रण | विवरण |
|----------|--------|
| **चलाएँ / रोकें** | वर्तमान एनिमेशन शुरू या रोकें |
| **गति** | प्लेबैक गति समायोजित करें (0.25× – 4×) |
| **खोजें** | टाइमलाइन पर किसी भी बिंदु पर जाएँ |
| **दोहराएँ** | दोहराने और एक बार चलाने के बीच टॉगल करें |
| **पिंग-पोंग** | आगे और फिर पीछे लूप में चलाएँ |

## उपयोग कैसे करें

1. **लोड करें** एक एनिमेटेड मॉडल (GLB, GLTF, FBX, आदि) ड्रैग और ड्रॉप, फ़ाइल डायलॉग या क्लिपबोर्ड पेस्ट के माध्यम से
2. **क्लिक करें** टूलबार में चलाएँ बटन (▶) पर एनिमेशन प्लेयर खोलने के लिए
3. **चुनें** ड्रॉपडाउन मेनू से एक एनिमेशन क्लिप
4. **नियंत्रित करें** चलाएँ/रोकें, गति, खोजें, दोहराएँ और पिंग-पोंग नियंत्रणों के साथ प्लेबैक
5. **अधिकतम करें** डायलॉग को फ़ुलस्क्रीन में समर्पित एनिमेशन व्यूपोर्ट के लिए
