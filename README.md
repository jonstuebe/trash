# Trash

The card game Trash (also called Garbage), as an installable PWA with an iOS-style glass interface. You play against one to three bots.

Built with [Foldkit](https://foldkit.dev) (Effect + the Elm Architecture), Vite and `vite-plugin-pwa`.

```bash
bun install
bun dev          # http://localhost:5173
bun run test     # rules tests
bun run build    # production build with service worker and icons
bun run preview  # serve the build
```

To install it on an iPhone, open the deployed site in Safari, tap Share, then Add to Home Screen.

## Deploying

The site runs on Cloudflare Workers at [trash.jonstuebe.com](https://trash.jonstuebe.com), deployed with the [`cf` CLI](https://developers.cloudflare.com/cf/). The Worker is set up in `cloudflare.config.ts`.

- **Production:** every push to `main` builds and deploys through Cloudflare Workers Builds, which is connected to this repo.
- **Previews:** pushes to other branches deploy a Worker Preview with its own `workers.dev` URL. The production domain isn't affected.
- **By hand:** run `cf auth login` once, then `bun run deploy`.

Workers Builds settings (dashboard → Workers & Pages → trash → Settings → Builds):

| Setting         | Value                               |
| --------------- | ----------------------------------- |
| Build command   | `bun run typecheck && bun run test` |
| Deploy command  | `npx cf deploy`                     |
| Preview command | `npx cf previews deploy`            |

`cf deploy` runs the Vite build itself, so the build command only gates the deploy on checks. Use `npx` rather than `bunx` because `cf` doesn't support running under Bun.

The build writes to `.cloudflare/output/`, not `dist/`. `vite.config.ts` points `vite-plugin-pwa` at that folder so the service worker and icons ship with the build.

## Rules

- Each player has ten face-down cards for the spots Ace through Ten.
- On your turn, draw from the pile, or take the top discard if it fits one of your spots.
- Put the card in its spot face up, pick up the card that was there, and keep going.
- Jacks are wild and fill any spot. If you later get the real card for that spot, you can swap it in and play the Jack somewhere else.
- Queens, Kings, and cards with no open spot are trash and end your turn.
- When someone flips all their cards, everyone else gets one last turn. Anyone who finished plays one fewer card next round.
- The first player to finish a one-card round wins.
