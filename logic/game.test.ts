import { Card, Deck } from "../types";
import { createGameState, drawCard, findBestMove } from "./game";

const testDeck: Deck = [
  { suit: "spades", rank: "A", faceUp: false },
  { suit: "spades", rank: "2", faceUp: false },
  { suit: "spades", rank: "3", faceUp: false },
  { suit: "spades", rank: "4", faceUp: false },
  { suit: "spades", rank: "5", faceUp: false },
  { suit: "spades", rank: "6", faceUp: false },
  { suit: "spades", rank: "7", faceUp: false },
  { suit: "spades", rank: "8", faceUp: false },
  { suit: "spades", rank: "9", faceUp: false },
  { suit: "spades", rank: "10", faceUp: false },
  { suit: "spades", rank: "J", faceUp: false },
  { suit: "spades", rank: "Q", faceUp: false },
  { suit: "spades", rank: "K", faceUp: false },
  { suit: "hearts", rank: "A", faceUp: false },
  { suit: "hearts", rank: "2", faceUp: false },
  { suit: "hearts", rank: "3", faceUp: false },
  { suit: "hearts", rank: "4", faceUp: false },
  { suit: "hearts", rank: "5", faceUp: false },
  { suit: "hearts", rank: "6", faceUp: false },
  { suit: "hearts", rank: "7", faceUp: false },
  { suit: "hearts", rank: "8", faceUp: false },
  { suit: "hearts", rank: "9", faceUp: false },
  { suit: "hearts", rank: "10", faceUp: false },
  { suit: "hearts", rank: "J", faceUp: false },
  { suit: "hearts", rank: "Q", faceUp: false },
  { suit: "hearts", rank: "K", faceUp: false },
  { suit: "diamonds", rank: "A", faceUp: false },
  { suit: "diamonds", rank: "2", faceUp: false },
  { suit: "diamonds", rank: "3", faceUp: false },
  { suit: "diamonds", rank: "4", faceUp: false },
  { suit: "diamonds", rank: "5", faceUp: false },
  { suit: "diamonds", rank: "6", faceUp: false },
  { suit: "diamonds", rank: "7", faceUp: false },
  { suit: "diamonds", rank: "8", faceUp: false },
  { suit: "diamonds", rank: "9", faceUp: false },
  { suit: "diamonds", rank: "10", faceUp: false },
  { suit: "diamonds", rank: "J", faceUp: false },
  { suit: "diamonds", rank: "Q", faceUp: false },
  { suit: "diamonds", rank: "K", faceUp: false },
  { suit: "clubs", rank: "A", faceUp: false },
  { suit: "clubs", rank: "2", faceUp: false },
  { suit: "clubs", rank: "3", faceUp: false },
  { suit: "clubs", rank: "4", faceUp: false },
  { suit: "clubs", rank: "5", faceUp: false },
  { suit: "clubs", rank: "6", faceUp: false },
  { suit: "clubs", rank: "7", faceUp: false },
  { suit: "clubs", rank: "8", faceUp: false },
  { suit: "clubs", rank: "9", faceUp: false },
  { suit: "clubs", rank: "10", faceUp: false },
  { suit: "clubs", rank: "J", faceUp: false },
  { suit: "clubs", rank: "Q", faceUp: false },
  { suit: "clubs", rank: "K", faceUp: false },
];

describe("findBestMove", () => {
  it("replaces Ace card", () => {
    const layout: Card[] = [
      { suit: "hearts", rank: "3", faceUp: false },
      { suit: "diamonds", rank: "7", faceUp: false },
      { suit: "clubs", rank: "A", faceUp: false },
      { suit: "spades", rank: "5", faceUp: false },
      { suit: "hearts", rank: "9", faceUp: false },
      { suit: "diamonds", rank: "K", faceUp: false },
      { suit: "clubs", rank: "2", faceUp: false },
      { suit: "spades", rank: "J", faceUp: false },
      { suit: "hearts", rank: "6", faceUp: false },
      { suit: "diamonds", rank: "Q", faceUp: false },
    ];

    const deck = testDeck.filter(
      (card) =>
        !layout.some(
          (layoutCard) =>
            layoutCard.suit === card.suit && layoutCard.rank === card.rank
        )
    );

    const bestMove = findBestMove({
      currentDrawnCard: deck[0],
      currentPlayerIndex: 0,
      deck: deck.slice(1),
      players: [
        {
          layout,
          hand: [],
          isBot: false,
        },
      ],
      discardPile: [],
    });

    expect(deck[0]).toEqual({
      suit: "spades",
      rank: "A",
      faceUp: false,
    });
    expect(bestMove).toEqual(0);
  });

  it("replaces Ace card", () => {
    const layout: Card[] = [
      { suit: "clubs", rank: "A", faceUp: true },
      { suit: "hearts", rank: "3", faceUp: false },
      { suit: "diamonds", rank: "7", faceUp: false },
      { suit: "spades", rank: "5", faceUp: false },
      { suit: "hearts", rank: "9", faceUp: false },
      { suit: "diamonds", rank: "K", faceUp: false },
      { suit: "clubs", rank: "2", faceUp: false },
      { suit: "spades", rank: "J", faceUp: false },
      { suit: "hearts", rank: "6", faceUp: false },
      { suit: "diamonds", rank: "Q", faceUp: false },
    ];

    const deck = testDeck.filter(
      (card) =>
        !layout.some(
          (layoutCard) =>
            layoutCard.suit === card.suit && layoutCard.rank === card.rank
        )
    );

    const bestMove = findBestMove({
      currentDrawnCard: deck[0],
      currentPlayerIndex: 0,
      deck: deck.slice(1),
      players: [
        {
          layout,
          hand: [],
          isBot: false,
        },
      ],
      discardPile: [],
    });

    expect(deck[0]).toEqual({
      suit: "spades",
      rank: "A",
      faceUp: false,
    });
    expect(bestMove).toEqual(0);
  });
});
