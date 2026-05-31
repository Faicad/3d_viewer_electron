import { defineConfig } from 'vitepress'
import pkg from '../../package.json'

export default defineConfig({
  title: 'Faicad 3D Viewer',
  description: '跨平台 3D 模型文件查看器 — 支持 STL/GLB/STEP 等 27+ 种 3D 文件格式的桌面应用，基于 Electron + Three.js',

  lang: 'zh-CN',

  head: [
    ['meta', { name: 'keywords', content: '3D viewer, STL viewer, STEP viewer, GLB viewer, 3D model viewer, CAD viewer, Three.js, Electron, faicad' }],
    ['meta', { property: 'og:title', content: 'Faicad 3D Viewer — 跨平台 3D 模型查看器' }],
    ['meta', { property: 'og:description', content: '免费开源的跨平台 3D 模型查看器，支持 STL、GLB、STEP、OBJ、FBX 等 27+ 种格式，基于 Electron + Three.js 构建' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://faicad.github.io/3d_viewer_electron/' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['link', { rel: 'canonical', href: 'https://faicad.github.io/3d_viewer_electron/' }],
  ],

  lastUpdated: true,
  cleanUrls: true,

  sitemap: {
    hostname: 'https://faicad.github.io/3d_viewer_electron/',
  },

  themeConfig: {
    siteTitle: 'Faicad 3D Viewer',

    logo: '/favicon.svg',

    search: {
      provider: 'local',
    },

    nav: [
      { text: '首页', link: '/' },
      { text: '入门指南', link: '/guide/getting-started' },
      { text: '功能特性', link: '/features/overview' },
      { text: 'GitHub', link: 'https://github.com/faicad/3d_viewer_electron' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门指南',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '安装与构建', link: '/guide/installation' },
            { text: '支持的文件格式', link: '/guide/supported-formats' },
            { text: '键盘快捷键', link: '/guide/keyboard-shortcuts' },
            { text: '配置与主题', link: '/guide/configuration' },
          ],
        },
      ],
      '/features/': [
        {
          text: '功能特性',
          items: [
            { text: '功能概览', link: '/features/overview' },
            { text: 'STEP 文件支持', link: '/features/step-support' },
            { text: 'PBR 渲染系统', link: '/features/pbr-rendering' },
          ],
        },
      ],
    },

    footer: {
      message: `v${pkg.version} — 基于 LGPL-2.0 协议开源`,
      copyright: `Copyright © ${new Date().getFullYear()} Faicad`,
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    outline: {
      label: '本页目录',
    },

    lastUpdated: {
      text: '最后更新',
    },

    darkModeSwitchLabel: '主题切换',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    langMenuLabel: '语言',
  },
})
