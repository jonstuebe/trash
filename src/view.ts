import { Array, Match, Option, Result, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { Dialog } from '@foldkit/ui'

import {
  type Card,
  type Suit,
  cardName,
  isRed,
  isWild,
  rankLabel,
  slotLabel,
} from './domain/card'
import {
  type Game,
  LastAction,
  Phase,
  type Player,
  Slot,
  canTakeDiscard,
  currentPlayer,
  isHumanTurn,
  playableSlotIndexes,
  revealedCount,
  topDiscard,
} from './domain/game'
import { Message } from './message'
import { GUIDE_PAGE_COUNT, type Model, Screen } from './model'
import { DragSheetToDismiss } from './sheetGesture'

type H = HtmlBuilder<Message>

// SUITS

const SUIT_PATHS: Record<Suit, string> = {
  Hearts:
    'M12 21.4l-1.4-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4z',
  Diamonds:
    'M12 1.8c.4 0 .7.2 1 .5l6.6 8.6c.5.6.5 1.6 0 2.2L13 21.7c-.5.7-1.5.7-2 0l-6.6-8.6c-.5-.6-.5-1.6 0-2.2L11 2.3c.3-.3.6-.5 1-.5z',
  Spades:
    'M12 2C9 6 3 9.2 3 13.6c0 2.7 2.1 4.8 4.7 4.8 1.5 0 2.8-.7 3.6-1.8-.3 2-1.2 3.4-2.8 4.4h7c-1.6-1-2.5-2.4-2.8-4.4.8 1.1 2.1 1.8 3.6 1.8 2.6 0 4.7-2.1 4.7-4.8C21 9.2 15 6 12 2z',
  Clubs:
    'M12 2.5a4.3 4.3 0 0 0-3.6 6.7A4.3 4.3 0 1 0 10.8 17c-.3 1.7-1.2 3-2.6 4h7.6c-1.4-1-2.3-2.3-2.6-4a4.3 4.3 0 1 0 2.4-7.8A4.3 4.3 0 0 0 12 2.5z',
}

const suitIcon = (suit: Suit, h: H): Html =>
  h.svg(
    [h.Class('suit'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [h.path([h.D(SUIT_PATHS[suit]), h.Fill('currentColor')])],
  )

// SF Symbols' xmark, drawn as two rounded strokes.
const xmarkIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon xmark'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [
      h.path([
        h.D('M6.5 6.5l11 11M17.5 6.5l-11 11'),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('2.6'),
        h.StrokeLinecap('round'),
      ]),
    ],
  )

const trashIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [
      h.path([
        h.D(
          'M9 3h6m-9 3h12m-1.5 0-.7 12.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5.5 6M10 10.5v6M14 10.5v6',
        ),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('1.8'),
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
      ]),
    ],
  )

// CARDS

const cardFace = (card: Card, h: H): Html =>
  h.div(
    [
      h.Class(
        `card-face ${isRed(card.suit) ? 'is-red' : 'is-black'} ${isWild(card) ? 'is-wild' : ''}`,
      ),
    ],
    [
      h.span([h.Class('card-rank')], [rankLabel(card.rank)]),
      suitIcon(card.suit, h),
    ],
  )

const cardBack = (h: H, label: string): Html =>
  h.div(
    [h.Class('card-back')],
    [
      h.div([h.Class('card-back-stripes')]),
      label === '' ? h.empty : h.span([h.Class('card-back-label')], [label]),
    ],
  )

const looseCard = (card: Card, className: string, h: H): Html =>
  h.keyed('div')(
    `${className}-${card.id}`,
    [h.Class(`card ${className}`), h.AriaLabel(cardName(card))],
    [cardFace(card, h)],
  )

// TITLE

const fanCard = (card: Card, index: number, h: H): Html =>
  h.div(
    [h.Class('card fan-card'), h.Style({ '--fan-index': `${index - 1}` })],
    [cardFace(card, h)],
  )

const opponentPicker = (model: Model, h: H): Html =>
  h.div(
    [h.Class('glass picker'), h.Role('radiogroup'), h.AriaLabel('Opponents')],
    [
      h.span([h.Class('picker-label')], ['Opponents']),
      h.div(
        [h.Class('segmented')],
        Array.map([1, 2, 3], count =>
          h.button(
            [
              h.Class(
                `segment ${model.opponentCount === count ? 'is-selected' : ''}`,
              ),
              h.Role('radio'),
              h.AriaChecked(model.opponentCount === count),
              h.OnClick(Message.ClickedOpponentCount({ count })),
            ],
            [`${count}`],
          ),
        ),
      ),
    ],
  )

const titleView = (model: Model, h: H): Html =>
  h.main(
    [h.Class('title-screen')],
    [
      h.div(
        [h.Class('fan')],
        [
          fanCard({ id: 0, rank: 1, suit: 'Hearts' }, 0, h),
          fanCard({ id: 1, rank: 11, suit: 'Clubs' }, 1, h),
          fanCard({ id: 2, rank: 10, suit: 'Diamonds' }, 2, h),
        ],
      ),
      h.h1([h.Class('wordmark')], ['Trash']),
      h.p([h.Class('tagline')], ['Flip Ace through Ten before anyone else.']),
      h.div(
        [h.Class('title-actions')],
        [
          opponentPicker(model, h),
          h.button(
            [h.Class('pill primary'), h.OnClick(Message.ClickedNewGame())],
            ['New game'],
          ),
          h.button(
            [h.Class('pill glass'), h.OnClick(Message.ClickedHowToPlay())],
            ['How to play'],
          ),
        ],
      ),
    ],
  )

// OPPONENTS

const actionBubbleText = (action: LastAction): Option.Option<string> =>
  LastAction.match(action, {
    Idle: () => Option.none(),
    Drew: () => Option.some('Drew'),
    TookDiscard: ({ card }) => Option.some(`Took ${rankLabel(card.rank)}`),
    Trashed: ({ card }) => Option.some(`Trashed ${rankLabel(card.rank)}`),
    Finished: () => Option.some('Done!'),
  })

const pips = (player: Player, h: H): Html =>
  h.div(
    [h.Class('pips'), h.AriaHidden(true)],
    Array.map(player.slots, slot =>
      h.span([
        h.Class(
          Slot.match(slot, {
            Hidden: () => 'pip',
            Revealed: ({ card }) =>
              isWild(card) ? 'pip is-on is-wild' : 'pip is-on',
          }),
        ),
      ]),
    ),
  )

const opponentView = (
  game: Game,
  player: Player,
  playerIndex: number,
  h: H,
): Html => {
  const isActive = game.currentIndex === playerIndex
  const maybeBubble = isActive
    ? actionBubbleText(player.lastAction)
    : Option.none()

  return h.keyed('li')(
    player.name,
    [
      h.Class(`opponent ${isActive ? 'is-active' : ''}`),
      h.Style({ '--accent': player.accent }),
      h.AriaLabel(
        `${player.name}, ${revealedCount(player)} of ${player.target} flipped${isActive ? ', playing' : ''}`,
      ),
    ],
    [
      h.div(
        [h.Class('avatar glass')],
        [
          h.span([h.Class('avatar-emoji')], [player.avatar]),
          Option.match(maybeBubble, {
            onNone: () => h.empty,
            onSome: text =>
              h.keyed('span')(`${game.sequence}`, [h.Class('bubble')], [text]),
          }),
        ],
      ),
      h.span([h.Class('opponent-name')], [player.name]),
      h.span(
        [h.Class('opponent-score')],
        [`${revealedCount(player)}/${player.target}`],
      ),
      pips(player, h),
    ],
  )
}

const opponentsView = (game: Game, h: H): Html =>
  h.ul(
    [h.Class('opponents')],
    Array.filterMap(game.players, (player, index) =>
      player.seat === 'Bot'
        ? Result.succeed(opponentView(game, player, index, h))
        : Result.failVoid,
    ),
  )

// TABLE CENTER

const heldCard = (game: Game): Option.Option<Card> =>
  Phase.guards.Holding(game.phase)
    ? Option.some(game.phase.card)
    : Option.none()

const stockView = (game: Game, h: H): Html => {
  const canDraw = isHumanTurn(game) && Phase.guards.AwaitingDraw(game.phase)
  return h.button(
    [
      h.Class(`pile stock ${canDraw ? 'is-ready' : ''}`),
      h.AriaLabel(`Draw pile, ${game.stock.length} cards`),
      h.Disabled(!canDraw),
      h.OnClick(Message.ClickedStock()),
    ],
    [
      h.div([h.Class('card stack-card stack-2')], [cardBack(h, '')]),
      h.div([h.Class('card stack-card stack-1')], [cardBack(h, '')]),
      h.div([h.Class('card stack-card')], [cardBack(h, '')]),
      h.span([h.Class('pile-count')], [`${game.stock.length}`]),
    ],
  )
}

const discardView = (game: Game, h: H): Html => {
  const isHolding = Phase.guards.Holding(game.phase)
  const canTake = isHumanTurn(game) && canTakeDiscard(game)
  const canTrash =
    isHumanTurn(game) &&
    pipe(
      heldCard(game),
      Option.exists(card =>
        Array.isReadonlyArrayEmpty(
          playableSlotIndexes(currentPlayer(game), card),
        ),
      ),
    )

  return h.button(
    [
      h.Class(
        `pile discard ${canTake ? 'is-ready' : ''} ${canTrash ? 'is-trash-target' : ''}`,
      ),
      h.AriaLabel(
        pipe(
          topDiscard(game),
          Option.match({
            onNone: () => 'Discard pile, empty',
            onSome: card => `Discard pile, ${cardName(card)}`,
          }),
        ),
      ),
      h.Disabled(!(canTake || canTrash)),
      h.OnClick(Message.ClickedDiscardPile()),
    ],
    [
      h.div([h.Class('card pile-slot')]),
      Option.match(topDiscard(game), {
        onNone: () => h.empty,
        onSome: card => looseCard(card, 'discard-top', h),
      }),
      isHolding && canTrash
        ? h.span([h.Class('trash-badge')], [trashIcon(h)])
        : h.empty,
    ],
  )
}

const heldView = (game: Game, h: H): Html => {
  const player = currentPlayer(game)
  return Option.match(heldCard(game), {
    onNone: () =>
      h.div(
        [h.Class('held is-empty')],
        [h.div([h.Class('card held-placeholder glass')])],
      ),
    onSome: card =>
      h.div(
        [
          h.Class(`held ${player.seat === 'Bot' ? 'is-bot' : ''}`),
          h.Style({ '--accent': player.accent }),
        ],
        [
          looseCard(card, 'held-card', h),
          h.span(
            [h.Class('held-owner')],
            [
              player.seat === 'Bot'
                ? `${player.avatar} ${player.name}`
                : 'Your card',
            ],
          ),
        ],
      ),
  })
}

const statusText = (game: Game): string => {
  const player = currentPlayer(game)
  const isLastLap = Option.isSome(game.maybeCloserIndex)

  if (player.seat === 'Bot') {
    return isLastLap ? `Last turn for ${player.name}` : ''
  }

  return Phase.matchOrElse(
    game.phase,
    {
      AwaitingDraw: () =>
        isLastLap ? 'Last turn. Draw a card.' : 'Your turn. Draw a card.',
      Holding: ({ card }) =>
        Match.value(
          Array.isReadonlyArrayEmpty(playableSlotIndexes(player, card)),
        ).pipe(
          Match.withReturnType<string>(),
          Match.when(
            true,
            () => `No spot for ${rankLabel(card.rank)}. Trash it.`,
          ),
          Match.orElse(() =>
            isWild(card) ? 'Wild! Pick any card.' : 'Tap the glowing card.',
          ),
        ),
      Reshuffling: () => 'Shuffling the discards…',
      Shuffling: () => 'Dealing…',
    },
    () => '',
  )
}

const tableCenterView = (game: Game, h: H): Html =>
  h.section(
    [h.Class('table-center')],
    [
      h.div(
        [h.Class('piles')],
        [stockView(game, h), heldView(game, h), discardView(game, h)],
      ),
      h.p([h.Class('status'), h.AriaLive('polite')], [statusText(game)]),
    ],
  )

// BOARD

const slotView = (
  game: Game,
  slot: Slot,
  slotIndex: number,
  playable: ReadonlyArray<number>,
  h: H,
): Html => {
  const isPlayable = Array.contains(playable, slotIndex)
  const isRevealed = Slot.guards.Revealed(slot)
  const label = slotLabel(slotIndex)

  return h.keyed('button')(
    `round-${game.round}-slot-${slotIndex}`,
    [
      h.Class(
        `slot ${isRevealed ? 'is-revealed' : ''} ${isPlayable ? 'is-playable' : ''}`,
      ),
      h.Style({ '--deal-index': `${slotIndex}` }),
      h.AriaLabel(
        isRevealed
          ? `Spot ${label}, ${cardName(slot.card)}`
          : `Spot ${label}, face down`,
      ),
      h.Disabled(!isPlayable),
      h.OnClick(Message.ClickedSlot({ slotIndex })),
    ],
    [
      h.div(
        [h.Class('flipper')],
        [
          h.div(
            [h.Class('card side side-front')],
            [isRevealed ? cardFace(slot.card, h) : h.empty],
          ),
          h.div([h.Class('card side side-back')], [cardBack(h, label)]),
        ],
      ),
    ],
  )
}

const boardView = (game: Game, h: H): Html => {
  const human = Array.getUnsafe(game.players, 0)
  const playable = isHumanTurn(game)
    ? Option.match(heldCard(game), {
        onNone: () => [],
        onSome: card => playableSlotIndexes(human, card),
      })
    : []

  return h.section(
    [
      h.Class(`board ${isHumanTurn(game) ? 'is-active' : ''}`),
      h.AriaLabel('Your cards'),
    ],
    [
      h.div(
        [h.Class('board-header')],
        [
          h.span([h.Class('board-title')], [`${human.avatar} You`]),
          h.span(
            [h.Class('board-score')],
            [`${revealedCount(human)}/${human.target}`],
          ),
        ],
      ),
      h.div(
        [h.Class('slots')],
        Array.map(human.slots, (slot, slotIndex) =>
          slotView(game, slot, slotIndex, playable, h),
        ),
      ),
    ],
  )
}

// ACTIONS

const actionBar = (game: Game, h: H): Html => {
  const player = currentPlayer(game)

  if (player.seat === 'Bot') {
    return h.div(
      [h.Class('actions')],
      [
        h.div(
          [
            h.Class('pill glass is-quiet'),
            h.Style({ '--accent': player.accent }),
          ],
          [h.span([h.Class('thinking-dot')]), `${player.name} is thinking`],
        ),
      ],
    )
  }

  return Phase.matchOrElse(
    game.phase,
    {
      AwaitingDraw: () =>
        h.div(
          [h.Class('actions')],
          [
            h.button(
              [h.Class('pill primary'), h.OnClick(Message.ClickedStock())],
              ['Draw'],
            ),
            h.button(
              [
                h.Class('pill glass'),
                h.Disabled(!canTakeDiscard(game)),
                h.OnClick(Message.ClickedDiscardPile()),
              ],
              [
                pipe(
                  topDiscard(game),
                  Option.match({
                    onNone: () => 'Take',
                    onSome: card => `Take ${rankLabel(card.rank)}`,
                  }),
                ),
              ],
            ),
          ],
        ),
      Holding: ({ card }) =>
        Array.isReadonlyArrayEmpty(playableSlotIndexes(player, card))
          ? h.div(
              [h.Class('actions')],
              [
                h.button(
                  [h.Class('pill primary'), h.OnClick(Message.ClickedTrash())],
                  [trashIcon(h), `Trash ${rankLabel(card.rank)}`],
                ),
              ],
            )
          : h.div(
              [h.Class('actions')],
              [
                h.div(
                  [h.Class('pill glass is-quiet')],
                  [
                    isWild(card)
                      ? 'Jacks are wild'
                      : `Place your ${rankLabel(card.rank)}`,
                  ],
                ),
              ],
            ),
    },
    () =>
      h.div(
        [h.Class('actions')],
        [h.div([h.Class('pill glass is-quiet')], ['…'])],
      ),
  )
}

// SHEETS

const sheet = (children: ReadonlyArray<Html>, label: string, h: H): Html =>
  h.div(
    [h.Class('sheet-layer')],
    [
      h.div([h.Class('sheet-scrim')]),
      h.div(
        [
          h.Class('sheet material'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel(label),
        ],
        [h.div([h.Class('grabber')]), ...children],
      ),
    ],
  )

const standingsView = (
  game: Game,
  finisherIndexes: ReadonlyArray<number>,
  h: H,
): Html =>
  h.ul(
    [h.Class('standings')],
    Array.map(game.players, (player, index) => {
      const didFinish = Array.contains(finisherIndexes, index)
      return h.keyed('li')(
        player.name,
        [h.Class(`standing ${didFinish ? 'is-finisher' : ''}`)],
        [
          h.span([h.Class('standing-emoji')], [player.avatar]),
          h.span([h.Class('standing-name')], [player.name]),
          h.span(
            [h.Class('standing-detail')],
            [
              didFinish
                ? `${player.target - 1} card${player.target - 1 === 1 ? '' : 's'} next`
                : `${revealedCount(player)}/${player.target}`,
            ],
          ),
        ],
      )
    }),
  )

const roundOverSheet = (
  game: Game,
  finisherIndexes: ReadonlyArray<number>,
  h: H,
): Html => {
  const closer = pipe(
    game.maybeCloserIndex,
    Option.map(index => Array.getUnsafe(game.players, index)),
  )
  const headline = Option.match(closer, {
    onNone: () => 'Round over',
    onSome: player =>
      player.seat === 'Human' ? 'You cleared it!' : `${player.name} cleared it`,
  })

  return sheet(
    [
      h.p([h.Class('sheet-eyebrow')], [`Round ${game.round}`]),
      h.h2([h.Class('sheet-title')], [headline]),
      h.p(
        [h.Class('sheet-body')],
        ['Everyone who finished plays one fewer card next round.'],
      ),
      standingsView(game, finisherIndexes, h),
      h.button(
        [h.Class('pill primary'), h.OnClick(Message.ClickedNextRound())],
        ['Next round'],
      ),
    ],
    'Round over',
    h,
  )
}

const gameOverSheet = (game: Game, winnerIndex: number, h: H): Html => {
  const winner = Array.getUnsafe(game.players, winnerIndex)
  const didHumanWin = winner.seat === 'Human'

  return sheet(
    [
      h.div(
        [
          h.Class('winner-avatar glass'),
          h.Style({ '--accent': winner.accent }),
        ],
        [winner.avatar],
      ),
      h.h2(
        [h.Class('sheet-title')],
        [didHumanWin ? 'You win!' : `${winner.name} wins`],
      ),
      h.p(
        [h.Class('sheet-body')],
        [
          didHumanWin
            ? `Cleared the last card in round ${game.round}.`
            : `${winner.name} cleared the last card in round ${game.round}.`,
        ],
      ),
      h.button(
        [h.Class('pill primary'), h.OnClick(Message.ClickedPlayAgain())],
        ['Play again'],
      ),
      h.button(
        [h.Class('pill glass'), h.OnClick(Message.ClickedLeaveTable())],
        ['Leave table'],
      ),
    ],
    'Game over',
    h,
  )
}

// GUIDE

type GuidePage = Readonly<{
  tint: string
  headline: string
  scene: (h: H) => Html
}>

const miniCard = (card: Card, h: H): Html =>
  h.div([h.Class('card mini-card')], [cardFace(card, h)])

const miniBack = (label: string, h: H): Html =>
  h.div([h.Class('card mini-card')], [cardBack(h, label)])

const GUIDE_PAGES: ReadonlyArray<GuidePage> = [
  {
    tint: 'lavender',
    headline: 'Flip your cards from Ace to Ten.',
    scene: h =>
      h.div(
        [h.Class('guide-scene')],
        [
          miniCard({ id: 0, rank: 1, suit: 'Spades' }, h),
          miniCard({ id: 1, rank: 2, suit: 'Hearts' }, h),
          miniCard({ id: 2, rank: 3, suit: 'Clubs' }, h),
          h.div([h.Class('mini-lift')], [miniBack('4', h)]),
          miniBack('5', h),
        ],
      ),
  },
  {
    tint: 'mint',
    headline: 'Jacks are wild. Drop one anywhere.',
    scene: h =>
      h.div(
        [h.Class('guide-scene')],
        [
          miniBack('6', h),
          h.div(
            [h.Class('mini-lift is-glow')],
            [miniCard({ id: 3, rank: 11, suit: 'Diamonds' }, h)],
          ),
          miniBack('8', h),
        ],
      ),
  },
  {
    tint: 'blush',
    headline: 'Queens and Kings are trash.',
    scene: h =>
      h.div(
        [h.Class('guide-scene')],
        [
          h.div(
            [h.Class('mini-tilt is-left')],
            [miniCard({ id: 4, rank: 12, suit: 'Hearts' }, h)],
          ),
          h.div([h.Class('guide-trash glass')], [trashIcon(h)]),
          h.div(
            [h.Class('mini-tilt is-right')],
            [miniCard({ id: 5, rank: 13, suit: 'Spades' }, h)],
          ),
        ],
      ),
  },
]

const guideContent = (model: Model, render: Dialog.RenderInfo, h: H) => {
  const page = model.guidePage
  const guidePage = Array.getUnsafe(GUIDE_PAGES, page)
  const isLastPage = page === GUIDE_PAGE_COUNT - 1

  return [
    h.div([h.Class('grabber')]),
    h.div(
      [h.Class('sheet-bar')],
      [
        h.h2([...render.title, h.Class('sheet-bar-title')], ['How to play']),
        h.button(
          [...render.closeButton, h.Class('close glass'), h.AriaLabel('Close')],
          [xmarkIcon(h)],
        ),
      ],
    ),
    h.keyed('div')(
      `guide-${page}`,
      [h.Class(`guide-panel tint-${guidePage.tint}`)],
      [guidePage.scene(h)],
    ),
    h.keyed('p')(
      `guide-text-${page}`,
      [h.Class('guide-headline')],
      [guidePage.headline],
    ),
    h.div(
      [h.Class('dots')],
      Array.makeBy(GUIDE_PAGE_COUNT, index =>
        h.button([
          h.Class(`dot ${index === page ? 'is-current' : ''}`),
          h.AriaLabel(`Page ${index + 1}`),
          h.OnClick(Message.ClickedGuidePage({ page: index })),
        ]),
      ),
    ),
    h.button(
      [
        h.Class(`pill ${isLastPage ? 'primary' : 'glass'}`),
        h.OnClick(Message.ClickedGuideNext()),
      ],
      [
        isLastPage
          ? Screen.guards.Title(model.screen)
            ? "Let's play!"
            : 'Back to the game'
          : 'Next',
      ],
    ),
  ]
}

const guideDialog = (model: Model, h: H): Html =>
  h.submodel({
    slotId: 'guide-dialog',
    view: Dialog.view,
    model: model.guideDialog,
    toParentMessage: message => Message.GotGuideDialogMessage({ message }),
    viewInputs: {
      toView: render =>
        h.dialog(
          [...render.dialog, h.Class('sheet-dialog')],
          render.isVisible
            ? [
                h.div([...render.backdrop, h.Class('sheet-scrim')]),
                h.div(
                  [
                    ...render.panel,
                    h.Class('sheet material guide'),
                    h.OnMount(DragSheetToDismiss()),
                  ],
                  guideContent(model, render, h),
                ),
              ]
            : [],
        ),
    },
  })

// TABLE

const tableHeader = (game: Game, h: H): Html =>
  h.header(
    [h.Class('table-header')],
    [
      h.button(
        [
          h.Class('round-button glass'),
          h.AriaLabel('Leave table'),
          h.OnClick(Message.ClickedLeaveTable()),
        ],
        [xmarkIcon(h)],
      ),
      h.div(
        [h.Class('round-title')],
        [
          h.span([h.Class('round-eyebrow')], ['Round']),
          h.span([h.Class('round-number')], [`${game.round}`]),
        ],
      ),
      h.button(
        [
          h.Class('round-button glass'),
          h.AriaLabel('How to play'),
          h.OnClick(Message.ClickedHowToPlay()),
        ],
        ['?'],
      ),
    ],
  )

const phaseSheet = (game: Game, h: H): Html =>
  Phase.matchOrElse(
    game.phase,
    {
      RoundOver: ({ finisherIndexes }) =>
        roundOverSheet(game, finisherIndexes, h),
      GameOver: ({ winnerIndex }) => gameOverSheet(game, winnerIndex, h),
    },
    () => h.empty,
  )

const tableView = (game: Game, h: H): Html =>
  h.main(
    [h.Class('table')],
    [
      tableHeader(game, h),
      opponentsView(game, h),
      tableCenterView(game, h),
      boardView(game, h),
      actionBar(game, h),
    ],
  )

// VIEW

const accentFor = (model: Model): string =>
  Screen.match(model.screen, {
    Title: () => '#5E5CE6',
    Table: ({ game }) => currentPlayer(game).accent,
  })

export const view = (model: Model, h: H): Document => ({
  title: Screen.match(model.screen, {
    Title: () => 'Trash',
    Table: ({ game }) => `Trash · Round ${game.round}`,
  }),
  body: h.div(
    [
      h.Class(`app ${model.guideDialog.isOpen ? 'is-presenting' : ''}`),
      h.Style({ '--accent': accentFor(model) }),
    ],
    [
      h.div(
        [h.Class('aurora'), h.AriaHidden(true)],
        [
          h.div([h.Class('blob blob-a')]),
          h.div([h.Class('blob blob-b')]),
          h.div([h.Class('blob blob-c')]),
        ],
      ),
      Screen.match(model.screen, {
        Title: () => titleView(model, h),
        Table: ({ game }) => tableView(game, h),
      }),
      Screen.match(model.screen, {
        Title: () => h.empty,
        Table: ({ game }) => phaseSheet(game, h),
      }),
      guideDialog(model, h),
    ],
  ),
})
