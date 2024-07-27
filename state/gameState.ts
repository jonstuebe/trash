import { batch, observable } from "@legendapp/state";
import { undoRedo } from "@legendapp/state/helpers/undoRedo";
import {
  autoMoveCard,
  createGameState,
  moveCardFromFoundationToTableau,
  moveCardFromStockToWaste,
  moveCardFromTableauToFoundation,
  moveCardFromTableauToTableau,
  moveCardFromWasteToTableau,
  recycleWastePileToStock,
} from "../logic";
import { GameState } from "../types";

// Initialize state
const initialState = createGameState();
export const gameState = observable<GameState>(initialState);

// Add undo/redo functionality
const undoRedoState = undoRedo(gameState);

// Undo/Redo management functions
export const undo = () => {
  undoRedoState.undo();
};

export const redo = () => {
  undoRedoState.redo();
};

// State management functions with tracking
export const moveCardFromStockToWasteState = () => {
  batch(() => {
    const stockPile = gameState.stockPile.get();
    const wastePile = gameState.wastePile.get();
    const updated = moveCardFromStockToWaste(stockPile, wastePile);

    // Update observable state
    gameState.stockPile.set(updated.stockPile);
    gameState.wastePile.set(updated.wastePile);
  });
};

export const moveCardFromFoundationToTableauState = (
  foundationIndex: number,
  tableauIndex: number
) => {
  batch(() => {
    const foundations = gameState.foundations.get();
    const tableau = gameState.tableau.get();
    const updated = moveCardFromFoundationToTableau(
      foundations,
      tableau,
      foundationIndex,
      tableauIndex
    );

    // Update observable state
    gameState.foundations.set(updated.foundations);
    gameState.tableau.set(updated.tableau);
  });
};

export const moveCardFromTableauToFoundationState = (
  tableauIndex: number,
  foundationIndex: number
) => {
  batch(() => {
    const tableau = gameState.tableau.get();
    const foundations = gameState.foundations.get();
    const updated = moveCardFromTableauToFoundation(
      tableau,
      foundations,
      tableauIndex,
      foundationIndex
    );

    // Update observable state
    gameState.tableau.set(updated.tableau);
    gameState.foundations.set(updated.foundations);
  });
};

export const moveCardFromTableauToTableauState = (
  fromIndex: number,
  toIndex: number
) => {
  batch(() => {
    const tableau = gameState.tableau.get();
    const updatedTableau = moveCardFromTableauToTableau(
      tableau,
      fromIndex,
      toIndex
    );

    // Update observable state
    gameState.tableau.set(updatedTableau);
  });
};

export const moveCardFromWasteToTableauState = (tableauIndex: number) => {
  batch(() => {
    const wastePile = gameState.wastePile.get();
    const tableau = gameState.tableau.get();
    const updated = moveCardFromWasteToTableau(
      wastePile,
      tableau,
      tableauIndex
    );

    // Update observable state
    gameState.wastePile.set(updated.wastePile);
    gameState.tableau.set(updated.tableau);
  });
};

export const recycleWastePileToStockState = () => {
  batch(() => {
    const stockPile = gameState.stockPile.get();
    const wastePile = gameState.wastePile.get();
    if (stockPile.length === 0 && wastePile.length > 0) {
      const updated = recycleWastePileToStock(stockPile, wastePile);

      // Update observable state
      gameState.stockPile.set(updated.stockPile);
      gameState.wastePile.set(updated.wastePile);
    }
  });
};

export const autoMoveCardState = () => {
  batch(() => {
    const currentState = gameState.get();
    const updatedGameState = autoMoveCard(currentState);

    // Update observable state
    gameState.set(updatedGameState);
  });
};
