// 放样：底部 18mm 正方形 → 顶部 17mm 正方形，高度 8mm
linear_extrude(height = 8, scale = 17 / 18, slices = 30, convexity = 10)
    square(18, center = true);