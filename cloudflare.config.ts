import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'trash',
    compatibilityDate: '2026-10-23',
    domains: ['trash.jonstuebe.com'],
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: 'single-page-application',
    },
  },
})
