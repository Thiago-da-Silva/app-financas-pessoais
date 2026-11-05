import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, CreditCard as CardIcon, Plus } from "lucide-react";
import type { FinanceData } from "@/lib/types";
import { isCreditCard } from "@/lib/types";
import { cardUsage, invoicesForMonth } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Card, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn, safeStorage } from "@/lib/utils";

const store = safeStorage();

export function CardsSummary({ data, month }: { data: FinanceData; month: string }) {
  const { money } = usePrefs();
  const [open, setOpen] = useState(() => store.get("cards-summary-open") === "1");
  const cards = data.cards.filter(
    (c) => isCreditCard(c) && (!c.archived || data.transactions.some((t) => t.card_id === c.id && t.month === month)),
  );
  const invoices = invoicesForMonth(data, month);

  const total = invoices.reduce((s, i) => s + i.total, 0);
  const paid = invoices.reduce((s, i) => s + i.paidTotal, 0);
  const usages = cards.map((c) => ({ card: c, u: cardUsage(data, c, month) }));
  const withLimit = usages.filter((x) => x.u.limit != null);
  const limitTotal = withLimit.reduce((s, x) => s + (x.u.limit ?? 0), 0);
  const available = withLimit.reduce((s, x) => s + (x.u.available ?? 0), 0);

  const toggle = () => {
    setOpen((o) => {
      store.set("cards-summary-open", o ? "0" : "1");
      return !o;
    });
  };

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/50"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
          <CardIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Cartões de crédito</p>
          <p className="truncate text-xs text-muted-foreground">
            Faturas do mês: {money(total)}
            {limitTotal > 0 && <> · disponível {money(available)}</>}
          </p>
        </div>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border p-4 animate-in">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center text-sm text-muted-foreground">
              Nenhum cartão cadastrado.
              <Button asChild size="sm" variant="outline">
                <Link to="/cartoes">
                  <Plus /> Adicionar cartão
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Mini label="Faturas do mês" value={money(total)} />
                <Mini label="Pago" value={money(paid)} tone="text-income" />
                <Mini label="A pagar" value={money(total - paid)} tone="text-expense" />
                <Mini label="Limite disponível" value={limitTotal ? money(available) : "—"} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {usages.map(({ card, u }) => {
                  const inv = invoices.find((i) => i.card.id === card.id);
                  return (
                    <div key={card.id} className="relative overflow-hidden rounded-2xl border border-border p-4">
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: card.color }} />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{card.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv ? `Vence ${formatDate(inv.dueDate)}` : `Vence dia ${card.due_day}`}
                            {inv?.allPaid && <span className="ml-1 text-income">· paga</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Fatura</p>
                          <p className="font-semibold tabular">{money(u.currentInvoice)}</p>
                        </div>
                      </div>
                      {u.limit != null ? (
                        <div className="mt-3">
                          <Progress value={u.usedPct} color={u.usedPct > 85 ? "var(--expense)" : card.color} />
                          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                            <span>
                              Em uso {formatPercent(u.usedPct)} · {money(u.used)}
                            </span>
                            <span>Livre {money(u.available ?? 0)}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">Comprometido: {money(u.used)} · sem limite informado</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-semibold tabular", tone)}>{value}</p>
    </div>
  );
}
