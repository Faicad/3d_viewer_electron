// Smoke test for lib-electron.mjs — just import and print exports
import * as lib from '../lib-electron.mjs'

console.log('lib-electron exports:')
for (const [key, value] of Object.entries(lib)) {
  const type = typeof value
  console.log(`  ${key}: ${type}${type === 'function' ? '()' : ''}`)
}

// Check key functions exist
const required = [
  'makeMovie', 'recordOne', 'startRecording', 'syncpoint',
  'captureCover', 'animateCamera', 'callDemo',
  'setSelectValue', 'clickById', 'unloadModel', 'loadModel',
  'rotateModel', 'fitCameraToHeatbed', 'clickWithHighlight',
  'renderVideo', 'burnVideo',
  'SIZE_PRESETS', 'resolveSizePreset', 'resolveOrientationFilter',
]
const missing = required.filter(k => !(k in lib))
if (missing.length) {
  console.error('\n❌ Missing exports:', missing.join(', '))
  process.exit(1)
}
console.log('\n✅ All required exports present')
