export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export type Deck = Card[];
export type Tableau = Card[][];
export type StockPile = Card[];
export type WastePile = Card[];
export type Foundations = Card[][]; // Four arrays, one for each suit

export interface GameState {
  tableau: Tableau;
  stockPile: StockPile;
  wastePile: WastePile;
  foundations: Foundations;
}
