import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'trash',
    compatibilityDate: '2026-10-23',
    domains: ['trash.jonstuebe.com'],
    // Production lives only on the custom domain. Previews get their own
    // *-trash.<subdomain>.workers.dev URL. With a custom domain set, both
    // default to off, so they're set explicitly here; otherwise each deploy
    // would switch the dashboard toggles back.
    workersDev: false,
    previewUrls: true,
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: 'single-page-application',
    },
  },
})
