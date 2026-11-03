import { Array, Match, Option, Order, Result, pipe } from 'effect'
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
import {
  GameSummary,
  PLAYER_NAME_MAX_LENGTH,
  type Refusal,
  cleanPlayerName,
  roomCodeFromInput,
} from './domain/room'
import { type Stats, type Tally, hasPlayed, winRate } from './domain/stats'
import { Message } from './message'
import {
  AfterNaming,
  AppUpdate,
  Connection,
  type FriendGameRow,
  FriendRoom,
  GUIDE_PAGE_COUNT,
  GameStatus,
  Guide,
  HomeScreen,
  Invite,
  type Model,
  Screen,
  SoundSetting,
  StatsStep,
  TurnAlerts,
} from './model'
import { DragSheetToDismiss } from './sheetGesture'
import { ToggleSound, UnlockSoundOnTap } from './sound'
import { AskForTurnAlerts } from './turnAlerts'

type H = HtmlBuilder<Message>

// A game as one device sees it: which seat is "You", and for a friend game,
// whether the socket is up and whether turn alerts are on.
type Table = Readonly<{
  game: Game
  viewer: number
  maybeConnection: Option.Option<Connection>
  maybeTurnAlerts: Option.Option<TurnAlerts>
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

// Ionicons' close-outline and help-outline (MIT), which stand in for SF
// Symbols: Apple licenses those only for apps on its own platforms.
const xmarkIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon glyph xmark'), h.ViewBox('0 0 512 512'), h.AriaHidden(true)],
    [
      h.path([
        h.D('M368 368 144 144M368 144 144 368'),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('32'),
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
      ]),
    ],
  )

const questionmarkIcon = (h: H): Html =>
  h.svg(
    [
      h.Class('icon glyph questionmark'),
      h.ViewBox('0 0 512 512'),
      h.AriaHidden(true),
    ],
    [
      h.path([
        h.D(
          'M160 164s1.44-33 33.54-59.46C212.6 88.83 235.49 84.28 256 84c18.73-.23 35.47 2.94 45.48 7.82C318.59 100.2 352 120.6 352 164c0 45.67-29.18 66.37-62.35 89.18S248 298.36 248 324',
        ),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('40'),
        h.StrokeLinecap('round'),
        h.StrokeMiterlimit('10'),
      ]),
      h.circle([
        h.Cx('248'),
        h.Cy('399.99'),
        h.R('32'),
        h.Fill('currentColor'),
      ]),
    ],
  )

const strokeIcon = (className: string, d: string, h: H): Html =>
  h.svg(
    [h.Class(`icon ${className}`), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [
      h.path([
        h.D(d),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('1.8'),
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
      ]),
    ],
  )

// Safari's Share button: a box with an arrow out of the top.
const shareIcon = (h: H): Html =>
  strokeIcon(
    'share',
    'M12 3v12M8 7l4-4 4 4M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2',
    h,
  )

// Add to Home Screen's icon: a plus in a rounded square.
const addSquareIcon = (h: H): Html =>
  strokeIcon(
    'add-square',
    'M12 8v8M8 12h8M7 3.5h10A3.5 3.5 0 0 1 20.5 7v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5z',
    h,
  )

// Chrome's menu button.
const menuDotsIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon menu-dots'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    Array.map([5, 12, 19], cy =>
      h.circle([h.Cx('12'), h.Cy(`${cy}`), h.R('2'), h.Fill('currentColor')]),
    ),
  )

// Ionicons' trash-outline (MIT).
const trashIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon'), h.ViewBox('0 0 512 512'), h.AriaHidden(true)],
    [
      h.path([
        h.D(
          'M112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320M80 112h352M192 112V72a23.93 23.93 0 0 1 24-24h80a23.93 23.93 0 0 1 24 24v40M256 176v224M184 176l8 224M328 176l-8 224',
        ),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('32'),
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
      ]),
    ],
  )

// A speaker, with sound waves when sound is on and a cross when it's off.
const speakerIcon = (sound: SoundSetting, h: H): Html =>
  strokeIcon(
    'speaker',
    SoundSetting.match(sound, {
      On: () =>
        'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
      Off: () => 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
    }),
    h,
  )

// The sound toggle, on the menu and in the table header. Its Mount starts
// audio inside the tap, which iOS requires.
const soundButton = (sound: SoundSetting, className: string, h: H): Html =>
  h.button(
    [
      h.Class(`round-button glass ${className}`),
      h.AriaLabel('Sound effects'),
      h.AriaPressed(SoundSetting.guards.On(sound) ? 'true' : 'false'),
      h.OnMount(ToggleSound()),
    ],
    [speakerIcon(sound, h)],
  )

const bellIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [
      h.path([
        h.D(
          'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2.2 2.2 0 0 0 4 0',
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

// The game list, the ones waiting on this player first.
const rowPriority = (row: FriendGameRow): number =>
  GameStatus.match(row.status, {
    Unknown: () => 2,
    Known: ({ summary }) =>
      GameSummary.match(summary, {
        YourTurn: () => 0,
        BetweenRounds: () => 1,
        TheirTurn: () => 3,
        WaitingForGuest: () => 4,
        Over: () => 5,
        Ended: () => 5,
        Missing: () => 6,
        NotSeated: () => 6,
      }),
  })

const sortedRows = (
  rows: ReadonlyArray<FriendGameRow>,
): ReadonlyArray<FriendGameRow> =>
  Array.sortWith(rows, rowPriority, Order.Number)

type RowText = Readonly<{ title: string; detail: string; isUrgent: boolean }>

const rowText = (row: FriendGameRow): RowText =>
  GameStatus.match(row.status, {
    Unknown: () => ({
      title: `Game ${row.code}`,
      detail: 'Tap to open',
      isUrgent: false,
    }),
    Known: ({ summary }) =>
      GameSummary.match(summary, {
        WaitingForGuest: () => ({
          title: 'Invite sent',
          detail: `Code ${row.code} · Not joined yet`,
          isUrgent: false,
        }),
        YourTurn: ({ opponentName, round }) => ({
          title: opponentName,
          detail: `Your turn · Round ${round}`,
          isUrgent: true,
        }),
        TheirTurn: ({ opponentName, round }) => ({
          title: opponentName,
          detail: `Their turn · Round ${round}`,
          isUrgent: false,
        }),
        BetweenRounds: ({ opponentName, round }) => ({
          title: opponentName,
          detail: `Round ${round} is over · Deal the next one`,
          isUrgent: true,
        }),
        Over: ({ opponentName, didWin }) => ({
          title: opponentName,
          detail: didWin ? 'You won · Play again?' : `${opponentName} won`,
          isUrgent: false,
        }),
        Ended: ({ opponentName, round, outcome }) => ({
          title: opponentName,
          detail: `${
            outcome === 'Won'
              ? 'You won'
              : outcome === 'Lost'
                ? `${opponentName} won`
                : 'Tied'
          } · Ended after round ${round}`,
          isUrgent: false,
        }),
        Missing: () => ({
          title: `Game ${row.code}`,
          detail: 'This game has ended',
          isUrgent: false,
        }),
        NotSeated: () => ({
          title: `Game ${row.code}`,
          detail: 'This game is full',
          isUrgent: false,
        }),
      }),
  })

const chevronIcon = (h: H): Html =>
  h.svg(
    [h.Class('icon chevron'), h.ViewBox('0 0 24 24'), h.AriaHidden(true)],
    [
      h.path([
        h.D('m9 5 7 7-7 7'),
        h.Fill('none'),
        h.Stroke('currentColor'),
        h.StrokeWidth('2'),
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
      ]),
    ],
  )

const gameRowView = (row: FriendGameRow, h: H): Html => {
  const text = rowText(row)
  return h.keyed('li')(
    row.code,
    [h.Class(`game-row glass ${text.isUrgent ? 'is-urgent' : ''}`)],
    [
      h.button(
        [
          h.Class('game-row-open'),
          h.AriaLabel(`${text.title}, ${text.detail}`),
          h.OnClick(Message.ClickedResumeFriendGame({ code: row.code })),
        ],
        [
          h.span([h.Class('game-row-dot'), h.AriaHidden(true)]),
          h.span(
            [h.Class('game-row-text')],
            [
              h.strong([h.Class('game-row-title')], [text.title]),
              h.span([h.Class('game-row-detail')], [text.detail]),
            ],
          ),
          chevronIcon(h),
        ],
      ),
      h.button(
        [
          h.Class('game-row-remove'),
          h.AriaLabel(`Remove ${text.title} from your games`),
          h.OnClick(Message.ClickedRemoveFriendGame({ code: row.code })),
        ],
        [xmarkIcon(h)],
      ),
    ],
  )
}

const gameListView = (model: Model, h: H): Html =>
  Array.match(model.friendGames, {
    onEmpty: () => h.empty,
    onNonEmpty: rows =>
      h.section(
        [h.Class('game-list'), h.AriaLabelledBy('game-list-heading')],
        [
          h.header(
            [h.Class('game-list-header')],
            [
              h.h2([h.Id('game-list-heading')], ['Your games']),
              Option.match(model.maybePlayerName, {
                onNone: () => h.empty,
                onSome: name =>
                  h.button(
                    [
                      h.Class('game-list-name'),
                      h.AriaLabel(`Playing as ${name}. Change your name`),
                      h.OnClick(Message.ClickedChangeName()),
                    ],
                    [`Playing as ${name}`],
                  ),
              }),
            ],
          ),
          h.ul(
            [h.Class('game-rows')],
            Array.map(sortedRows(rows), row => gameRowView(row, h)),
          ),
        ],
      ),
  })

// Offered on a phone that's playing in the browser. The Home Screen app is
// where turn alerts work on an iPhone.
const getTheAppLink = (homeScreen: HomeScreen, h: H): Html =>
  HomeScreen.match(homeScreen, {
    Added: () => h.empty,
    Unavailable: () => h.empty,
    AddOnIos: () => getTheAppButton(h),
    AddOnAndroid: () => getTheAppButton(h),
  })

const getTheAppButton = (h: H): Html =>
  h.button(
    [h.Class('get-app'), h.OnClick(Message.ClickedGetTheApp())],
    [addSquareIcon(h), 'Add Trash to your Home Screen'],
  )

const titleView = (model: Model, h: H): Html =>
  h.main(
    [
      h.Class(
        `title-screen ${Array.isReadonlyArrayNonEmpty(model.friendGames) ? 'has-games' : ''}`,
      ),
    ],
    [
      soundButton(model.sound, 'title-sound', h),
      titleFan(h),
      h.h1([h.Class('wordmark')], ['Trash']),
      h.p([h.Class('tagline')], ['Flip Ace through Ten before anyone else.']),
      gameListView(model, h),
      h.div(
        [h.Class('title-actions')],
        [
          getTheAppLink(model.homeScreen, h),
          h.div(
            [h.Class('pill-row')],
            [
              h.button(
                [
                  h.Class('pill primary'),
                  h.OnClick(Message.ClickedPlayFriend()),
                ],
                ['Play a friend'],
              ),
              h.button(
                [
                  h.Class('pill glass'),
                  h.OnClick(Message.ClickedJoinWithCode()),
                ],
                ['Join with code'],
              ),
            ],
          ),
          h.button(
            [h.Class('pill glass'), h.OnClick(Message.ClickedPlayBot())],
            ['Play the bot'],
          ),
          h.div(
            [h.Class('pill-row')],
            [
              h.button(
                [h.Class('pill glass'), h.OnClick(Message.ClickedHowToPlay())],
                ['How to play'],
              ),
              h.button(
                [h.Class('pill glass'), h.OnClick(Message.ClickedStats())],
                ['Stats'],
              ),
            ],
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
        Option.match(table.maybeTurnAlerts, {
          onNone: () => h.empty,
          onSome: turnAlerts => alertsButton(turnAlerts, 'Alert me', h),
        }),
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
      h.button(
        [h.Class('pill glass'), h.OnClick(Message.ClickedEndGame())],
        ["I'm done"],
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

// Someone called the game off between rounds; the targets are already what
// each player would have played next.
const endedSheet = (
  table: Table,
  enderIndex: number,
  maybeWinnerIndex: Option.Option<number>,
  h: H,
): Html => {
  const game = table.game
  const headline = Option.match(maybeWinnerIndex, {
    onNone: () => "It's a tie",
    onSome: winnerIndex =>
      isMe(table, winnerIndex)
        ? 'You win!'
        : `${displayName(table, winnerIndex)} wins`,
  })
  const ender = isMe(table, enderIndex) ? 'You' : displayName(table, enderIndex)

  return sheet(
    [
      h.p([h.Class('sheet-eyebrow')], [`After round ${game.round}`]),
      h.h2([h.Class('sheet-title')], [headline]),
      h.p(
        [h.Class('sheet-body')],
        [`${ender} ended the game. Fewest cards left wins.`],
      ),
      h.ul(
        [h.Class('standings')],
        Array.map(game.players, (player, index) =>
          h.keyed('li')(
            displayName(table, index),
            [
              h.Class(
                `standing ${Option.contains(maybeWinnerIndex, index) ? 'is-finisher' : ''}`,
              ),
            ],
            [
              h.span([h.Class('standing-emoji')], [player.avatar]),
              h.span([h.Class('standing-name')], [displayName(table, index)]),
              h.span(
                [h.Class('standing-detail')],
                [`${player.target} card${player.target === 1 ? '' : 's'} left`],
              ),
            ],
          ),
        ),
      ),
      // A friend game has no rematch after it's ended; a bot game can just
      // start over.
      Option.isNone(table.maybeConnection)
        ? h.button(
            [h.Class('pill primary'), h.OnClick(Message.ClickedPlayAgain())],
            ['Play again'],
          )
        : h.empty,
      h.button(
        [
          h.Class(
            `pill ${Option.isNone(table.maybeConnection) ? 'glass' : 'primary'}`,
          ),
          h.OnClick(Message.ClickedLeaveTable()),
        ],
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

const sheetBar = (title: string, render: Dialog.RenderInfo, h: H) => [
  h.div([h.Class('grabber')]),
  h.div(
    [h.Class('sheet-bar')],
    [
      h.h2([...render.title, h.Class('sheet-bar-title')], [title]),
      h.button(
        [...render.closeButton, h.Class('close glass'), h.AriaLabel('Close')],
        [xmarkIcon(h)],
      ),
    ],
  ),
]

const howToPlayContent = (
  model: Model,
  page: number,
  render: Dialog.RenderInfo,
  h: H,
) => {
  const guidePage = Array.getUnsafe(GUIDE_PAGES, page)
  const isLastPage = page === GUIDE_PAGE_COUNT - 1

  return [
    ...sheetBar('How to play', render, h),
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

type InstallStep = Readonly<{ icon: (h: H) => Html; text: string }>

type InstallText = Readonly<{
  intro: string
  steps: ReadonlyArray<InstallStep>
  note: string
}>

const appIcon = (h: H): Html =>
  h.img([h.Class('app-icon'), h.Src('/icon.svg'), h.Alt('')])

const OPEN_FROM_HOME_SCREEN: InstallStep = {
  icon: appIcon,
  text: 'Open Trash from your Home Screen.',
}

// NOTE: on an iPhone, the Home Screen app keeps its own storage, apart from
// Safari's, so the games and name from Safari don't follow the player there.
const installText = (homeScreen: HomeScreen): InstallText =>
  HomeScreen.match(homeScreen, {
    AddOnIos: () => ({
      intro:
        "Trash plays best from your Home Screen: full screen, and it can alert you when it's your turn.",
      steps: [
        {
          icon: shareIcon,
          text: "Tap Share in Safari. If you don't see it, tap ••• first.",
        },
        {
          icon: addSquareIcon,
          text: 'Scroll down, tap Add to Home Screen, then Add.',
        },
        OPEN_FROM_HOME_SCREEN,
      ],
      note: 'The app starts fresh: games you began in Safari stay in Safari. To join a friend there, tap Join with code.',
    }),
    AddOnAndroid: () => ({
      intro:
        "Trash plays best from your Home Screen: full screen, and it can alert you when it's your turn.",
      steps: [
        { icon: menuDotsIcon, text: 'Tap the ⋮ menu in Chrome.' },
        {
          icon: addSquareIcon,
          text: 'Tap Add to Home screen or Install app, then Install.',
        },
        OPEN_FROM_HOME_SCREEN,
      ],
      note: 'An invite link may still open in Chrome. To join a friend in the app, tap Join with code.',
    }),
    Added: () => ({
      intro: 'Trash is already on your Home Screen.',
      steps: [],
      note: 'To join a friend, tap Join with code and type in the code they sent.',
    }),
    Unavailable: () => ({
      intro:
        'Open Trash in the browser on your phone, then add it to your Home Screen from the Share or ⋮ menu.',
      steps: [],
      note: 'To join a friend there, tap Join with code and type in the code they sent.',
    }),
  })

const getTheAppContent = (
  homeScreen: HomeScreen,
  render: Dialog.RenderInfo,
  h: H,
) => {
  const text = installText(homeScreen)
  return [
    ...sheetBar('Get the app', render, h),
    h.p([h.Class('install-intro')], [text.intro]),
    Array.match(text.steps, {
      onEmpty: () => h.empty,
      onNonEmpty: steps =>
        h.ol(
          [h.Class('install-steps')],
          Array.map(steps, (step, index) =>
            h.li(
              [h.Class('install-step glass')],
              [
                h.span([h.Class('install-number')], [`${index + 1}`]),
                h.span([h.Class('install-text')], [step.text]),
                h.span([h.Class('install-icon')], [step.icon(h)]),
              ],
            ),
          ),
        ),
    }),
    h.p([h.Class('install-note')], [text.note]),
    h.button(
      [h.Class('pill primary'), h.OnClick(Message.ClickedGuideNext())],
      ['Got it'],
    ),
  ]
}

// STATS

type StatsRow = Readonly<{ label: string; value: (tally: Tally) => string }>

const NO_VALUE = '–'

const percent = (share: number): string => `${Math.round(share * 100)}%`

const STATS_ROWS: ReadonlyArray<StatsRow> = [
  { label: 'Played', value: tally => `${tally.played}` },
  { label: 'Won', value: tally => `${tally.won}` },
  { label: 'Lost', value: tally => `${tally.lost}` },
  { label: 'Tied', value: tally => `${tally.tied}` },
  { label: 'Ended early', value: tally => `${tally.endedEarly}` },
  {
    label: 'Win rate',
    value: tally =>
      Option.match(winRate(tally), {
        onNone: () => NO_VALUE,
        onSome: percent,
      }),
  },
  { label: 'Win streak', value: tally => `${tally.currentStreak}` },
  { label: 'Best streak', value: tally => `${tally.bestStreak}` },
  {
    label: 'Fewest rounds',
    value: tally =>
      Option.match(tally.maybeFewestRoundsToWin, {
        onNone: () => NO_VALUE,
        onSome: rounds => `${rounds}`,
      }),
  },
]

const statsTable = (stats: Stats, h: H): Html => {
  const columns: ReadonlyArray<Tally> = [stats.bot, stats.friends, stats.total]
  return h.table(
    [h.Class('stats-table')],
    [
      h.thead(
        [],
        [
          h.tr(
            [],
            [
              h.td([]),
              ...Array.map(['Bot', 'Friends', 'Total'], heading =>
                h.th([h.Scope('col')], [heading]),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(STATS_ROWS, row =>
          h.tr(
            [],
            [
              h.th([h.Scope('row')], [row.label]),
              ...Array.map(columns, tally => h.td([], [row.value(tally)])),
            ],
          ),
        ),
      ),
    ],
  )
}

const statsEmpty = (h: H): Html =>
  h.div(
    [h.Class('stats-empty')],
    [
      h.p([h.Class('stats-empty-title')], ['No games yet']),
      h.p(
        [h.Class('stats-empty-body')],
        [
          'Finish a game against the bot or a friend and how it went shows up here.',
        ],
      ),
    ],
  )

const statsReset = (step: StatsStep, h: H): Html =>
  StatsStep.match(step, {
    Viewing: () =>
      h.button(
        [h.Class('pill is-quiet'), h.OnClick(Message.ClickedResetStats())],
        ['Reset stats'],
      ),
    ConfirmingReset: () =>
      h.div(
        [h.Class('stats-confirm')],
        [
          h.p(
            [h.Class('stats-confirm-text')],
            ['Reset all stats on this device? This can’t be undone.'],
          ),
          h.div(
            [h.Class('pill-row')],
            [
              h.button(
                [
                  h.Class('pill glass'),
                  h.OnClick(Message.ClickedCancelResetStats()),
                ],
                ['Cancel'],
              ),
              h.button(
                [
                  h.Class('pill destructive'),
                  h.OnClick(Message.ClickedConfirmResetStats()),
                ],
                ['Reset'],
              ),
            ],
          ),
        ],
      ),
  })

const statsContent = (
  stats: Stats,
  step: StatsStep,
  render: Dialog.RenderInfo,
  h: H,
) => [
  ...sheetBar('Stats', render, h),
  ...(hasPlayed(stats)
    ? [statsTable(stats, h), statsReset(step, h)]
    : [statsEmpty(h)]),
  StatsStep.guards.Viewing(step)
    ? h.button(
        [h.Class('pill primary'), h.OnClick(Message.ClickedGuideNext())],
        ['Done'],
      )
    : h.empty,
]

const guideContent = (model: Model, render: Dialog.RenderInfo, h: H) =>
  Guide.match(model.guide, {
    HowToPlay: ({ page }) => howToPlayContent(model, page, render, h),
    GetTheApp: () => getTheAppContent(model.homeScreen, render, h),
    Stats: ({ step }) => statsContent(model.stats, step, render, h),
  })

const guideSheetClass = (guide: Guide): string =>
  Guide.match(guide, {
    HowToPlay: () => '',
    GetTheApp: () => 'is-install',
    Stats: () => 'is-stats',
  })

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
                    h.Class(
                      `sheet material guide ${guideSheetClass(model.guide)}`,
                    ),
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

const tableHeader = (game: Game, sound: SoundSetting, h: H): Html =>
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
      h.div(
        [h.Class('table-header-actions')],
        [
          soundButton(sound, '', h),
          h.button(
            [
              h.Class('round-button glass'),
              h.AriaLabel('How to play'),
              h.OnClick(Message.ClickedHowToPlay()),
            ],
            [questionmarkIcon(h)],
          ),
        ],
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
      Ended: ({ enderIndex, maybeWinnerIndex }) =>
        endedSheet(table, enderIndex, maybeWinnerIndex, h),
    },
    () => h.empty,
  )

const tableView = (table: Table, sound: SoundSetting, h: H): Html =>
  h.main(
    [h.Class('table')],
    [
      tableHeader(table.game, sound, h),
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

// Shown while the player can still turn alerts on; once they're on, or can't
// be, alertsNote explains instead.
const alertsButton = (turnAlerts: TurnAlerts, label: string, h: H): Html => {
  const button = (isAsking: boolean) =>
    h.button(
      [
        h.Class('pill glass'),
        h.Disabled(isAsking),
        h.OnMount(AskForTurnAlerts()),
      ],
      [bellIcon(h), isAsking ? 'Turning on…' : label],
    )
  return TurnAlerts.matchOrElse(
    turnAlerts,
    {
      Off: () => button(false),
      Failed: () => button(false),
      Asking: () => button(true),
      NeedsHomeScreen: () =>
        h.button(
          [h.Class('pill glass'), h.OnClick(Message.ClickedGetTheApp())],
          [bellIcon(h), label],
        ),
    },
    () => h.empty,
  )
}

const alertsNote = (turnAlerts: TurnAlerts): string =>
  TurnAlerts.matchOrElse(
    turnAlerts,
    {
      On: () => "You'll get an alert when it's your turn.",
      Blocked: () => 'Alerts are off for Trash. Turn them on in Settings.',
      NeedsHomeScreen: () =>
        'Add Trash to your Home Screen to get an alert on your turn.',
      Failed: () => "Couldn't turn on alerts. Try again.",
    },
    () => '',
  )

const inviteNote = (invite: Invite): string =>
  Invite.match(invite, {
    Idle: () => '',
    Sharing: () => '',
    Copied: ({ kind }) =>
      kind === 'Code'
        ? 'Code copied. Paste it into a message.'
        : 'Invite copied. Paste it into a message.',
    Failed: () => "Couldn't share the link. Read your friend the code.",
  })

const lobbyView = (
  code: string,
  invite: Invite,
  connection: Connection,
  turnAlerts: TurnAlerts,
  h: H,
): Html =>
  h.main(
    [h.Class('title-screen is-lobby')],
    [
      titleFan(h),
      h.h1([h.Class('lobby-heading')], ['Invite a friend']),
      h.p(
        [h.Class('tagline')],
        [
          "Send them the link, or have them tap Join with code and type this in. The game starts when they join, and it'll be here when you come back.",
        ],
      ),
      h.div(
        [h.Class('room-code glass')],
        [
          h.span([h.AriaLabel(`Game code ${code}`)], [code]),
          h.button(
            [
              h.Class('room-code-share'),
              h.AriaLabel('Share the code'),
              h.Disabled(Invite.guards.Sharing(invite)),
              h.OnClick(Message.ClickedShareCode()),
            ],
            [shareIcon(h)],
          ),
        ],
      ),
      h.p(
        [h.Class('lobby-note'), h.AriaLive('polite')],
        [inviteNote(invite) || alertsNote(turnAlerts)],
      ),
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
          alertsButton(turnAlerts, 'Alert me on my turn', h),
          h.div(
            [h.Class('pill-row')],
            [
              backToMenuButton(h),
              h.button(
                [
                  h.Class('pill glass'),
                  h.OnClick(Message.ClickedCancelInvite()),
                ],
                ['Cancel invite'],
              ),
            ],
          ),
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
    reason === 'Full' ? 'This game is full' : 'This game is gone',
    reason === 'Full'
      ? 'Two people are already playing it. Ask your friend for a new link.'
      : 'The code may be mistyped, or the game was cleared after a while with no moves. Check the code with your friend.',
    [backToMenuButton(h)],
    h,
  )

type FriendScreen = typeof Screen.Friend.Type

type NamingScreen = typeof Screen.Naming.Type

type JoiningScreen = typeof Screen.JoiningGame.Type

type NamingText = Readonly<{
  heading: string
  body: string
  submit: string
}>

const namingText = (next: AfterNaming): NamingText =>
  AfterNaming.match(next, {
    StartGame: () => ({
      heading: "What's your name?",
      body: "Your friend sees it while you play. You'll only be asked once.",
      submit: 'Continue',
    }),
    OpenGame: ({ intent }) =>
      intent === 'Join'
        ? {
            heading: "You're invited",
            body: 'Add your name so your friend knows who joined.',
            submit: 'Join game',
          }
        : {
            heading: "What's your name?",
            body: 'Your friend sees it while you play.',
            submit: 'Continue',
          },
    BackToMenu: () => ({
      heading: 'Your name',
      body: 'Your friends see it in every game you play.',
      submit: 'Save',
    }),
  })

const NAME_INPUT_ID = 'player-name'

const namingView = (screen: NamingScreen, h: H): Html => {
  const text = namingText(screen.next)
  const isReady = Option.isSome(cleanPlayerName(screen.draft))
  return h.main(
    [h.Class('title-screen is-naming')],
    [
      titleFan(h),
      h.h1([h.Class('lobby-heading')], [text.heading]),
      h.p([h.Class('tagline')], [text.body]),
      h.form(
        [h.Class('naming-form'), h.OnSubmit(Message.SubmittedName())],
        [
          h.label([h.Class('sr-only'), h.For(NAME_INPUT_ID)], ['Your name']),
          h.input([
            h.Id(NAME_INPUT_ID),
            h.Class('name-input glass'),
            h.Type('text'),
            h.Value(screen.draft),
            h.Placeholder('Your name'),
            h.Maxlength(PLAYER_NAME_MAX_LENGTH),
            h.Autocomplete('nickname'),
            h.Autocapitalize('words'),
            h.Spellcheck(false),
            h.EnterKeyHint('done'),
            h.Autofocus(true),
            h.OnInput(value => Message.UpdatedNameDraft({ value })),
          ]),
          h.div(
            [h.Class('title-actions')],
            [
              h.button(
                [
                  h.Class('pill primary'),
                  h.Type('submit'),
                  h.Disabled(!isReady),
                ],
                [text.submit],
              ),
              h.button(
                [
                  h.Class('pill glass'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedCancelNaming()),
                ],
                ['Cancel'],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const JOIN_CODE_INPUT_ID = 'join-code'

const joiningView = (screen: JoiningScreen, h: H): Html => {
  const isReady = Option.isSome(roomCodeFromInput(screen.draft))
  return h.main(
    [h.Class('title-screen is-naming')],
    [
      titleFan(h),
      h.h1([h.Class('lobby-heading')], ['Join a game']),
      h.p(
        [h.Class('tagline')],
        ['Type the code your friend sent you, or paste their invite.'],
      ),
      h.form(
        [h.Class('naming-form'), h.OnSubmit(Message.SubmittedJoinCode())],
        [
          h.label([h.Class('sr-only'), h.For(JOIN_CODE_INPUT_ID)], ['Code']),
          h.input([
            h.Id(JOIN_CODE_INPUT_ID),
            h.Class('name-input code-input glass'),
            h.Type('text'),
            h.Value(screen.draft),
            h.Placeholder('K7QXMP'),
            h.Autocomplete('off'),
            h.Autocapitalize('characters'),
            h.Spellcheck(false),
            h.EnterKeyHint('go'),
            h.Autofocus(true),
            h.OnInput(value => Message.UpdatedJoinCodeDraft({ value })),
          ]),
          h.div(
            [h.Class('title-actions')],
            [
              h.button(
                [
                  h.Class('pill primary'),
                  h.Type('submit'),
                  h.Disabled(!isReady),
                ],
                ['Join game'],
              ),
              h.button(
                [
                  h.Class('pill glass'),
                  h.Type('button'),
                  h.OnClick(Message.ClickedCancelJoining()),
                ],
                ['Cancel'],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const friendTable = (
  screen: FriendScreen,
  game: Game,
  turnAlerts: TurnAlerts,
): Table => ({
  game,
  viewer: screen.seat,
  maybeConnection: Option.some(screen.connection),
  maybeTurnAlerts: Option.some(turnAlerts),
})

const friendView = (
  screen: FriendScreen,
  turnAlerts: TurnAlerts,
  sound: SoundSetting,
  h: H,
): Html =>
  FriendRoom.match(screen.room, {
    Loading: () => connectingView(screen.connection, h),
    WaitingForGuest: () =>
      lobbyView(screen.code, screen.invite, screen.connection, turnAlerts, h),
    Playing: ({ game }) =>
      tableView(friendTable(screen, game, turnAlerts), sound, h),
    Refused: ({ reason }) => refusedView(reason, h),
  })

const BOT_VIEWER = 0

const botTable = (game: Game): Table => ({
  game,
  viewer: BOT_VIEWER,
  maybeConnection: Option.none(),
  maybeTurnAlerts: Option.none(),
})

const screenTable = (model: Model): Option.Option<Table> =>
  Screen.match(model.screen, {
    Title: () => Option.none(),
    Naming: () => Option.none(),
    JoiningGame: () => Option.none(),
    StartingFriendGame: () => Option.none(),
    Table: ({ game }) => Option.some(botTable(game)),
    Friend: friend =>
      FriendRoom.matchOrElse(
        friend.room,
        {
          Playing: ({ game }) =>
            Option.some(friendTable(friend, game, model.turnAlerts)),
        },
        () => Option.none(),
      ),
  })

// VIEW

const TITLE_ACCENT = '#5E5CE6'

const accentFor = (model: Model): string =>
  Option.match(screenTable(model), {
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
  title: Option.match(screenTable(model), {
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
        Naming: screen => namingView(screen, h),
        JoiningGame: screen => joiningView(screen, h),
        StartingFriendGame: () =>
          friendNotice('Setting up…', 'Making your game.', [], h),
        Table: ({ game }) => tableView(botTable(game), model.sound, h),
        Friend: screen => friendView(screen, model.turnAlerts, model.sound, h),
      }),
      Option.match(screenTable(model), {
        onNone: () => h.empty,
        onSome: table => phaseSheet(table, h),
      }),
      guideDialog(model, h),
      updateBanner(model, h),
      SoundSetting.guards.On(model.sound)
        ? h.div([h.Hidden(true), h.OnMount(UnlockSoundOnTap())])
        : h.empty,
    ],
  ),
})
