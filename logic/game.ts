import { Alert } from "react-native";
import { Card, Deck } from "../types";
import { getNewDeck } from "./deck";

// Game state types
export interface PlayerState {
  hand: Card[];
  layout: (Card | null)[];
  isBot: boolean; // Added to indicate if the player is a bot
}

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  currentDrawnCard: Card | null;
}

// Create initial game state
export const createGameState = (deck = getNewDeck()): GameState => {
  const players: PlayerState[] = [];

  deck = [...shuffleDeck(deck)];

  for (let i = 0; i < 2; i++) {
    const layout = Array(10)
      .fill(null)
      .map(() => {
        const card = deck.pop();
        return card ? { ...card, faceUp: false } : null;
      });
    players.push({
      hand: [],
      layout,
      isBot: i === 1, // The second player is a bot
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
        throw new Error("No cards left in the deck or discard pile");
      }
      // get the last card in the discard pile
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

    // get last card from the deck
    const drawnCard = deck[deck.length - 1];
    const newDeck = deck.slice(0, -1);
    if (!drawnCard) {
      throw new Error("Failed to draw a card");
    }

    return {
      ...state,
      deck: newDeck,
      currentDrawnCard: drawnCard,
    };
  } else {
    // Drawing from discard pile
    if (discardPile.length === 0) {
      throw new Error("No cards in discard pile");
    }

    const drawnCard = discardPile[discardPile.length - 1];
    const newDiscardPile = discardPile.slice(0, -1);

    return {
      ...state,
      discardPile: newDiscardPile,
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
    discardPile: [...discardPile, currentDrawnCard],
    currentDrawnCard: null,
    currentPlayerIndex: (currentPlayerIndex + 1) % players.length,
  };
};

export const isGameOver = (state: GameState): boolean => {
  return state.players.some((player) =>
    player.layout.every((card) => card !== null && card.faceUp)
  );
};

// New function to find the best move for the bot
export const findBestMove = (state: GameState): number | null => {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const drawnCard = state.currentDrawnCard;

  if (!drawnCard) return null;

  // If the drawn card is a Jack, find any face-down card to replace
  if (drawnCard.rank === "J") {
    const faceDownIndex = currentPlayer.layout.findIndex(
      (card) => card && !card.faceUp
    );
    if (faceDownIndex !== -1) return faceDownIndex;
  }

  // Try to play the card in its correct position
  const playableCardIndex = currentPlayer.layout.findIndex(
    (card, cardIndex) => {
      if (!card) return false;
      if (card.faceUp) return false;

      return isCardPlayable(drawnCard, cardIndex);
    }
  );

  if (playableCardIndex !== -1) {
    return playableCardIndex;
  }

  // If a face-up Jack is in a slot where the drawn card is playable, replace it
  if (drawnCard.rank !== "Q" && drawnCard.rank !== "K") {
    const jackIndex = currentPlayer.layout.findIndex(
      (card, index) =>
        card &&
        card.rank === "J" &&
        card.faceUp &&
        isCardPlayable(drawnCard, index)
    );
    if (jackIndex !== -1) return jackIndex;
  }

  // If all cards are face-up, no good move available
  return null;
};

// New function to handle the bot's turn
export const botTurn = (state: GameState): GameState => {
  if (!state.currentDrawnCard) {
    if (state.discardPile.length > 0) {
      const potentialState = drawCard(state, "discard");
      if (findBestMove(potentialState) !== null) {
        return potentialState;
      }
    }
    return drawCard(state, "deck");
  }
  const bestMove = findBestMove(state);
  if (bestMove !== null) {
    return playCard(state, bestMove);
  } else {
    return discardCard(state);
  }
};
