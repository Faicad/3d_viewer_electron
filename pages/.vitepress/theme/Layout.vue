<template>
  <Layout>
    <template #layout-bottom>
      <footer class="footer-nav">
        <div class="footer-nav-inner">
          <a
            class="footer-nav-link"
            href="https://github.com/faicad/3d_viewer_electron"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="footer-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
          <span class="footer-divider">·</span>
          <span class="footer-text">v{{ version }} — LGPL-2.0</span>
          <span class="footer-divider">·</span>
          <span class="footer-text">Copyright © {{ year }} Faicad</span>
        </div>
      </footer>
      <div style="text-align:center;padding:0 32px 16px;font-size:12px;color:var(--vp-c-text-2);background:var(--vp-c-bg)">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="color:var(--vp-c-text-2);text-decoration:none">浙ICP备2026042810号</a>
      </div>
    </template>
  </Layout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import pkg from '../../../package.json'

const { Layout } = DefaultTheme
const version = pkg.version
const year = new Date().getFullYear()
</script>

<style scoped>
.footer-nav {
  margin-top: 0;
  border-top: 1px solid var(--vp-c-divider);
  padding: 24px 32px;
  text-align: center;
  background: var(--vp-c-bg);
}

.footer-nav-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 14px;
  flex-wrap: wrap;
}

.footer-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.footer-nav-link:hover {
  color: var(--vp-c-brand-1);
}

.footer-icon {
  flex-shrink: 0;
}

.footer-divider {
  color: var(--vp-c-text-3);
  user-select: none;
}

.footer-text {
  color: var(--vp-c-text-2);
}
</style>
