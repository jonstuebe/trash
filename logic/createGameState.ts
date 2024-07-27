import {
  GameState,
  StockPile,
  WastePile,
  Foundations,
  Tableau,
  Deck,
} from "../types";
import { getNewDeck } from "./deck";

export const createStockPile = (): StockPile => [];
export const createWastePile = (): WastePile => [];
export const createFoundations = (): Foundations => [[], [], [], []];
export const createTableau = (): Tableau => [[], [], [], [], [], [], []];

const canWinGame = (gameState: GameState): boolean => {
  // Simplistic check for solvability, to be implemented properly based on game rules
  return true;
};

export const createGameState = (): GameState => {
  let gameState: GameState;
  do {
    const deck = getNewDeck();
    const tableau = createTableau();
    const stockPile = createStockPile();
    const wastePile = createWastePile();
    const foundations = createFoundations();

    // Distribute cards to tableau in the initial state as per Klondike rules
    let deckIndex = 0;
    for (let i = 0; i < tableau.length; i++) {
      for (let j = 0; j <= i; j++) {
        tableau[i].push({ ...deck[deckIndex++], faceUp: j === i });
      }
    }

    // Remaining cards go into the stockPile
    while (deckIndex < deck.length) {
      stockPile.push(deck[deckIndex++]);
    }

    gameState = { tableau, stockPile, wastePile, foundations };
  } while (!canWinGame(gameState));

  return gameState;
};
