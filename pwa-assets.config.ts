import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // The manifest's "any" icons. The preset pads them with a transparent
    // margin, which iOS shows as a white frame (share sheet, Add to Home
    // Screen), so they fill edge to edge like the apple icon.
    transparent: {
      ...minimal2023Preset.transparent,
      padding: 0,
      resizeOptions: { background: '#000000' },
    },
    // icon.svg already has its own margins and a black background, so the
    // preset's default 30% padding just shrinks the cards.
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.1,
      resizeOptions: { background: '#000000' },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions: { background: '#000000' },
    },
    // The tab icon is public/favicon.svg, a simpler single card; see
    // scripts/favicon.ts.
    favicons: [],
  },
  images: ['public/icon.svg'],
})
