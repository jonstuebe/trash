import { Card, Foundations, Tableau, WastePile } from "../types";
import {
  isGameComplete,
  canMoveCard,
  canMoveCardFromTableauToTableau,
  canMoveCardFromWasteToTableau,
  canMoveCardFromTableauToFoundation,
  canMoveCardFromFoundationToTableau,
} from "./checkers";

describe("Checker Functions", () => {
  test("isGameComplete returns true for complete game", () => {
    const completeFoundations: Foundations = [
      Array(13).fill({ suit: "Hearts", rank: "A" }),
      Array(13).fill({ suit: "Diamonds", rank: "2" }),
      Array(13).fill({ suit: "Clubs", rank: "3" }),
      Array(13).fill({ suit: "Spades", rank: "4" }),
    ];
    expect(isGameComplete(completeFoundations)).toBe(true);
  });

  test("isGameComplete returns false for incomplete game", () => {
    const incompleteFoundations: Foundations = [
      Array(13).fill({ suit: "Hearts", rank: "A" }),
      Array(12).fill({ suit: "Diamonds", rank: "2" }), // Incomplete foundation
      Array(13).fill({ suit: "Clubs", rank: "3" }),
      Array(13).fill({ suit: "Spades", rank: "4" }),
    ];
    expect(isGameComplete(incompleteFoundations)).toBe(false);
  });

  test("canMoveCard returns true for valid card move", () => {
    const fromCard: Card = { suit: "Hearts", rank: "4", faceUp: true };
    const toCard: Card = { suit: "Clubs", rank: "5", faceUp: true };
    expect(canMoveCard(fromCard, toCard)).toBe(true);
  });

  test("canMoveCard returns false for invalid card move", () => {
    const fromCard: Card = { suit: "Hearts", rank: "4", faceUp: true };
    const toCard: Card = { suit: "Diamonds", rank: "5", faceUp: true };
    expect(canMoveCard(fromCard, toCard)).toBe(false);
  });

  test("canMoveCardFromTableauToTableau returns true for valid move", () => {
    const tableau: Tableau = [
      [{ suit: "Clubs", rank: "6", faceUp: true }],
      [{ suit: "Diamonds", rank: "7", faceUp: true }],
    ];
    expect(canMoveCardFromTableauToTableau(tableau, 0, 1)).toBe(true);
  });

  test("canMoveCardFromTableauToTableau returns false for invalid move", () => {
    const tableau: Tableau = [
      [{ suit: "Clubs", rank: "6", faceUp: true }],
      [{ suit: "Diamonds", rank: "5", faceUp: true }],
    ];
    expect(canMoveCardFromTableauToTableau(tableau, 0, 1)).toBe(false);
  });

  test("canMoveCardFromWasteToTableau returns true for valid move", () => {
    const wastePile: WastePile = [{ suit: "Clubs", rank: "6", faceUp: true }];
    const tableau: Tableau = [[{ suit: "Diamonds", rank: "7", faceUp: true }]];
    expect(canMoveCardFromWasteToTableau(wastePile, tableau, 0)).toBe(true);
  });

  test("canMoveCardFromWasteToTableau returns false for invalid move", () => {
    const wastePile: WastePile = [{ suit: "Clubs", rank: "6", faceUp: true }];
    const tableau: Tableau = [[{ suit: "Diamonds", rank: "5", faceUp: true }]];
    expect(canMoveCardFromWasteToTableau(wastePile, tableau, 0)).toBe(false);
  });

  test("canMoveCardFromTableauToFoundation returns true for valid move", () => {
    const tableau: Tableau = [[{ suit: "Clubs", rank: "A", faceUp: true }]]; // Ace to an empty foundation
    const foundations: Foundations = [[], [], [], []];
    expect(canMoveCardFromTableauToFoundation(tableau, foundations, 0, 0)).toBe(
      true
    );
  });

  test("canMoveCardFromTableauToFoundation returns false for invalid move", () => {
    const tableau: Tableau = [[{ suit: "Clubs", rank: "6", faceUp: true }]];
    const foundations: Foundations = [
      [{ suit: "Spades", rank: "5", faceUp: true }],
      [],
      [],
      [],
    ];
    expect(canMoveCardFromTableauToFoundation(tableau, foundations, 0, 0)).toBe(
      false
    );
  });

  test("canMoveCardFromTableauToFoundation returns true for valid move with sequential rank and same suit", () => {
    const tableau: Tableau = [[{ suit: "Clubs", rank: "6", faceUp: true }]];
    const foundations: Foundations = [
      [{ suit: "Clubs", rank: "5", faceUp: true }],
      [],
      [],
      [],
    ];
    expect(canMoveCardFromTableauToFoundation(tableau, foundations, 0, 0)).toBe(
      true
    );
  });

  test("canMoveCardFromFoundationToTableau returns true for valid move", () => {
    const foundations: Foundations = [
      [{ suit: "Clubs", rank: "6", faceUp: true }],
      [],
      [],
      [],
    ];
    const tableau: Tableau = [[{ suit: "Diamonds", rank: "7", faceUp: true }]];
    expect(canMoveCardFromFoundationToTableau(foundations, tableau, 0, 0)).toBe(
      true
    );
  });

  test("canMoveCardFromFoundationToTableau returns false for invalid move", () => {
    const foundations: Foundations = [
      [{ suit: "Clubs", rank: "6", faceUp: true }],
      [],
      [],
      [],
    ];
    const tableau: Tableau = [[{ suit: "Diamonds", rank: "5", faceUp: true }]];
    expect(canMoveCardFromFoundationToTableau(foundations, tableau, 0, 0)).toBe(
      false
    );
  });
});
