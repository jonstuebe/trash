import { Card } from "../types";
import { getLastInStack, isCardLowerRank, isCardHigherRank } from "./utils";

describe("Utility Functions", () => {
  test("getLastInStack should return the last element in a non-empty array", () => {
    const cards: Card[] = [
      { suit: "hearts", rank: "2", faceUp: true },
      { suit: "diamonds", rank: "5", faceUp: true },
      { suit: "spades", rank: "K", faceUp: true },
    ];
    const lastCard = getLastInStack(cards);
    expect(lastCard).toEqual({ suit: "spades", rank: "K", faceUp: true });
  });

  test("getLastInStack should return null for an empty array", () => {
    const cards: Card[] = [];
    const lastCard = getLastInStack(cards);
    expect(lastCard).toBeNull();
  });

  test("isCardLowerRank should return true if the first card is lower rank", () => {
    const card1: Card = { suit: "hearts", rank: "2", faceUp: true };
    const card2: Card = { suit: "diamonds", rank: "5", faceUp: true };
    expect(isCardLowerRank(card1, card2)).toBe(true);
  });

  test("isCardLowerRank should return false if the first card is not lower rank", () => {
    const card1: Card = { suit: "hearts", rank: "K", faceUp: true };
    const card2: Card = { suit: "diamonds", rank: "5", faceUp: true };
    expect(isCardLowerRank(card1, card2)).toBe(false);
  });

  test("isCardHigherRank should return true if the first card is higher rank", () => {
    const card1: Card = { suit: "hearts", rank: "K", faceUp: true };
    const card2: Card = { suit: "diamonds", rank: "Q", faceUp: true };
    expect(isCardHigherRank(card1, card2)).toBe(true);
  });

  test("isCardHigherRank should return false if the first card is not higher rank", () => {
    const card1: Card = { suit: "hearts", rank: "3", faceUp: true };
    const card2: Card = { suit: "diamonds", rank: "5", faceUp: true };
    expect(isCardHigherRank(card1, card2)).toBe(false);
  });
});
