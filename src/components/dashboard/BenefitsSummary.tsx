import { useState } from "react";
import { ChevronDown, Utensils } from "lucide-react";
import type { FinanceData } from "@/lib/types";
import { isBenefitCard } from "@/lib/types";
import { benefitSummary } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Card } from "@/components/ui/misc";
import { cn, safeStorage } from "@/lib/utils";

const store = safeStorage();

/** Seção expansível "Cartões benefício" (VR/VA) na tela principal. */
export function BenefitsSummary({ data, month }: { data: FinanceData; month: string }) {
  const { money } = usePrefs();
  const [open, setOpen] = useState(() => store.get("benefits-summary-open") === "1");
  const cards = data.cards.filter(
    (c) => isBenefitCard(c) && (!c.archived || data.transactions.some((t) => t.card_id === c.id && t.month === month)),
  );
  if (!cards.length) return null;

  const total = benefitSummary(data, month);
  const perCard = cards.map((card) => ({ card, b: benefitSummary(data, month, card.id) }));
  const summed = !!data.profile.sum_benefits;

  const toggle = () =>
    setOpen((o) => {
      store.set("benefits-summary-open", o ? "0" : "1");
      return !o;
    });

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/50"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-warning-soft text-warning">
          <Utensils className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Cartões benefício</p>
          <p className="truncate text-xs text-muted-foreground">
            Saldo: <span className={cn(total.balance < 0 && "text-expense")}>{money(total.balance)}</span>
            {summed ? " · somado ao saldo geral" : " · separado do saldo geral"}
          </p>
        </div>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border p-4 animate-in">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mini label="Saldo anterior" value={money(total.previous)} />
            <Mini label="Recargas" value={money(total.income)} tone="text-income" />
            <Mini label="Gastos" value={money(total.expense)} tone="text-expense" />
            <Mini label="Saldo do mês" value={money(total.balance)} tone={total.balance < 0 ? "text-expense" : undefined} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {perCard.map(({ card, b }) => {
              const usedPct = b.previous + b.income > 0 ? Math.min((b.expense / (b.previous + b.income)) * 100, 100) : 0;
              return (
                <div key={card.id} className="relative overflow-hidden rounded-2xl border border-border p-4">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: card.color }} />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{card.name}</p>
                      <p className="text-xs text-muted-foreground">Disponível hoje: {money(b.realized)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={cn("font-semibold tabular", b.balance < 0 && "text-expense")}>{money(b.balance)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: b.balance < 0 ? "var(--expense)" : card.color }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {money(b.previous)} anterior + {money(b.income)} recarga
                    </span>
                    <span>− {money(b.expense)}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
