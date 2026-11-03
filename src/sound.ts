import { Duration, Effect, Queue, Stream } from 'effect'
import { Mount } from 'foldkit'

import { type Sound } from './domain/sound'
import { Message } from './message'

// The browser side of sound effects. Every sound is synthesized with Web
// Audio, so there are no files to cache and it works offline.
//
// iOS keeps an AudioContext silent until it's started inside a tap, and
// silences it again whenever the app goes to the background. So the context
// is created and resumed in tap listeners (the Mounts below), and a sound
// plays only once a tap has started it.

// NOTE: one context for the whole page, created by the first tap that needs
// it. It lives outside the Model, and outside a ManagedResource, because the
// tap listeners must reach it synchronously: a Command runs after the tap is
// over, when iOS no longer lets it start.
// oxlint-disable-next-line foldkit/no-module-level-mutable-state
let maybeContext: AudioContext | undefined

const VOLUME = 0.16

// NOTE: read through a function so TypeScript doesn't hold on to a narrowed
// state across an await; Safari also reports 'interrupted'.
const isRunning = (context: AudioContext): boolean =>
  context.state === 'running'

// Starts audio from inside a tap. Returns whether it had to: false when the
// context was already running.
const unlockAudio = (): boolean => {
  if (typeof AudioContext === 'undefined') {
    return false
  }
  const context = maybeContext ?? new AudioContext()
  maybeContext = context
  if (isRunning(context)) {
    return false
  }
  context.resume().catch(() => undefined)
  const silence = context.createBufferSource()
  silence.buffer = context.createBuffer(1, 1, context.sampleRate)
  silence.connect(context.destination)
  silence.start()
  return true
}

type Tone = Readonly<{
  frequency: number
  endFrequency?: number
  at: number
  duration: number
  type: OscillatorType
  level?: number
}>

const playTone = (
  context: AudioContext,
  output: AudioNode,
  tone: Tone,
): void => {
  const start = context.currentTime + tone.at
  const end = start + tone.duration
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = tone.type
  oscillator.frequency.setValueAtTime(tone.frequency, start)
  if (tone.endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end)
  }
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(tone.level ?? 1, start + 0.008)
  envelope.gain.exponentialRampToValueAtTime(0.0001, end)
  oscillator.connect(envelope)
  envelope.connect(output)
  oscillator.start(start)
  oscillator.stop(end + 0.02)
}

// A short burst of noise through a band-pass filter: a card sliding off the
// pile. The noise is a fixed hash, so every draw sounds the same.
const playFlick = (context: AudioContext, output: AudioNode): void => {
  const duration = 0.08
  const length = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const samples = buffer.getChannelData(0)
  samples.forEach((_, index) => {
    const hash = Math.sin(index * 12.9898) * 43758.5453
    const fade = 1 - index / length
    samples[index] = (hash - Math.floor(hash) - 0.5) * 2 * fade * fade
  })
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  filter.Q.value = 0.9
  source.buffer = buffer
  source.connect(filter)
  filter.connect(output)
  source.start()
}

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5
const G4 = 392
const E4 = 329.63
const C4 = 261.63

const notes = (
  frequencies: ReadonlyArray<number>,
  spacing: number,
  duration: number,
  type: OscillatorType,
): ReadonlyArray<Tone> =>
  frequencies.map((frequency, index) => ({
    frequency,
    at: index * spacing,
    duration,
    type,
  }))

const TONES: Record<Exclude<Sound, 'Draw'>, ReadonlyArray<Tone>> = {
  Place: [
    {
      frequency: 520,
      endFrequency: 380,
      at: 0,
      duration: 0.09,
      type: 'triangle',
    },
  ],
  Swap: notes([C5, G5], 0.08, 0.1, 'triangle'),
  Trash: [
    {
      frequency: 320,
      endFrequency: 110,
      at: 0,
      duration: 0.2,
      type: 'sawtooth',
      level: 0.35,
    },
  ],
  Finish: notes([C5, E5, G5], 0.07, 0.13, 'triangle'),
  RoundOver: notes([G5, C6], 0.12, 0.16, 'sine'),
  Win: [
    ...notes([C5, E5, G5], 0.1, 0.14, 'triangle'),
    { frequency: C6, at: 0.3, duration: 0.45, type: 'triangle' },
  ],
  Lose: notes([G4, E4, C4], 0.09, 0.11, 'triangle'),
  Tie: notes([C5, C5], 0.13, 0.12, 'sine'),
  Reaction: notes([E5, C6], 0.06, 0.1, 'sine'),
}

const play = (context: AudioContext, sound: Sound): void => {
  const output = context.createGain()
  output.gain.value = VOLUME
  output.connect(context.destination)
  if (sound === 'Draw') {
    playFlick(context, output)
  } else {
    TONES[sound].forEach(tone => playTone(context, output, tone))
  }
}

const RESUME_WAIT = Duration.millis(300)

// Plays a sound once audio has been started by a tap. A context that's still
// starting (the tap that turned sound on) gets a moment to finish. Never
// queues a sound on a stopped context: it would play late, on the next tap.
export const playSound = (sound: Sound): Effect.Effect<void> =>
  Effect.gen(function* () {
    const context = maybeContext
    if (context === undefined) {
      return
    }
    if (!isRunning(context)) {
      yield* Effect.tryPromise(() => context.resume()).pipe(
        Effect.timeout(RESUME_WAIT),
        Effect.ignore,
      )
    }
    if (isRunning(context)) {
      yield* Effect.try(() => play(context, sound)).pipe(Effect.ignore)
    }
  })

// The sound toggle. It starts audio in the tap itself, before update hears
// about it, because iOS allows that only while handling the tap.
export const ToggleSound = Mount.defineStream('ToggleSound', {
  messages: [Message.ClickedToggleSound],
  execute: ({ element }) =>
    Stream.callback<typeof Message.ClickedToggleSound.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onClick = () => {
            unlockAudio()
            Queue.offerUnsafe(queue, Message.ClickedToggleSound())
          }
          element.addEventListener('click', onClick)
          return () => element.removeEventListener('click', onClick)
        }),
        release => Effect.sync(release),
      ).pipe(Effect.andThen(Effect.never)),
    ),
})

// Rendered only while sound is on. Any tap starts audio again if it isn't
// running: on the first tap after a reload, and after iOS has silenced it in
// the background.
export const UnlockSoundOnTap = Mount.defineStream('UnlockSoundOnTap', {
  messages: [Message.UnlockedSound],
  execute: ({ element }) =>
    Stream.callback<typeof Message.UnlockedSound.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const target = element.ownerDocument
          const onTap = () => {
            if (unlockAudio()) {
              Queue.offerUnsafe(queue, Message.UnlockedSound())
            }
          }
          target.addEventListener('touchend', onTap, true)
          target.addEventListener('click', onTap, true)
          return () => {
            target.removeEventListener('touchend', onTap, true)
            target.removeEventListener('click', onTap, true)
          }
        }),
        release => Effect.sync(release),
      ).pipe(Effect.andThen(Effect.never)),
    ),
})
