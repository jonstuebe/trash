import {
  gameState,
  moveCardFromStockToWasteState,
  moveCardFromFoundationToTableauState,
  moveCardFromTableauToFoundationState,
  moveCardFromTableauToTableauState,
  moveCardFromWasteToTableauState,
  recycleWastePileToStockState,
  autoMoveCardState,
} from "../state/gameState";
import { GameState } from "../types";

// Helper function to reset the game state between tests
const resetGameState = () => {
  const initialGameState: GameState = {
    tableau: [[], [], [], [], [], [], []],
    stockPile: [
      { suit: "hearts", rank: "5", faceUp: false },
      { suit: "clubs", rank: "6", faceUp: false },
      { suit: "diamonds", rank: "7", faceUp: false },
    ],
    wastePile: [],
    foundations: [[], [], [], []],
  };
  gameState.set(initialGameState);
};

describe("GameState Management Functions", () => {
  beforeEach(() => {
    resetGameState();
  });

  test("moveCardFromStockToWasteState should move a card from stock to waste", () => {
    moveCardFromStockToWasteState();
    const state = gameState.get();
    expect(state.stockPile.length).toBe(2);
    expect(state.wastePile.length).toBe(1);
    expect(state.wastePile[0].suit).toBe("Hearts");
    expect(state.wastePile[0].rank).toBe("5");
  });

  test("moveCardFromFoundationToTableauState should move a card from foundation to tableau", () => {
    gameState.set((state) => {
      state.foundations[0].push({ suit: "hearts", rank: "A", faceUp: true });
      return state;
    });
    moveCardFromFoundationToTableauState(0, 0);
    const state = gameState.get();
    expect(state.foundations[0].length).toBe(0);
    expect(state.tableau[0].length).toBe(1);
    expect(state.tableau[0][0].suit).toBe("Hearts");
    expect(state.tableau[0][0].rank).toBe("A");
  });

  test("moveCardFromTableauToFoundationState should move a card from tableau to foundation", () => {
    gameState.set((state) => {
      state.tableau[0].push({ suit: "hearts", rank: "A", faceUp: true });
      return state;
    });
    moveCardFromTableauToFoundationState(0, 0);
    const state = gameState.get();
    expect(state.tableau[0].length).toBe(0);
    expect(state.foundations[0].length).toBe(1);
    expect(state.foundations[0][0].suit).toBe("Hearts");
    expect(state.foundations[0][0].rank).toBe("A");
  });

  test("moveCardFromTableauToTableauState should move a card from one tableau column to another", () => {
    gameState.set((state) => {
      state.tableau[0].push({ suit: "hearts", rank: "A", faceUp: true });
      return state;
    });
    moveCardFromTableauToTableauState(0, 1);
    const state = gameState.get();
    expect(state.tableau[0].length).toBe(0);
    expect(state.tableau[1].length).toBe(1);
    expect(state.tableau[1][0].suit).toBe("Hearts");
    expect(state.tableau[1][0].rank).toBe("A");
  });

  test("moveCardFromWasteToTableauState should move a card from waste to tableau", () => {
    gameState.set((state) => {
      state.wastePile.push({ suit: "hearts", rank: "A", faceUp: true });
      return state;
    });
    moveCardFromWasteToTableauState(0);
    const state = gameState.get();
    expect(state.wastePile.length).toBe(0);
    expect(state.tableau[0].length).toBe(1);
    expect(state.tableau[0][0].suit).toBe("Hearts");
    expect(state.tableau[0][0].rank).toBe("A");
  });

  test("recycleWastePileToStockState should move all cards from waste back to stock in reverse order when stock is empty", () => {
    gameState.set((state) => {
      state.wastePile = [
        { suit: "hearts", rank: "A", faceUp: true },
        { suit: "hearts", rank: "2", faceUp: true },
        { suit: "hearts", rank: "3", faceUp: true },
      ];
      state.stockPile = [];
      return state;
    });
    recycleWastePileToStockState();
    const state = gameState.get();
    expect(state.stockPile.length).toBe(3);
    expect(state.wastePile.length).toBe(0);
    expect(state.stockPile[0].suit).toBe("Hearts");
    expect(state.stockPile[0].rank).toBe("3");
    expect(state.stockPile[1].suit).toBe("Hearts");
    expect(state.stockPile[1].rank).toBe("2");
    expect(state.stockPile[2].suit).toBe("Hearts");
    expect(state.stockPile[2].rank).toBe("A");
  });

  test("autoMoveCardState should move a card from stock to waste", () => {
    autoMoveCardState();
    const state = gameState.get();
    expect(state.stockPile.length).toBe(2);
    expect(state.wastePile.length).toBe(1);
    expect(state.wastePile[0].suit).toBe("Hearts");
    expect(state.wastePile[0].rank).toBe("5");
  });
});
