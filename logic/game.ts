import { Alert } from "react-native";
import { Card, Deck } from "../types";
import { getNewDeck } from "./deck";

// Game state types
export interface PlayerState {
  hand: Card[];
  layout: (Card | null)[];
}

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  currentDrawnCard: Card | null;
}

// Create initial game state
export const createGameState = (numPlayers: number): GameState => {
  const deck = getNewDeck();
  const players: PlayerState[] = [];

  for (let i = 0; i < numPlayers; i++) {
    const layout = Array(10)
      .fill(null)
      .map(() => {
        const card = deck.pop();
        return card ? { ...card, faceUp: false } : null;
      });
    players.push({
      hand: [],
      layout,
    });
  }

  return {
    players,
    deck,
    discardPile: [],
    currentPlayerIndex: 0,
    currentDrawnCard: null,
  };
};

// Helper functions
const isCardPlayable = (card: Card, position: number): boolean => {
  if (card.rank === "J") return true; // Jack can be played anywhere
  if (card.rank === "Q" || card.rank === "K") return false; // Queens and Kings are trash
  if (card.rank === "A") return position === 0; // Ace can only be played in the first position
  return card.rank === (position + 1).toString(); // Other cards must match their position
};

const shuffleDeck = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Game logic functions
export const drawCard = (
  state: GameState,
  source: "deck" | "discard"
): GameState => {
  const { deck, discardPile } = state;

  if (source === "deck") {
    if (deck.length === 0) {
      if (discardPile.length <= 1) {
        Alert.alert("No Cards Left", "Shuffling cards");
      }
      // Keep the last card in the discard pile
      const lastCard = discardPile[discardPile.length - 1];
      // Take all other cards from the discard pile
      const cardsToShuffle = discardPile.slice(0, -1);
      // Shuffle the cards
      const newDeck = shuffleDeck(cardsToShuffle);
      return {
        ...state,
        deck: newDeck,
        discardPile: [lastCard],
      };
    }

    const drawnCard = deck.pop();
    if (!drawnCard) {
      throw new Error("Failed to draw a card");
    }

    return {
      ...state,
      deck,
      currentDrawnCard: drawnCard,
    };
  } else {
    // Drawing from discard pile
    if (discardPile.length === 0) {
      throw new Error("No cards in discard pile");
    }

    const drawnCard = discardPile.pop();
    if (!drawnCard) {
      throw new Error("Failed to draw a card from discard pile");
    }

    return {
      ...state,
      discardPile,
      currentDrawnCard: drawnCard,
    };
  }
};

export const playCard = (state: GameState, position: number): GameState => {
  const { currentPlayerIndex, players, currentDrawnCard } = state;
  if (!currentDrawnCard) {
    throw new Error("No card drawn to play");
  }

  const currentPlayer = players[currentPlayerIndex];
  const newLayout = [...currentPlayer.layout];
  const oldCard = newLayout[position];

  if (!oldCard) {
    // If the position is empty, just place the card
    newLayout[position] = { ...currentDrawnCard, faceUp: true };
    return {
      ...state,
      players: [
        ...players.slice(0, currentPlayerIndex),
        { ...currentPlayer, layout: newLayout },
        ...players.slice(currentPlayerIndex + 1),
      ],
      currentDrawnCard: null,
    };
  }

  if (isCardPlayable(currentDrawnCard, position)) {
    // If the drawn card is playable, swap it with the old card
    newLayout[position] = { ...currentDrawnCard, faceUp: true };
    return {
      ...state,
      players: [
        ...players.slice(0, currentPlayerIndex),
        { ...currentPlayer, layout: newLayout },
        ...players.slice(currentPlayerIndex + 1),
      ],
      currentDrawnCard: { ...oldCard, faceUp: true },
    };
  }

  // If the drawn card is not playable and the old card is a Jack, swap them
  // But only if the drawn card is not a Queen or King
  if (
    oldCard.rank === "J" &&
    currentDrawnCard.rank !== "Q" &&
    currentDrawnCard.rank !== "K"
  ) {
    newLayout[position] = { ...currentDrawnCard, faceUp: true };
    return {
      ...state,
      players: [
        ...players.slice(0, currentPlayerIndex),
        { ...currentPlayer, layout: newLayout },
        ...players.slice(currentPlayerIndex + 1),
      ],
      currentDrawnCard: { ...oldCard, faceUp: true },
    };
  }

  // If none of the above conditions are met, the move is invalid
  Alert.alert("Invalid move", "You cannot play that card here");

  return state;
};

export const discardCard = (state: GameState): GameState => {
  const { currentDrawnCard, discardPile, currentPlayerIndex, players } = state;
  if (!currentDrawnCard) {
    throw new Error("No card to discard");
  }

  return {
    ...state,
    discardPile: [currentDrawnCard, ...discardPile],
    currentDrawnCard: null,
    currentPlayerIndex: (currentPlayerIndex + 1) % players.length,
  };
};

export const isGameOver = (state: GameState): boolean => {
  return state.players.some((player) =>
    player.layout.every((card) => card !== null && card.faceUp)
  );
};
