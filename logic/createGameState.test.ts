import {
  createFoundations,
  createGameState,
  createStockPile,
  createTableau,
  createWastePile,
} from "./createGameState";
import { getNewDeck } from "./deck";

describe("GameState Creation Functions", () => {
  test("createStockPile should return an empty array", () => {
    const stockPile = createStockPile();
    expect(stockPile).toEqual([]);
  });

  test("createWastePile should return an empty array", () => {
    const wastePile = createWastePile();
    expect(wastePile).toEqual([]);
  });

  test("createFoundations should return four empty arrays", () => {
    const foundations = createFoundations();
    expect(foundations).toEqual([[], [], [], []]);
  });

  test("createTableau should return an array with 7 empty arrays", () => {
    const tableau = createTableau();
    expect(tableau).toEqual([[], [], [], [], [], [], []]);
  });

  test("createGameState should return a valid initial game state", () => {
    const gameState = createGameState();
    expect(gameState).toHaveProperty("tableau");
    expect(gameState).toHaveProperty("stockPile");
    expect(gameState).toHaveProperty("wastePile");
    expect(gameState).toHaveProperty("foundations");
    expect(gameState.tableau.length).toBe(7);
    expect(gameState.foundations.length).toBe(4);
  });

  test("createGameState tableau should have correct setup", () => {
    const gameState = createGameState();

    gameState.tableau.forEach((col, index) => {
      expect(col.length).toBe(index + 1);

      col.forEach((card, cardIndex) => {
        if (cardIndex === index) {
          expect(card.faceUp).toBe(true);
        } else {
          expect(card.faceUp).toBe(false);
        }
      });
    });
  });

  test("createGameState should shuffle deck correctly", () => {
    const deck = getNewDeck();
    const gameState = createGameState();

    // Extracting only suits and ranks for comparison, ignoring faceUp property
    const tableauCards = gameState.tableau
      .flat()
      .map(({ suit, rank }) => ({ suit, rank }));
    const stockPileCards = gameState.stockPile.map(({ suit, rank }) => ({
      suit,
      rank,
    }));

    const allGameStateCards = [...tableauCards, ...stockPileCards];
    const shuffledDeck = deck.map(({ suit, rank }) => ({ suit, rank }));

    // Sorting both arrays for comparison
    const sortBySuitAndRank = (
      a: { suit: string; rank: string },
      b: { suit: string; rank: string }
    ) => {
      const suitOrder = ["Hearts", "Diamonds", "Clubs", "Spades"];
      const rankOrder = [
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
      if (a.suit !== b.suit) {
        return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      }
      return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    };

    expect(allGameStateCards.sort(sortBySuitAndRank)).toEqual(
      shuffledDeck.sort(sortBySuitAndRank)
    );
  });
});
