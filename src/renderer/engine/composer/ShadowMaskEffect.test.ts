import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ShadowMaskEffect } from './ShadowMaskEffect'

describe('ShadowMaskEffect', () => {
  let effect: ShadowMaskEffect

  beforeEach(() => {
    effect = new ShadowMaskEffect()
  })

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates uniforms with sensible defaults', () => {
    const opacity = effect.uniforms.get('opacity')
    const softness = effect.uniforms.get('softness')
    const lightDir = effect.uniforms.get('lightDirection')

    expect(opacity).toBeDefined()
    expect(opacity!.value).toBe(0.5)
    expect(softness).toBeDefined()
    expect(softness!.value).toBe(0.35)
    expect(lightDir).toBeDefined()
    expect(lightDir!.value).toBeInstanceOf(THREE.Vector3)
  })

  it('accepts custom light direction in constructor', () => {
    const dir = new THREE.Vector3(0, -1, 0)
    const e = new ShadowMaskEffect(dir)
    expect(e.uniforms.get('lightDirection')!.value.x).toBe(0)
    expect(e.uniforms.get('lightDirection')!.value.y).toBe(-1)
    expect(e.uniforms.get('lightDirection')!.value.z).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // setLightDirection
  // ---------------------------------------------------------------------------

  it('setLightDirection updates uniform', () => {
    const dir = new THREE.Vector3(0.5, -0.5, 1)
    effect.setLightDirection(dir)
    const uniform = effect.uniforms.get('lightDirection')!
    expect(uniform.value.x).toBe(0.5)
    expect(uniform.value.y).toBe(-0.5)
    expect(uniform.value.z).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // setOpacity
  // ---------------------------------------------------------------------------

  it('setOpacity updates uniform within [0, 1]', () => {
    effect.setOpacity(0.75)
    expect(effect.uniforms.get('opacity')!.value).toBe(0.75)

    effect.setOpacity(-0.5)
    expect(effect.uniforms.get('opacity')!.value).toBe(0)

    effect.setOpacity(1.5)
    expect(effect.uniforms.get('opacity')!.value).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // setSoftness
  // ---------------------------------------------------------------------------

  it('setSoftness updates uniform within [0, 1]', () => {
    effect.setSoftness(0.6)
    expect(effect.uniforms.get('softness')!.value).toBe(0.6)

    effect.setSoftness(-0.1)
    expect(effect.uniforms.get('softness')!.value).toBe(0)

    effect.setSoftness(1.2)
    expect(effect.uniforms.get('softness')!.value).toBe(1)
  })
})
