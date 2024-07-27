import {
  createGameState,
  createStockPile,
  createTableau,
  createWastePile,
  createFoundations,
} from "./createGameState";
import {
  moveCardFromStockToWaste,
  moveCardFromFoundationToTableau,
  moveCardFromTableauToFoundation,
  moveCardFromTableauToTableau,
  moveCardFromWasteToTableau,
  recycleWastePileToStock,
  autoMoveCard,
} from "./moves";
import {
  isGameComplete,
  canMoveCardFromTableauToTableau,
  canMoveCardFromWasteToTableau,
  canMoveCardFromTableauToFoundation,
  canMoveCardFromFoundationToTableau,
} from "./checkers";

// Example usage
const gameState = createGameState();

if (isGameComplete(gameState.foundations)) {
  console.log("Game is complete!");
}

export {
  createGameState,
  createStockPile,
  createTableau,
  createWastePile,
  createFoundations,
  moveCardFromStockToWaste,
  moveCardFromFoundationToTableau,
  moveCardFromTableauToFoundation,
  moveCardFromTableauToTableau,
  moveCardFromWasteToTableau,
  autoMoveCard,
  isGameComplete,
  canMoveCardFromTableauToTableau,
  canMoveCardFromWasteToTableau,
  canMoveCardFromTableauToFoundation,
  canMoveCardFromFoundationToTableau,
  recycleWastePileToStock,
};
