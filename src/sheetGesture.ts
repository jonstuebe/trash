import { Effect, Queue, Stream } from 'effect'
import { Mount } from 'foldkit'

import { Message } from './message'

// Drag-to-dismiss for a bottom sheet, like UIKit's sheet presentation.
//
// The drag itself never goes through update: it writes `--sheet-drag` on the
// panel and `--sheet-progress` on the enclosing dialog every pointer move,
// and only the decision to dismiss becomes a Message. The leave transition
// then starts from wherever the finger let go.

const ENGAGE_DISTANCE_PX = 6
const DISMISS_FRACTION = 0.28
const DISMISS_VELOCITY_PX_PER_MS = 0.55
const VELOCITY_WINDOW_MS = 90

type Sample = Readonly<{ y: number; time: number }>

const rubberBand = (overshoot: number): number => -Math.sqrt(overshoot) * 4

export const DragSheetToDismiss = Mount.defineStream('DragSheetToDismiss', {
  messages: [Message.SwipedDownGuide],
  execute: ({ element }) =>
    Stream.callback<typeof Message.SwipedDownGuide.Type>(queue =>
      Effect.gen(function* () {
        const panel = element
        if (!(panel instanceof HTMLElement)) {
          return yield* Effect.never
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const layer = panel.closest('dialog') ?? panel
            let maybeStart: Sample | undefined
            let samples: Array<Sample> = []
            let isDragging = false

            const setOffset = (offset: number) => {
              panel.style.setProperty('--sheet-drag', `${offset}px`)
              layer.style.setProperty(
                '--sheet-progress',
                `${Math.max(0, offset) / panel.offsetHeight}`,
              )
            }

            const reset = () => {
              maybeStart = undefined
              samples = []
              isDragging = false
              delete panel.dataset.dragging
            }

            const onDown = (event: PointerEvent) => {
              if (event.button !== 0) {
                return
              }
              maybeStart = { y: event.clientY, time: event.timeStamp }
              samples = [maybeStart]
            }

            const onMove = (event: PointerEvent) => {
              if (maybeStart === undefined) {
                return
              }
              const distance = event.clientY - maybeStart.y
              if (!isDragging) {
                if (Math.abs(distance) < ENGAGE_DISTANCE_PX) {
                  return
                }
                isDragging = true
                panel.dataset.dragging = ''
                // Throws if the pointer is already gone; the drag still works
                // without capture as long as the finger stays on the sheet.
                try {
                  panel.setPointerCapture(event.pointerId)
                } catch {
                  // ignore
                }
              }
              samples = [
                ...samples.filter(
                  sample => event.timeStamp - sample.time < VELOCITY_WINDOW_MS,
                ),
                { y: event.clientY, time: event.timeStamp },
              ]
              setOffset(distance >= 0 ? distance : rubberBand(-distance))
            }

            const onUp = (event: PointerEvent) => {
              if (maybeStart === undefined || !isDragging) {
                reset()
                return
              }
              const distance = event.clientY - maybeStart.y
              const oldest = samples[0] ?? maybeStart
              const elapsed = Math.max(1, event.timeStamp - oldest.time)
              const velocity = (event.clientY - oldest.y) / elapsed
              const isDismissing =
                distance > 0 &&
                (distance > panel.offsetHeight * DISMISS_FRACTION ||
                  velocity > DISMISS_VELOCITY_PX_PER_MS)

              reset()
              if (isDismissing) {
                Queue.offerUnsafe(queue, Message.SwipedDownGuide())
              } else {
                setOffset(0)
              }
            }

            // A drag that engaged must not also click whatever it started on.
            const onClick = (event: MouseEvent) => {
              if (panel.dataset.dragged !== undefined) {
                event.stopPropagation()
                event.preventDefault()
                delete panel.dataset.dragged
              }
            }

            const onUpCapture = () => {
              if (isDragging) {
                panel.dataset.dragged = ''
                window.setTimeout(() => delete panel.dataset.dragged, 0)
              }
            }

            panel.addEventListener('pointerdown', onDown)
            panel.addEventListener('pointermove', onMove)
            panel.addEventListener('pointerup', onUpCapture, true)
            panel.addEventListener('pointerup', onUp)
            panel.addEventListener('pointercancel', onUp)
            panel.addEventListener('click', onClick, true)

            return () => {
              panel.removeEventListener('pointerdown', onDown)
              panel.removeEventListener('pointermove', onMove)
              panel.removeEventListener('pointerup', onUpCapture, true)
              panel.removeEventListener('pointerup', onUp)
              panel.removeEventListener('pointercancel', onUp)
              panel.removeEventListener('click', onClick, true)
              layer.style.removeProperty('--sheet-progress')
            }
          }),
          release => Effect.sync(release),
        )
        return yield* Effect.never
      }),
    ),
})
