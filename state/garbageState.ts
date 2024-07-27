import { observable } from "@legendapp/state";
import {
  GameState,
  createGameState,
  drawCard,
  playCard,
  discardCard,
  isGameOver,
} from "../logic/garbage";

// Initialize state
const initialState = createGameState(2); // Start with 2 players
export const gameState = observable<GameState>(initialState);

// State management functions
export const drawCardState = (source: "deck" | "discard") => {
  gameState.set((state) => {
    if (state.currentDrawnCard) {
      // If there's already a drawn card, don't draw another
      return state;
    }
    return drawCard(state, source);
  });
};

export const playCardState = (position: number) => {
  gameState.set((state) => {
    if (!state.currentDrawnCard) {
      // If there's no drawn card, we can't play
      return state;
    }
    try {
      const newState = playCard(state, position);
      // If the play was successful and there's still a card in hand, don't change the player
      if (newState.currentDrawnCard) {
        return newState;
      }
      // If there's no card in hand after playing, move to the next player
      return {
        ...newState,
        currentPlayerIndex:
          (newState.currentPlayerIndex + 1) % newState.players.length,
      };
    } catch (error) {
      // If the play is invalid, just return the current state
      console.error(error);
      return state;
    }
  });
};

export const discardCardState = () => {
  gameState.set((state) => {
    if (!state.currentDrawnCard) {
      // If there's no drawn card, we can't discard
      return state;
    }
    return discardCard(state);
  });
};

export const checkGameOver = () => {
  return isGameOver(gameState.get());
};

// Reset game
export const resetGame = (numPlayers: number) => {
  gameState.set(createGameState(numPlayers));
};
