import {
  StockPile,
  WastePile,
  Tableau,
  Foundations,
  GameState,
} from "../types";

export const moveCardFromStockToWaste = (
  stockPile: StockPile,
  wastePile: WastePile
): { stockPile: StockPile; wastePile: WastePile } => {
  if (stockPile.length === 0) {
    throw new Error("No cards in stock pile to move to waste pile.");
  }

  // Draw one card from the stock pile and add it to the waste pile
  const updatedWastePile = [...wastePile, stockPile[0]];
  const updatedStockPile = stockPile.slice(1);

  return { stockPile: updatedStockPile, wastePile: updatedWastePile };
};

export const moveCardFromFoundationToTableau = (
  foundations: Foundations,
  tableau: Tableau,
  foundationIndex: number,
  tableauIndex: number
): { foundations: Foundations; tableau: Tableau } => {
  const card = foundations[foundationIndex].pop();
  if (!card) throw new Error("No card to move from foundation.");

  tableau[tableauIndex].push(card);
  return { foundations, tableau };
};

export const moveCardFromTableauToFoundation = (
  tableau: Tableau,
  foundations: Foundations,
  tableauIndex: number,
  foundationIndex: number
): { tableau: Tableau; foundations: Foundations } => {
  const card = tableau[tableauIndex].pop();
  if (!card) throw new Error("No card to move from tableau.");

  foundations[foundationIndex].push(card);
  return { tableau, foundations };
};

export const moveCardFromTableauToTableau = (
  tableau: Tableau,
  fromIndex: number,
  toIndex: number
): Tableau => {
  const movingCard = tableau[fromIndex].pop();
  if (!movingCard) throw new Error("No card to move.");

  tableau[toIndex].push(movingCard);
  return tableau;
};

export const moveCardFromWasteToTableau = (
  wastePile: WastePile,
  tableau: Tableau,
  tableauIndex: number
): { wastePile: WastePile; tableau: Tableau } => {
  const card = wastePile.pop();
  if (!card) throw new Error("No card to move from waste.");

  tableau[tableauIndex].push(card);
  return { wastePile, tableau };
};

export const recycleWastePileToStock = (
  stockPile: StockPile,
  wastePile: WastePile
): { stockPile: StockPile; wastePile: WastePile } => {
  if (stockPile.length > 0) {
    throw new Error("Stock pile is not empty, cannot recycle waste pile.");
  }
  return { stockPile: [...wastePile.reverse()], wastePile: [] };
};

export const autoMoveCard = (gameState: GameState): GameState => {
  const { stockPile, wastePile, tableau, foundations } = gameState;

  if (stockPile.length > 0) {
    const updated = moveCardFromStockToWaste(stockPile, wastePile);
    return {
      ...gameState,
      stockPile: updated.stockPile,
      wastePile: updated.wastePile,
    };
  }

  throw new Error("No valid auto-move found.");
};
