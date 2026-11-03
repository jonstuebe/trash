import { Array, Effect, Queue, Random, Stream } from 'effect'
import { Mount } from 'foldkit'

import { Message } from './message'

// Paper confetti falling over the whole screen after a win. It's drawn on
// its own canvas, frame by frame, and never goes through update: only the
// end becomes a Message. Leaving the screen removes the canvas, which stops
// the animation.

const DURATION_MS = 5000
const FADE_MS = 800
const PIECE_COUNT = 110
// Pieces start falling over this long, so they don't arrive as one wall.
const RELEASE_SPREAD_MS = 1500
// Enough for a sharp picture; more just costs frames on an older iPhone.
const MAX_PIXEL_RATIO = 2

const COLORS = [
  '#ff5a5f',
  '#ffb400',
  '#3ec300',
  '#00a6ed',
  '#7f5af0',
  '#ff7ac6',
  '#ffffff',
]

type Piece = Readonly<{
  x: number
  delayMs: number
  fallPxPerMs: number
  driftPx: number
  wobblePerMs: number
  phase: number
  spinPerMs: number
  flipPerMs: number
  width: number
  height: number
  color: string
}>

const between = (low: number, high: number): Effect.Effect<number> =>
  Random.nextBetween(low, high)

const makePiece = (width: number, height: number): Effect.Effect<Piece> =>
  Effect.gen(function* () {
    // Slow enough to drift, fast enough that the last ones clear the bottom.
    const fallPxPerMs = height / (DURATION_MS - RELEASE_SPREAD_MS)
    const colorIndex = yield* Random.nextIntBetween(0, COLORS.length - 1)
    return {
      x: yield* between(0, width),
      delayMs: yield* between(0, RELEASE_SPREAD_MS),
      fallPxPerMs: fallPxPerMs * (yield* between(0.7, 1.2)),
      driftPx: yield* between(12, 36),
      wobblePerMs: yield* between(0.0012, 0.003),
      phase: yield* between(0, Math.PI * 2),
      spinPerMs: yield* between(-0.004, 0.004),
      flipPerMs: yield* between(0.003, 0.007),
      width: yield* between(6, 10),
      height: yield* between(9, 15),
      color: COLORS[colorIndex] ?? '#ffffff',
    }
  })

const drawPiece = (
  context: CanvasRenderingContext2D,
  piece: Piece,
  elapsedMs: number,
): void => {
  const t = elapsedMs - piece.delayMs
  if (t < 0) {
    return
  }
  const y = -piece.height * 2 + t * piece.fallPxPerMs
  const x =
    piece.x + Math.sin(piece.phase + t * piece.wobblePerMs) * piece.driftPx
  // NOTE: scaling one side by the cosine of a turning angle looks like a
  // piece of paper flipping over as it falls.
  const flip = Math.cos(piece.phase + t * piece.flipPerMs)
  context.translate(x, y)
  context.rotate(piece.phase + t * piece.spinPerMs)
  context.scale(1, flip)
  context.fillStyle = piece.color
  context.fillRect(
    -piece.width / 2,
    -piece.height / 2,
    piece.width,
    piece.height,
  )
}

const prefersReducedMotion = (view: Window): boolean =>
  view.matchMedia('(prefers-reduced-motion: reduce)').matches

// Runs the animation on the canvas and calls `onDone` after the last frame.
// Returns a function that stops it early.
const rain = (
  view: Window,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  pieces: ReadonlyArray<Piece>,
  onDone: () => void,
): (() => void) => {
  const ratio = Math.min(view.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  canvas.width = Math.round(view.innerWidth * ratio)
  canvas.height = Math.round(view.innerHeight * ratio)
  let maybeStart: number | undefined
  let frame = view.requestAnimationFrame(function step(now) {
    const start = maybeStart ?? now
    maybeStart = start
    const elapsedMs = now - start
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (elapsedMs >= DURATION_MS) {
      onDone()
      return
    }
    context.globalAlpha = Math.min(1, (DURATION_MS - elapsedMs) / FADE_MS)
    context.save()
    context.scale(ratio, ratio)
    const base = context.getTransform()
    pieces.forEach(piece => {
      drawPiece(context, piece, elapsedMs)
      context.setTransform(base)
    })
    context.restore()
    frame = view.requestAnimationFrame(step)
  })
  return () => view.cancelAnimationFrame(frame)
}

export const RainConfetti = Mount.defineStream('RainConfetti', {
  messages: [Message.FinishedConfetti],
  execute: ({ element }) =>
    Stream.callback<typeof Message.FinishedConfetti.Type>(queue =>
      Effect.gen(function* () {
        const finish = () =>
          Queue.offerUnsafe(queue, Message.FinishedConfetti())
        const view = element.ownerDocument.defaultView
        const context =
          element instanceof HTMLCanvasElement ? element.getContext('2d') : null
        if (view === null || context === null || prefersReducedMotion(view)) {
          finish()
          return yield* Effect.never
        }
        const canvas = context.canvas
        const pieces = yield* Effect.forEach(
          Array.makeBy(PIECE_COUNT, () => undefined),
          () => makePiece(view.innerWidth, view.innerHeight),
        )
        yield* Effect.acquireRelease(
          Effect.sync(() => rain(view, canvas, context, pieces, finish)),
          stop => Effect.sync(stop),
        )
        return yield* Effect.never
      }),
    ),
})
