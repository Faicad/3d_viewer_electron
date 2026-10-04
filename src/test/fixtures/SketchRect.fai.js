// Minimal closed-rectangle via cad.sketch — the BREP-only, solver-required op
// that converted FreeCAD sketches emit (constraints solve in planegcs). A
// sketch alone is a DAG terminal and tessellates to a face, so opening this
// through the viewer's `fai` branch exercises the same E_SKETCHC_NO_SOLVER
// path the real Door/Window models hit when the planegcs solver is absent.
let rect = cad.sketch({
  geoms: [
    { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { kind: 'line', x1: 10, y1: 0, x2: 10, y2: 5 },
    { kind: 'line', x1: 10, y1: 5, x2: 0, y2: 5 },
    { kind: 'line', x1: 0, y1: 5, x2: 0, y2: 0 },
  ],
  constraints: [
    { kind: 'coincident', a: { index: 0, at: 'end' }, b: { index: 1, at: 'start' } },
    { kind: 'coincident', a: { index: 1, at: 'end' }, b: { index: 2, at: 'start' } },
    { kind: 'coincident', a: { index: 2, at: 'end' }, b: { index: 3, at: 'start' } },
    { kind: 'coincident', a: { index: 3, at: 'end' }, b: { index: 0, at: 'start' } },
    { kind: 'horizontal', of: { index: 0 } },
    { kind: 'horizontal', of: { index: 2 } },
    { kind: 'vertical', of: { index: 1 } },
    { kind: 'vertical', of: { index: 3 } },
  ],
  plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] },
}); // s8 rect