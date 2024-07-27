import { Card, Deck } from "../types";
import { getNewDeck } from "./deck";

describe("Deck Functions", () => {
  test("getNewDeck should return a deck with 52 unique cards", () => {
    const deck = getNewDeck();
    expect(deck.length).toBe(52);

    const cardSet = new Set(deck.map(({ suit, rank }) => `${rank} of ${suit}`));

    expect(cardSet.size).toBe(52);
  });

  test("getNewDeck should shuffle deck correctly", () => {
    const deck1 = getNewDeck();
    const deck2 = getNewDeck();

    const deck1Cards = deck1.map(({ suit, rank }) => `${rank} of ${suit}`);
    const deck2Cards = deck2.map(({ suit, rank }) => `${rank} of ${suit}`);

    // The likelihood of two shuffles being the same is extremely low
    expect(deck1Cards).not.toEqual(deck2Cards);
  });

  test("shuffleDeck should truly shuffle the deck", () => {
    const orderedDeck: Deck = [];

    const suits: string[] = ["Hearts", "Diamonds", "Clubs", "Spades"];
    const ranks: string[] = [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ];

    suits.forEach((suit) => {
      ranks.forEach((rank) => {
        orderedDeck.push({
          suit: suit as "Hearts" | "Diamonds" | "Clubs" | "Spades",
          rank: rank as
            | "A"
            | "2"
            | "3"
            | "4"
            | "5"
            | "6"
            | "7"
            | "8"
            | "9"
            | "10"
            | "J"
            | "Q"
            | "K",
          faceUp: false,
        });
      });
    });

    const shuffledDeck = getNewDeck();

    // Ensure same cards, different order
    const sortedOriginal = orderedDeck
      .map(({ suit, rank }) => `${rank} of ${suit}`)
      .sort();
    const sortedShuffled = shuffledDeck
      .map(({ suit, rank }) => `${rank} of ${suit}`)
      .sort();

    expect(sortedOriginal).toEqual(sortedShuffled);
    expect(orderedDeck).not.toEqual(shuffledDeck);
  });
});
