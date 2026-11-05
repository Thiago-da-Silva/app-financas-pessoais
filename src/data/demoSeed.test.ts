import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoData } from "./demoSeed";
import { benefitSummary } from "@/domain/finance";
import { currentMonth } from "@/lib/dates";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12));
});
afterEach(() => vi.useRealTimers());

describe("dados da demonstração", () => {
  it("tem cartões de crédito e um cartão benefício com saldo acumulando", () => {
    const data = buildDemoData();
    expect(data.cards.filter((c) => c.type === "credit")).toHaveLength(2);
    const vr = data.cards.find((c) => c.type === "benefit");
    expect(vr).toBeDefined();

    const b = benefitSummary(data, currentMonth(), vr!.id);
    expect(b.income).toBe(90_000); // recarga do mês
    expect(b.previous).toBeGreaterThan(0); // sobra dos meses anteriores
    expect(b.balance).toBeGreaterThan(b.previous - b.expense);
  });

  it("todo lançamento no benefício aponta para um cartão benefício", () => {
    const data = buildDemoData();
    const benefitIds = new Set(data.cards.filter((c) => c.type === "benefit").map((c) => c.id));
    const rows = data.transactions.filter((t) => t.payment_method === "benefit");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.card_id && benefitIds.has(t.card_id))).toBe(true);
  });
});
