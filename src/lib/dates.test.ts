import { afterEach, describe, expect, it, vi } from "vitest";
import { addMonths, currentMonth, dateInMonth, daysInMonth, formatDate, monthDiff, monthLabel, monthOf, today } from "./dates";

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("calcula dias do mês, incluindo ano bissexto", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("soma meses ajustando o dia em meses curtos", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-10", -4)).toBe("2025-11-10");
  });

  it("posiciona um dia dentro de um mês", () => {
    expect(dateInMonth("2026-02-01", 30)).toBe("2026-02-28");
    expect(dateInMonth("2026-04-01", 5)).toBe("2026-04-05");
  });

  it("calcula diferença entre meses e mês de uma data", () => {
    expect(monthDiff("2026-11-01", "2027-02-01")).toBe(3);
    expect(monthDiff("2027-02-01", "2026-11-01")).toBe(-3);
    expect(monthOf("2026-11-27")).toBe("2026-11-01");
  });

  it("formata rótulos em português", () => {
    expect(monthLabel("2026-03-01")).toBe("Março 2026");
    expect(monthLabel("2026-12-01", true)).toBe("dez/26");
    expect(formatDate("2026-03-05")).toBe("05/03");
    expect(formatDate("2026-03-05", true)).toBe("05/03/2026");
  });

  it("usa a data local para hoje e mês atual", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 30));
    expect(today()).toBe("2026-11-04");
    expect(currentMonth()).toBe("2026-11-01");
  });
});
