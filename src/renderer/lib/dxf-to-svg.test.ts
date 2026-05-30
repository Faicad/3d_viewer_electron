import { describe, it, expect } from 'vitest'
import { convertDxfToSvg, MINIMAL_DXF } from './dxf-to-svg'

// Re-export the minimal DXF fixture for use in tests
export { MINIMAL_DXF } from './dxf-to-svg'

describe('convertDxfToSvg', () => {
  it('converts a minimal DXF to SVG text', async () => {
    const result = await convertDxfToSvg(MINIMAL_DXF)

    // Should produce valid SVG
    expect(result.svgText).toBeTruthy()
    expect(result.svgText).toContain('<?xml version="1.0"?>')
    expect(result.svgText).toContain('<svg')
    expect(result.svgText).toContain('viewBox=')
    expect(result.svgText).toContain('</svg>')

    // Should extract dimensions from the viewBox
    expect(result.naturalWidth).toBeGreaterThan(0)
    expect(result.naturalHeight).toBeGreaterThan(0)

    // Should have at least one layer
    expect(result.layers.length).toBeGreaterThan(0)
    expect(result.layers[0]).toHaveProperty('id')
    expect(result.layers[0]).toHaveProperty('name')
    expect(result.layers[0]).toHaveProperty('visible')
  })

  it('produces SVG with the CAD Y-flip transform', async () => {
    const result = await convertDxfToSvg(MINIMAL_DXF)

    // The SVG should include the Y-flip matrix that CAD formats use
    expect(result.svgText).toContain('matrix(1,0,0,-1,0,0)')
  })

  it('handles empty-looking but valid DXF gracefully', async () => {
    const emptyDxf = `  0
SECTION
  2
HEADER
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
ENDSEC
  0
EOF
`
    // Should not throw — returns SVG with zero viewBox
    const result = await convertDxfToSvg(emptyDxf)
    expect(result.svgText).toBeTruthy()
    expect(result.svgText).toContain('<svg')
  })
})
