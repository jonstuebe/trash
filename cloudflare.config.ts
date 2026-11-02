import { defineConfig, exports } from 'cf/config'

import * as entrypoint from './worker/index.ts' with { type: 'cf-worker' }

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
    // The Worker only serves friend games. Everything else, including bot
    // games, is static assets that the service worker caches for offline play.
    entrypoint,
    // The Worker reaches Room through ctx.exports, not an env binding. A
    // binding names the Worker (script_name), which may point a preview at
    // production's rooms; ctx.exports gets each preview its own storage.
    exports: {
      Room: exports.durableObject({ storage: 'sqlite' }),
    },
    assets: {
      notFoundHandling: 'single-page-application',
      runWorkerFirst: ['/api/*'],
    },
  },
})
