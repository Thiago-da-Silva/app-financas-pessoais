import type { FinanceData, Transaction } from "@/lib/types";
import { benefitGroups, invoicesForMonth, isBenefitTx, type BenefitGroup, type Invoice } from "./finance";

export type ListItem =
  | { type: "tx"; tx: Transaction }
  | { type: "invoice"; invoice: Invoice }
  | { type: "benefit"; group: BenefitGroup };

export interface ListSection {
  key: "cards" | "pending" | "paid";
  title: string;
  items: ListItem[];
}

const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name);

/**
 * Organiza a lista do mês em seções:
 * 1. Cartões: faturas em aberto (por vencimento), benefícios, faturas já pagas.
 * 2. Pendentes: lançamentos não pagos/recebidos, por data (os vencidos naturalmente primeiro).
 * 3. Pagos: lançamentos concluídos, por data.
 * Seções vazias são omitidas.
 */
export function orderListItems(data: FinanceData, month: string, transactions: Transaction[]): ListSection[] {
  const invoices = invoicesForMonth(data, month, transactions).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const benefits = benefitGroups(data, month, transactions);
  const plain = transactions.filter((t) => t.payment_method !== "card" && !isBenefitTx(t));

  const cards: ListItem[] = [
    ...invoices.filter((i) => !i.allPaid).map((invoice) => ({ type: "invoice" as const, invoice })),
    ...benefits.map((group) => ({ type: "benefit" as const, group })),
    ...invoices.filter((i) => i.allPaid).map((invoice) => ({ type: "invoice" as const, invoice })),
  ];
  const pending: ListItem[] = plain
    .filter((t) => !t.paid)
    .sort(byDate)
    .map((tx) => ({ type: "tx" as const, tx }));
  const paid: ListItem[] = plain
    .filter((t) => t.paid)
    .sort(byDate)
    .map((tx) => ({ type: "tx" as const, tx }));

  const sections: ListSection[] = [
    { key: "cards", title: "Cartões", items: cards },
    { key: "pending", title: "Pendentes", items: pending },
    { key: "paid", title: "Pagos", items: paid },
  ];
  return sections.filter((s) => s.items.length > 0);
}
