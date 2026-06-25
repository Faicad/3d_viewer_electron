import { describe, it, expect } from 'vitest'
import { redactTelemetryString } from './redact'

describe('redactTelemetryString', () => {
  it('replaces Unix file paths with [path]', () => {
    const result = redactTelemetryString('Error loading /Users/alice/project/file.stl')
    expect(result).toContain('[path]')
    expect(result).not.toContain('/Users/alice')
  })

  it('replaces /home paths with [path]', () => {
    const result = redactTelemetryString('parse failed: /home/user/model.glb: bad vertex')
    expect(result).toContain('[path]')
    expect(result).not.toContain('/home/user')
  })

  it('replaces /root paths with [path]', () => {
    const result = redactTelemetryString('permission denied: /root/.secret/file.3mf')
    expect(result).toContain('[path]')
    expect(result).not.toContain('/root/')
  })

  it('replaces file:// URLs with [file-url]', () => {
    const result = redactTelemetryString('Cannot read file:///home/user/model.glb')
    expect(result).toContain('[file-url]')
    expect(result).not.toContain('file://')
  })

  it('replaces URL query strings with ?…', () => {
    const result = redactTelemetryString('https://example.com/api?token=abc&secret=xyz')
    expect(result).toContain('?…')
    expect(result).not.toContain('token=abc')
  })

  it('truncates strings exceeding maxLength', () => {
    const long = 'x'.repeat(1500)
    const result = redactTelemetryString(long, 100)
    expect(result.length).toBe(101) // 100 chars + '…'
    expect(result.endsWith('…')).toBe(true)
  })

  it('does not modify strings without sensitive patterns', () => {
    const input = 'Unsupported file format: xyz'
    const result = redactTelemetryString(input)
    expect(result).toBe(input)
  })

  it('redacts Windows-style paths with forward slashes', () => {
    const result = redactTelemetryString('Failed: C:/Users/test/Downloads/model.stl')
    expect(result).toContain('[path]')
  })
})
