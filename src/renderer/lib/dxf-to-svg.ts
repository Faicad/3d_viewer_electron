/**
 * DXF to SVG converter using @linkiez/dxf-renew.
 *
 * Converts DXF text to an SVG string, then reuses the existing
 * parseSvgLayers/parseSvgViewBox utilities so the result flows
 * through the existing SVG workspace pipeline unchanged.
 */

import { parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import type { SvgLayer } from '@/stores/model-store'

export interface DxfConversionResult {
  svgText: string
  layers: SvgLayer[]
  naturalWidth: number
  naturalHeight: number
}

/**
 * Convert DXF text to an SVG string that reuses the existing SVG workspace pipeline.
 *
 * Uses a DYNAMIC import of @linkiez/dxf-renew so the (large) DXF WASM/JS bundle
 * is only loaded when a DXF file is actually opened — not at app startup.
 */
export async function convertDxfToSvg(dxfText: string): Promise<DxfConversionResult> {
  const { parseString, toSVG } = await import('@linkiez/dxf-renew')

  const parsed = parseString(dxfText)
  const svgText = toSVG(parsed)

  // Reuse existing SVG utilities to extract metadata
  const layers = parseSvgLayers(svgText)
  const { naturalWidth, naturalHeight } = parseSvgViewBox(svgText)

  return { svgText, layers, naturalWidth, naturalHeight }
}

/**
 * Minimal valid DXF (R12 ASCII) fixture for tests.
 * Draws an L-shape (two lines) and a circle across two layers ("0" and "Walls").
 */
export const MINIMAL_DXF = `  0
SECTION
  2
HEADER
  9
$EXTMIN
 10
0.0
 20
0.0
  9
$EXTMAX
 10
100.0
 20
100.0
  0
ENDSEC
  0
SECTION
  2
TABLES
  0
TABLE
  2
LAYER
  0
LAYER
  2
0
 70
0
 62
7
  6
CONTINUOUS
  0
LAYER
  2
Walls
 70
0
 62
1
  6
CONTINUOUS
  0
ENDTAB
  0
ENDSEC
  0
SECTION
  2
BLOCKS
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
0
 10
10.0
 20
10.0
 11
90.0
 21
10.0
  0
LINE
  8
Walls
 10
90.0
 20
10.0
 11
90.0
 21
90.0
  0
CIRCLE
  8
Walls
 10
50.0
 20
50.0
 40
30.0
  0
ENDSEC
  0
EOF
`
