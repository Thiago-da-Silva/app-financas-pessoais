import type { FinanceData, Transaction } from "./types";
import { PAYMENT_LABELS } from "./types";
import { formatDate, monthLabel } from "./dates";
import { installmentMap } from "@/domain/finance";

function cell(v: string | number) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera CSV (separador ";" para abrir direto no Excel em pt-BR) e baixa no navegador. */
export function exportCsv(data: FinanceData, transactions: Transaction[], filename: string) {
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const cards = new Map(data.cards.map((c) => [c.id, c.name]));
  const inst = installmentMap(data);
  const header = ["Data", "Mês/Fatura", "Tipo", "Nome", "Descrição", "Categoria", "Forma de pagamento", "Parcela", "Valor", "Pago"];
  const rows = transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const i = inst.get(t.id);
      return [
        formatDate(t.date, true),
        monthLabel(t.month),
        t.kind === "income" ? "Entrada" : "Saída",
        t.name,
        t.description ?? "",
        t.category_id ? (cats.get(t.category_id) ?? "") : "",
        t.payment_method === "card" ? `Cartão ${cards.get(t.card_id ?? "") ?? ""}` : PAYMENT_LABELS[t.payment_method],
        i ? `${i.n}/${i.total}` : "",
        ((t.kind === "income" ? 1 : -1) * t.amount / 100).toFixed(2).replace(".", ","),
        t.paid ? "Sim" : "Não",
      ];
    });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
