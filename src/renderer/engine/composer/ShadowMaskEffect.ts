import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

const fragmentShader = /* glsl */ `
  uniform vec3 lightDirection;
  uniform float opacity;
  uniform float softness;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Compute screen-space direction of the light (simplified — uses Y-down
    // gradient that shifts based on light direction Z component to fake
    // "light is hitting from this side").
    float lightInfluence = clamp(lightDirection.z * 0.5 + 0.5, 0.0, 1.0);

    // Vertical gradient from bottom (darkest) to top (no shadow)
    float grad = smoothstep(0.0, softness, uv.y);

    // Tilt the gradient based on light direction
    float tilt = lightDirection.x * (0.5 - uv.y) * 0.3;
    grad = smoothstep(0.0, softness, uv.y + tilt);

    float mask = (1.0 - grad) * opacity * (1.0 - lightInfluence * 0.7);

    outputColor = vec4(inputColor.rgb * (1.0 - mask), inputColor.a);
  }
`

/**
 * Post-processing effect that adds a soft ground-contact shadow gradient
 * at the bottom of the frame, weighted by the scene's key light direction.
 *
 * Usage:
 * ```ts
 * const mask = new ShadowMaskEffect(lightDirection)
 * const pass = new EffectPass(camera, mask)
 * ```
 */
export class ShadowMaskEffect extends Effect {
  private _lightDir = new THREE.Vector3()

  constructor(lightDirection: THREE.Vector3 = new THREE.Vector3(0.3, -0.5, 0.8)) {
    super('ShadowMaskEffect', fragmentShader, {
      uniforms: new Map([
        ['lightDirection', new THREE.Uniform(lightDirection.clone())],
        ['opacity', new THREE.Uniform(0.5)],
        ['softness', new THREE.Uniform(0.35)],
      ]),
      attributes: EffectAttribute.NONE,
    })

    this._lightDir.copy(lightDirection)
  }

  /** Update the key light direction used to orient the shadow gradient. */
  setLightDirection(dir: THREE.Vector3): void {
    this._lightDir.copy(dir)
    this.uniforms.get('lightDirection')!.value.copy(dir)
  }

  /** Shadow opacity (0 = no shadow, 1 = fully dark). */
  setOpacity(v: number): void {
    this.uniforms.get('opacity')!.value = Math.max(0, Math.min(1, v))
  }

  /** Gradient softness (0 = hard edge, 1 = very soft). */
  setSoftness(v: number): void {
    this.uniforms.get('softness')!.value = Math.max(0, Math.min(1, v))
  }
}
