// 放样：底部 18mm 圆角正方形 → 顶部 17mm 正方形，高度 8mm
// Z 轴方向四条边带 2mm 圆角
$fn = 48;
module rounded_square(size, r) {
    s = size / 2 - r;
    hull() {
        translate([ s,  s]) circle(r);
        translate([-s,  s]) circle(r);
        translate([ s, -s]) circle(r);
        translate([-s, -s]) circle(r);
    }
}
linear_extrude(height = 8, scale = 17 / 18, slices = 30, convexity = 10)
    rounded_square(18, 2);