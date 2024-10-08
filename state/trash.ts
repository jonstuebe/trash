import { observable } from "@legendapp/state";
import {
  GameState,
  createGameState,
  drawCard,
  playCard,
  discardCard,
  isGameOver,
  isPlayerWinner,
} from "../logic/game";

// Initialize state
const initialState = createGameState();
export const gameState = observable<GameState>(initialState);

// State management functions
export const drawCardState = (source: "deck" | "discard") => {
  gameState.set((state) => {
    if (state.currentDrawnCard) {
      return state;
    }
    return drawCard(state, source);
  });
};

export const playCardState = (position: number) => {
  gameState.set((state) => {
    if (!state.currentDrawnCard) {
      return state;
    }
    try {
      const newState = playCard(state, position);
      if (newState.currentDrawnCard) {
        return newState;
      }
      const newPlayerIndex =
        (newState.currentPlayerIndex + 1) % newState.players.length;
      return {
        ...newState,
        currentPlayerIndex: newPlayerIndex,
      };
    } catch (error) {
      console.error(error);
      return state;
    }
  });
};

export const discardCardState = () => {
  gameState.set((state) => {
    if (!state.currentDrawnCard) {
      return state;
    }
    return discardCard(state);
  });
};

export const checkGameOver = () => {
  return isGameOver(gameState.get());
};

export const checkPlayerWinner = () => {
  return isPlayerWinner(gameState.get());
};

export const resetGame = () => {
  gameState.set(createGameState());
};
