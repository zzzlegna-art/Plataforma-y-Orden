import type { StockMovement } from "./types";

export interface MonthToDateEntryComparison {
  current: number;
  previous: number;
}

/** Compare month-to-date entries against the same elapsed days in the prior month. */
export const getMonthToDateEntryComparison = (
  movements: readonly StockMovement[],
  now: Date = new Date(),
): MonthToDateEntryComparison => {
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const previousEndDay = Math.min(now.getDate(), previousMonthDays);
  const previousEnd = new Date(now.getFullYear(), now.getMonth() - 1, previousEndDay + 1);

  const totalEntries = (start: Date, end: Date) =>
    movements.reduce((total, movement) => {
      if (movement.type !== "entrada") return total;
      const createdAt = new Date(movement.createdAt);
      if (Number.isNaN(createdAt.getTime()) || createdAt < start || createdAt >= end) return total;
      return total + movement.quantity;
    }, 0);

  return {
    current: totalEntries(currentStart, currentEnd),
    previous: totalEntries(previousStart, previousEnd),
  };
};
