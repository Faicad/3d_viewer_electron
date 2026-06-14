import type { AIInjection } from './types'

const LAYER_ID = 'ai-layer'
const STYLE_ID = 'ai-injected-style'

/** Scope a CSS string by prepending '#ai-layer ' to each selector.
 *  Simple implementation — splits on `}` boundaries and prefixes top-level selectors.
 *  Preserves media queries and keyframes as-is. */
function scopeCSS(css: string): string {
  if (!css.trim()) return ''

  // Split rules by closing brace — handles simple cases
  const rules: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    current += ch
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        rules.push(current.trim())
        current = ''
      }
    }
  }
  // Any remaining content (unlikely) — append as-is
  if (current.trim()) rules.push(current.trim())

  return rules
    .map((rule) => {
      // Don't scope @-rules (media, keyframes, font-face, etc.)
      if (/^@/.test(rule)) return rule
      // Already scoped or contains our layer ID? skip double-scoping
      if (rule.includes(`#${LAYER_ID}`)) return rule
      // Prepend #ai-layer to the selector portion
      const braceIdx = rule.indexOf('{')
      if (braceIdx === -1) return rule
      const selector = rule.slice(0, braceIdx).trim()
      const body = rule.slice(braceIdx)
      // Handle comma-separated selectors: each gets the prefix
      const scoped = selector
        .split(',')
        .map((s) => `#${LAYER_ID} ${s.trim()}`)
        .join(', ')
      return `${scoped} ${body}`
    })
    .join('\n')
}

/** Clear all AI-injected content from #ai-layer */
function clearLayer(): void {
  const layer = document.getElementById(LAYER_ID)
  if (layer) layer.innerHTML = ''

  // Remove injected style
  const style = document.getElementById(STYLE_ID)
  if (style) style.remove()
}

/** Inject HTML into #ai-layer */
function injectHTML(html: string): void {
  const layer = document.getElementById(LAYER_ID)
  if (!layer) {
    console.warn('[ai-injection] #ai-layer not found in DOM')
    return
  }
  layer.innerHTML = html
}

/** Inject scoped CSS */
function injectCSS(css: string): void {
  if (!css.trim()) return

  // Remove previous injected style
  const old = document.getElementById(STYLE_ID)
  if (old) old.remove()

  const scoped = scopeCSS(css)
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = scoped
  document.head.appendChild(style)
}

/** Execute JS string in page context.
 *  viewerAPI and gsap are already on window as window.__viewerAPI and window.__gsap.
 *  AI code can also use window.__THREE for THREE math utilities.
 *  We wrap in a try-catch so errors don't crash the app. */
function executeJS(js: string): void {
  if (!js.trim()) return

  try {
    // Indirect eval so the code runs in global scope
    ;(0, eval)(js)
  } catch (err) {
    console.error('[ai-injection] JS execution error:', err)
    throw err
  }
}

// ---- AIInjection implementation ----

export function createAIInjection(): AIInjection {
  return {
    execute(html?: string, css?: string, js?: string, mode?: string) {
      const m = (mode ?? 'replace') as 'replace' | 'append' | 'clear'

      if (m === 'clear') {
        clearLayer()
        return
      }

      if (m === 'replace') {
        clearLayer()
        if (css) injectCSS(css)
        if (html) injectHTML(html)
        if (js) executeJS(js)
        return
      }

      if (m === 'append') {
        if (css) injectCSS(css) // append mode replaces CSS too (cumulative is fragile)
        if (html) {
          const layer = document.getElementById(LAYER_ID)
          if (layer) {
            const wrapper = document.createElement('div')
            wrapper.innerHTML = html
            while (wrapper.firstChild) {
              layer.appendChild(wrapper.firstChild)
            }
          }
        }
        if (js) executeJS(js)
        return
      }
    },
  }
}
