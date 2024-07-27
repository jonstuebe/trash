import { Card, Tableau, WastePile } from "../types";

export const getLastInStack = <T>(stack: T[]): T | null =>
  stack.length > 0 ? stack[stack.length - 1] : null;

export const isCardLowerRank = (first: Card, second: Card): boolean => {
  const rankOrder: string[] = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  return rankOrder.indexOf(first.rank) < rankOrder.indexOf(second.rank);
};

export const isCardHigherRank = (first: Card, second: Card): boolean => {
  const rankOrder: string[] = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  return rankOrder.indexOf(first.rank) > rankOrder.indexOf(second.rank);
};
