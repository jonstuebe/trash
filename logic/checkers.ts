import { Card, Tableau, Foundations, WastePile } from "../types";
import { getLastInStack, isCardHigherRank, isCardLowerRank } from "./utils";

const oppositeColors = (suit1: string, suit2: string) => {
  const redSuits = ["Hearts", "Diamonds"];
  const blackSuits = ["Clubs", "Spades"];
  return (
    (redSuits.includes(suit1) && blackSuits.includes(suit2)) ||
    (blackSuits.includes(suit1) && redSuits.includes(suit2))
  );
};

export const isGameComplete = (foundations: Foundations): boolean => {
  return foundations.every((foundation) => foundation.length === 13);
};

export const canMoveCard = (fromCard: Card, toCard: Card): boolean => {
  return (
    oppositeColors(fromCard.suit, toCard.suit) &&
    isCardHigherRank(toCard, fromCard)
  );
};

export const canMoveCardFromTableauToTableau = (
  tableau: Tableau,
  fromIndex: number,
  toIndex: number
): boolean => {
  const fromCard = getLastInStack(tableau[fromIndex]);
  const toCard = getLastInStack(tableau[toIndex]);
  return !!fromCard && !!toCard && canMoveCard(fromCard, toCard);
};

export const canMoveCardFromWasteToTableau = (
  wastePile: WastePile,
  tableau: Tableau,
  tableauIndex: number
): boolean => {
  const wasteCard = getLastInStack(wastePile);
  const tableauCard = getLastInStack(tableau[tableauIndex]);
  return !!wasteCard && !!tableauCard && canMoveCard(wasteCard, tableauCard);
};

export const canMoveCardFromTableauToFoundation = (
  tableau: Tableau,
  foundations: Foundations,
  tableauIndex: number,
  foundationIndex: number
): boolean => {
  const tableauCard = getLastInStack(tableau[tableauIndex]);
  const foundationCard = getLastInStack(foundations[foundationIndex]);

  if (!tableauCard) return false;
  if (!foundationCard) return tableauCard.rank === "A";

  const nextRanks: Record<string, string> = {
    A: "2",
    "2": "3",
    "3": "4",
    "4": "5",
    "5": "6",
    "6": "7",
    "7": "8",
    "8": "9",
    "9": "10",
    "10": "J",
    J: "Q",
    Q: "K",
  };

  const isNextRank = nextRanks[foundationCard.rank] === tableauCard.rank;
  return tableauCard.suit === foundationCard.suit && isNextRank;
};

export const canMoveCardFromFoundationToTableau = (
  foundations: Foundations,
  tableau: Tableau,
  foundationIndex: number,
  tableauIndex: number
): boolean => {
  const foundationCard = getLastInStack(foundations[foundationIndex]);
  const tableauCard = getLastInStack(tableau[tableauIndex]);
  return (
    !!foundationCard &&
    (!tableauCard || canMoveCard(foundationCard, tableauCard))
  );
};
