import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orderListItems, type ListItem } from "./listOrder";
import type { CreditCard } from "@/lib/types";
import { card, emptyData, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12));
});
afterEach(() => vi.useRealTimers());

const card2: CreditCard = { ...card, id: "card-2", name: "Laranja", closing_day: 25, due_day: 5 };
const vr: CreditCard = { ...card, id: "vr", type: "benefit", name: "VR", credit_limit: null };

const label = (it: ListItem) =>
  it.type === "tx" ? it.tx.name : it.type === "invoice" ? `Fatura ${it.invoice.card.name}` : `Benefício ${it.group.card.name}`;

function build() {
  const nov = "2026-11-01";
  return emptyData({
    cards: [card, card2, vr],
    transactions: [
      // fatura Roxinho (vence 10/11) em aberto
      tx({ name: "Mercado", amount: 1, date: "2026-10-20", month: nov, payment_method: "card", card_id: card.id }),
      // fatura Laranja (vence 05/11) já paga
      tx({ name: "iFood", amount: 1, date: "2026-10-10", month: nov, payment_method: "card", card_id: card2.id, paid: true }),
      tx({ name: "Almoço", amount: 1, date: "2026-11-03", payment_method: "benefit", card_id: vr.id }),
      tx({ name: "Aluguel", amount: 1, date: "2026-11-10" }),
      tx({ name: "Internet", amount: 1, date: "2026-11-02" }), // vencida e pendente
      tx({ name: "Salário", kind: "income", amount: 1, date: "2026-11-05" }), // a receber
      tx({ name: "Farmácia", amount: 1, date: "2026-11-01", paid: true }),
      tx({ name: "Uber", amount: 1, date: "2026-11-15", paid: true }),
    ],
  });
}

describe("orderListItems (organização da lista)", () => {
  it("separa em Cartões, Pendentes e Pagos, nessa ordem", () => {
    const data = build();
    const sections = orderListItems(data, "2026-11-01", data.transactions);
    expect(sections.map((s) => s.title)).toEqual(["Cartões", "Pendentes", "Pagos"]);
  });

  it("cartões: faturas em aberto, depois benefícios, depois faturas pagas", () => {
    const data = build();
    const [cards] = orderListItems(data, "2026-11-01", data.transactions);
    expect(cards.items.map(label)).toEqual(["Fatura Roxinho", "Benefício VR", "Fatura Laranja"]);
  });

  it("pendentes (a pagar e a receber) por data, com os vencidos naturalmente no topo", () => {
    const data = build();
    const pending = orderListItems(data, "2026-11-01", data.transactions)[1];
    expect(pending.items.map(label)).toEqual(["Internet", "Salário", "Aluguel"]);
  });

  it("pagos por data, no final", () => {
    const data = build();
    const paid = orderListItems(data, "2026-11-01", data.transactions)[2];
    expect(paid.items.map(label)).toEqual(["Farmácia", "Uber"]);
  });

  it("omite seções vazias (ex.: filtro que esconde todos os cartões)", () => {
    const data = build();
    const onlyPix = data.transactions.filter((t) => t.payment_method === "pix");
    expect(orderListItems(data, "2026-11-01", onlyPix).map((s) => s.key)).toEqual(["pending", "paid"]);
    expect(orderListItems(data, "2026-11-01", [])).toEqual([]);
  });

  it("marcar um lançamento como pago o move de Pendentes para Pagos", () => {
    const data = build();
    const txs = data.transactions.map((t) => (t.name === "Aluguel" ? { ...t, paid: true } : t));
    const sections = orderListItems(data, "2026-11-01", txs);
    expect(sections[1].items.map(label)).not.toContain("Aluguel");
    expect(sections[2].items.map(label)).toContain("Aluguel");
  });
});
