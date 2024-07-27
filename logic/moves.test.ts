import {
  moveCardFromFoundationToTableau,
  moveCardFromStockToWaste,
  moveCardFromTableauToFoundation,
  moveCardFromTableauToTableau,
  moveCardFromWasteToTableau,
  recycleWastePileToStock,
} from "../logic/moves";
import { Foundations, StockPile, Tableau, WastePile } from "../types";

describe("Move Functions", () => {
  test("moveCardFromStockToWaste should move a card correctly", () => {
    const stockPile: StockPile = [
      { suit: "Hearts", rank: "5", faceUp: false },
      { suit: "Clubs", rank: "6", faceUp: false },
    ];
    const wastePile: WastePile = [
      { suit: "Diamonds", rank: "7", faceUp: true },
    ];

    const { stockPile: newStockPile, wastePile: newWastePile } =
      moveCardFromStockToWaste(stockPile, wastePile);

    expect(newStockPile.length).toBe(1);
    expect(newWastePile.length).toBe(2);
    expect(newWastePile[1].suit).toBe("Hearts");
    expect(newWastePile[1].rank).toBe("5");
  });

  test("moveCardFromFoundationToTableau should move a card correctly", () => {
    const foundations: Foundations = [
      [{ suit: "Hearts", rank: "A", faceUp: true }],
      [],
      [],
      [],
    ];
    const tableau: Tableau = [
      [{ suit: "Clubs", rank: "5", faceUp: true }],
      [],
      [],
      [],
      [],
      [],
      [],
    ];

    const { foundations: newFoundations, tableau: newTableau } =
      moveCardFromFoundationToTableau(foundations, tableau, 0, 0);

    expect(newFoundations[0].length).toBe(0);
    expect(newTableau[0].length).toBe(2);
    expect(newTableau[0][1].suit).toBe("Hearts");
    expect(newTableau[0][1].rank).toBe("A");
  });

  test("moveCardFromTableauToFoundation should move a card correctly", () => {
    const tableau: Tableau = [
      [{ suit: "Hearts", rank: "A", faceUp: true }],
      [{ suit: "Diamonds", rank: "6", faceUp: false }],
      [],
      [],
      [],
      [],
      [],
    ];
    const foundations: Foundations = [[], [], [], []];

    const { tableau: newTableau, foundations: newFoundations } =
      moveCardFromTableauToFoundation(tableau, foundations, 0, 0);

    expect(newTableau[0].length).toBe(0);
    expect(newFoundations[0].length).toBe(1);
    expect(newFoundations[0][0].suit).toBe("Hearts");
    expect(newFoundations[0][0].rank).toBe("A");
  });

  test("moveCardFromTableauToTableau should move a card correctly", () => {
    const tableau: Tableau = [
      [{ suit: "Hearts", rank: "A", faceUp: true }],
      [],
      [],
      [],
      [],
      [],
      [],
    ];

    const newTableau = moveCardFromTableauToTableau(tableau, 0, 1);

    expect(newTableau[0].length).toBe(0);
    expect(newTableau[1].length).toBe(1);
    expect(newTableau[1][0].suit).toBe("Hearts");
    expect(newTableau[1][0].rank).toBe("A");
  });

  test("moveCardFromWasteToTableau should move a card correctly", () => {
    const wastePile: WastePile = [{ suit: "Hearts", rank: "A", faceUp: true }];
    const tableau: Tableau = [
      [{ suit: "Clubs", rank: "5", faceUp: true }],
      [],
      [],
      [],
      [],
      [],
      [],
    ];

    const { wastePile: newWastePile, tableau: newTableau } =
      moveCardFromWasteToTableau(wastePile, tableau, 0);

    expect(newWastePile.length).toBe(0);
    expect(newTableau[0].length).toBe(2);
    expect(newTableau[0][1].suit).toBe("Hearts");
    expect(newTableau[0][1].rank).toBe("A");
  });

  test("recycleWastePileToStock should recycle waste pile to stock correctly", () => {
    const stockPile: StockPile = [];
    const wastePile: WastePile = [
      { suit: "Hearts", rank: "A", faceUp: true },
      { suit: "Diamonds", rank: "2", faceUp: true },
      { suit: "Clubs", rank: "3", faceUp: true },
    ];

    const { stockPile: newStockPile, wastePile: newWastePile } =
      recycleWastePileToStock(stockPile, wastePile);

    expect(newStockPile.length).toBe(3);
    expect(newWastePile.length).toBe(0);
    expect(newStockPile[0].suit).toBe("Clubs");
    expect(newStockPile[0].rank).toBe("3");
    expect(newStockPile[1].suit).toBe("Diamonds");
    expect(newStockPile[1].rank).toBe("2");
    expect(newStockPile[2].suit).toBe("Hearts");
    expect(newStockPile[2].rank).toBe("A");
  });
});
