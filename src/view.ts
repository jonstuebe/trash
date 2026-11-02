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
  isViewerTurn,
  playableSlotIndexes,
  revealedCount,
  topDiscard,
} from './domain/game'
import type { Refusal } from './domain/room'
import { Message } from './message'
import {
  AppUpdate,
  Connection,
  FriendRoom,
  GUIDE_PAGE_COUNT,
  Invite,
  type Model,
  Screen,
} from './model'
import { DragSheetToDismiss } from './sheetGesture'

type H = HtmlBuilder<Message>

// A game as one device sees it: which seat is "You", and for a friend game,
// whether the socket is up.
type Table = Readonly<{
  game: Game
  viewer: number
  maybeConnection: Option.Option<Connection>
}>

const isMyTurn = (table: Table): boolean =>
  isViewerTurn(table.game, table.viewer) &&
  Option.match(table.maybeConnection, {
    onNone: () => true,
    onSome: Connection.guards.Connected,
  })

const isMe = (table: Table, playerIndex: number): boolean =>
  playerIndex === table.viewer

const displayName = (table: Table, playerIndex: number): string =>
  isMe(table, playerIndex)
    ? 'You'
    : Array.getUnsafe(table.game.players, playerIndex).name

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

const titleView = (model: Model, h: H): Html =>
  h.main(
    [h.Class('title-screen')],
    [
      titleFan(h),
      h.h1([h.Class('wordmark')], ['Trash']),
      h.p([h.Class('tagline')], ['Flip Ace through Ten before anyone else.']),
      h.div(
        [h.Class('title-actions')],
        [
          Option.match(model.maybeSavedFriendGame, {
            onNone: () => h.empty,
            onSome: () =>
              h.button(
                [
                  h.Class('pill primary'),
                  h.OnClick(Message.ClickedResumeFriendGame()),
                ],
                ['Back to your friend game'],
              ),
          }),
          h.button(
            [
              h.Class(
                `pill ${Option.isSome(model.maybeSavedFriendGame) ? 'glass' : 'primary'}`,
              ),
              h.OnClick(Message.ClickedPlayFriend()),
            ],
            ['Play a friend'],
          ),
          h.button(
            [h.Class('pill glass'), h.OnClick(Message.ClickedPlayBot())],
            ['Play the bot'],
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
  table: Table,
  player: Player,
  playerIndex: number,
  h: H,
): Html => {
  const game = table.game
  const isActive = game.currentIndex === playerIndex
  const maybeBubble = isActive
    ? actionBubbleText(player.lastAction)
    : Option.none()

  return h.keyed('li')(
    `${player.avatar}-${player.name}`,
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

const opponentsView = (table: Table, h: H): Html =>
  h.ul(
    [h.Class('opponents')],
    Array.filterMap(table.game.players, (player, index) =>
      isMe(table, index)
        ? Result.failVoid
        : Result.succeed(opponentView(table, player, index, h)),
    ),
  )

// TABLE CENTER

const heldCard = (game: Game): Option.Option<Card> =>
  Phase.guards.Holding(game.phase)
    ? Option.some(game.phase.card)
    : Option.none()

const stockView = (table: Table, h: H): Html => {
  const game = table.game
  const canDraw = isMyTurn(table) && Phase.guards.AwaitingDraw(game.phase)
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

const discardView = (table: Table, h: H): Html => {
  const game = table.game
  const isHolding = Phase.guards.Holding(game.phase)
  const canTake = isMyTurn(table) && canTakeDiscard(game)
  const canTrash =
    isMyTurn(table) &&
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

const heldView = (table: Table, h: H): Html => {
  const game = table.game
  const player = currentPlayer(game)
  const isMine = isMe(table, game.currentIndex)
  return Option.match(heldCard(game), {
    onNone: () =>
      h.div(
        [h.Class('held is-empty')],
        [h.div([h.Class('card held-placeholder glass')])],
      ),
    onSome: card =>
      h.div(
        [
          h.Class(`held ${isMine ? '' : 'is-bot'}`),
          h.Style({ '--accent': player.accent }),
        ],
        [
          looseCard(card, 'held-card', h),
          h.span(
            [h.Class('held-owner')],
            [isMine ? 'Your card' : `${player.avatar} ${player.name}`],
          ),
        ],
      ),
  })
}

const statusText = (table: Table): string => {
  const game = table.game
  const player = currentPlayer(game)
  const isLastLap = Option.isSome(game.maybeCloserIndex)

  if (
    Option.exists(
      table.maybeConnection,
      connection => !Connection.guards.Connected(connection),
    )
  ) {
    return 'Lost the connection to your game.'
  }

  if (!isMe(table, game.currentIndex)) {
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

const tableCenterView = (table: Table, h: H): Html =>
  h.section(
    [h.Class('table-center')],
    [
      h.div(
        [h.Class('piles')],
        [stockView(table, h), heldView(table, h), discardView(table, h)],
      ),
      h.p([h.Class('status'), h.AriaLive('polite')], [statusText(table)]),
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

const boardView = (table: Table, h: H): Html => {
  const game = table.game
  const human = Array.getUnsafe(game.players, table.viewer)
  const playable = isMyTurn(table)
    ? Option.match(heldCard(game), {
        onNone: () => [],
        onSome: card => playableSlotIndexes(human, card),
      })
    : []

  return h.section(
    [
      h.Class(`board ${isViewerTurn(game, table.viewer) ? 'is-active' : ''}`),
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

const reconnectBar = (connection: Connection, h: H): Html =>
  h.div(
    [h.Class('actions')],
    [
      Connection.guards.Connecting(connection)
        ? h.div(
            [h.Class('pill glass is-quiet')],
            [h.span([h.Class('thinking-dot')]), 'Reconnecting'],
          )
        : h.button(
            [h.Class('pill primary'), h.OnClick(Message.ClickedReconnect())],
            ['Reconnect'],
          ),
    ],
  )

const actionBar = (table: Table, h: H): Html => {
  const game = table.game
  const player = currentPlayer(game)

  const maybeLostConnection = Option.filter(
    table.maybeConnection,
    connection => !Connection.guards.Connected(connection),
  )
  if (Option.isSome(maybeLostConnection)) {
    return reconnectBar(maybeLostConnection.value, h)
  }

  if (!isMe(table, game.currentIndex)) {
    return h.div(
      [h.Class('actions')],
      [
        h.div(
          [
            h.Class('pill glass is-quiet'),
            h.Style({ '--accent': player.accent }),
          ],
          [
            h.span([h.Class('thinking-dot')]),
            player.seat === 'Bot'
              ? `${player.name} is thinking`
              : `Waiting for ${player.name}`,
          ],
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
  table: Table,
  finisherIndexes: ReadonlyArray<number>,
  h: H,
): Html =>
  h.ul(
    [h.Class('standings')],
    Array.map(table.game.players, (player, index) => {
      const didFinish = Array.contains(finisherIndexes, index)
      return h.keyed('li')(
        displayName(table, index),
        [h.Class(`standing ${didFinish ? 'is-finisher' : ''}`)],
        [
          h.span([h.Class('standing-emoji')], [player.avatar]),
          h.span([h.Class('standing-name')], [displayName(table, index)]),
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
  table: Table,
  finisherIndexes: ReadonlyArray<number>,
  h: H,
): Html => {
  const game = table.game
  const headline = Option.match(game.maybeCloserIndex, {
    onNone: () => 'Round over',
    onSome: closerIndex =>
      isMe(table, closerIndex)
        ? 'You cleared it!'
        : `${displayName(table, closerIndex)} cleared it`,
  })

  return sheet(
    [
      h.p([h.Class('sheet-eyebrow')], [`Round ${game.round}`]),
      h.h2([h.Class('sheet-title')], [headline]),
      h.p(
        [h.Class('sheet-body')],
        ['Everyone who finished plays one fewer card next round.'],
      ),
      standingsView(table, finisherIndexes, h),
      h.button(
        [h.Class('pill primary'), h.OnClick(Message.ClickedNextRound())],
        ['Next round'],
      ),
    ],
    'Round over',
    h,
  )
}

const gameOverSheet = (table: Table, winnerIndex: number, h: H): Html => {
  const game = table.game
  const winner = Array.getUnsafe(game.players, winnerIndex)
  const didHumanWin = isMe(table, winnerIndex)

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

const phaseSheet = (table: Table, h: H): Html =>
  Phase.matchOrElse(
    table.game.phase,
    {
      RoundOver: ({ finisherIndexes }) =>
        roundOverSheet(table, finisherIndexes, h),
      GameOver: ({ winnerIndex }) => gameOverSheet(table, winnerIndex, h),
    },
    () => h.empty,
  )

const tableView = (table: Table, h: H): Html =>
  h.main(
    [h.Class('table')],
    [
      tableHeader(table.game, h),
      opponentsView(table, h),
      tableCenterView(table, h),
      boardView(table, h),
      actionBar(table, h),
    ],
  )

// FRIEND GAME

const titleFan = (h: H): Html =>
  h.div(
    [h.Class('fan')],
    [
      fanCard({ id: 0, rank: 1, suit: 'Hearts' }, 0, h),
      fanCard({ id: 1, rank: 11, suit: 'Clubs' }, 1, h),
      fanCard({ id: 2, rank: 10, suit: 'Diamonds' }, 2, h),
    ],
  )

const backToMenuButton = (h: H): Html =>
  h.button(
    [h.Class('pill glass'), h.OnClick(Message.ClickedLeaveTable())],
    ['Back to menu'],
  )

const friendNotice = (
  heading: string,
  body: string,
  actions: ReadonlyArray<Html>,
  h: H,
): Html =>
  h.main(
    [h.Class('title-screen')],
    [
      titleFan(h),
      h.h1([h.Class('lobby-heading')], [heading]),
      h.p([h.Class('tagline')], [body]),
      h.div([h.Class('title-actions')], actions),
    ],
  )

const inviteNote = (invite: Invite): string =>
  Invite.match(invite, {
    Idle: () => '',
    Sharing: () => '',
    Copied: () => 'Link copied. Paste it into a message.',
    Failed: () => "Couldn't share the link. Read your friend the code.",
  })

const lobbyView = (
  code: string,
  invite: Invite,
  connection: Connection,
  h: H,
): Html =>
  h.main(
    [h.Class('title-screen')],
    [
      titleFan(h),
      h.h1([h.Class('lobby-heading')], ['Invite a friend']),
      h.p(
        [h.Class('tagline')],
        [
          "Send them the link. The game starts when they open it, and it'll be here when you come back.",
        ],
      ),
      h.div(
        [h.Class('room-code glass'), h.AriaLabel(`Game code ${code}`)],
        [code],
      ),
      h.p([h.Class('lobby-note'), h.AriaLive('polite')], [inviteNote(invite)]),
      h.div(
        [h.Class('title-actions')],
        [
          Connection.guards.Disconnected(connection)
            ? h.button(
                [h.Class('pill glass'), h.OnClick(Message.ClickedReconnect())],
                ['Reconnect'],
              )
            : h.empty,
          h.button(
            [
              h.Class('pill primary'),
              h.Disabled(Invite.guards.Sharing(invite)),
              h.OnClick(Message.ClickedInvite()),
            ],
            ['Send invite'],
          ),
          backToMenuButton(h),
        ],
      ),
    ],
  )

const connectingView = (connection: Connection, h: H): Html =>
  Connection.guards.Disconnected(connection)
    ? friendNotice(
        "Can't reach the game",
        'Check your connection and try again.',
        [
          h.button(
            [h.Class('pill primary'), h.OnClick(Message.ClickedReconnect())],
            ['Try again'],
          ),
          backToMenuButton(h),
        ],
        h,
      )
    : friendNotice('Joining…', 'Finding your game.', [backToMenuButton(h)], h)

const refusedView = (reason: Refusal, h: H): Html =>
  friendNotice(
    reason === 'Full' ? 'This game is full' : "This game doesn't exist",
    reason === 'Full'
      ? 'Two people are already playing it. Ask your friend for a new link.'
      : 'The link may be mistyped. Ask your friend for a new one.',
    [backToMenuButton(h)],
    h,
  )

type FriendScreen = typeof Screen.Friend.Type

const friendTable = (screen: FriendScreen, game: Game): Table => ({
  game,
  viewer: screen.seat,
  maybeConnection: Option.some(screen.connection),
})

const friendView = (screen: FriendScreen, h: H): Html =>
  FriendRoom.match(screen.room, {
    Loading: () => connectingView(screen.connection, h),
    WaitingForGuest: () =>
      lobbyView(screen.code, screen.invite, screen.connection, h),
    Playing: ({ game }) => tableView(friendTable(screen, game), h),
    Refused: ({ reason }) => refusedView(reason, h),
  })

const BOT_VIEWER = 0

const botTable = (game: Game): Table => ({
  game,
  viewer: BOT_VIEWER,
  maybeConnection: Option.none(),
})

const screenTable = (screen: Screen): Option.Option<Table> =>
  Screen.match(screen, {
    Title: () => Option.none(),
    StartingFriendGame: () => Option.none(),
    Table: ({ game }) => Option.some(botTable(game)),
    Friend: friend =>
      FriendRoom.matchOrElse(
        friend.room,
        { Playing: ({ game }) => Option.some(friendTable(friend, game)) },
        () => Option.none(),
      ),
  })

// VIEW

const TITLE_ACCENT = '#5E5CE6'

const accentFor = (model: Model): string =>
  Option.match(screenTable(model.screen), {
    onNone: () => TITLE_ACCENT,
    onSome: table => currentPlayer(table.game).accent,
  })

// UPDATE BANNER

// Floats over whatever screen is showing, like an iOS notification banner.
// The live region stays in the DOM so VoiceOver announces the banner when it
// appears.
const updateBanner = (model: Model, h: H): Html => {
  const banner = (isApplying: boolean) =>
    h.div(
      [h.Class('update-banner material')],
      [
        h.div(
          [h.Class('update-text')],
          [
            h.strong([], ['New version ready']),
            h.span([], ['Update now to get the latest Trash.']),
          ],
        ),
        h.button(
          [
            h.Class('update-action'),
            h.Disabled(isApplying),
            h.OnClick(Message.ClickedUpdateApp()),
          ],
          [isApplying ? 'Updating…' : 'Update'],
        ),
        h.button(
          [
            h.Class('update-dismiss'),
            h.AriaLabel('Not now'),
            h.Disabled(isApplying),
            h.OnClick(Message.ClickedDismissAppUpdate()),
          ],
          [xmarkIcon(h)],
        ),
      ],
    )

  return h.div(
    [h.Class('update-layer'), h.Role('status'), h.AriaLive('polite')],
    [
      AppUpdate.match(model.appUpdate, {
        None: () => h.empty,
        Available: () => banner(false),
        Applying: () => banner(true),
      }),
    ],
  )
}

export const view = (model: Model, h: H): Document => ({
  title: Option.match(screenTable(model.screen), {
    onNone: () => 'Trash',
    onSome: table => `Trash · Round ${table.game.round}`,
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
        StartingFriendGame: () =>
          friendNotice('Setting up…', 'Making your game.', [], h),
        Table: ({ game }) => tableView(botTable(game), h),
        Friend: screen => friendView(screen, h),
      }),
      Option.match(screenTable(model.screen), {
        onNone: () => h.empty,
        onSome: table => phaseSheet(table, h),
      }),
      guideDialog(model, h),
      updateBanner(model, h),
    ],
  ),
})
