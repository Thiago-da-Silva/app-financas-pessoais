import type { ReactNode } from "react";
import { CreditCard as CardIcon, Utensils } from "lucide-react";
import type { CreditCard, FinanceData } from "@/lib/types";
import { isBenefitCard } from "@/lib/types";
import { benefitSummary, cardUsage } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Progress } from "@/components/ui/misc";
import { InfoPopover } from "@/components/ui/overlay";
import { formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/dates";

/** Saldo acumulado de um cartão benefício (VR/VA). */
export function BenefitDetails({ data, card, month }: { data: FinanceData; card: CreditCard; month: string }) {
  const { money } = usePrefs();
  const b = benefitSummary(data, month, card.id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: card.color }}>
          <Utensils className="size-4" />
        </span>
        <div>
          <p className="font-semibold leading-tight">{card.name}</p>
          <p className="text-xs text-muted-foreground">Cartão benefício · saldo acumula todo mês</p>
        </div>
      </div>
      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">Saldo ao final de {monthLabel(month).toLowerCase()}</p>
        <p className={`text-lg font-semibold tabular ${b.balance < 0 ? "text-expense" : ""}`}>{money(b.balance)}</p>
        {b.balance < 0 && <p className="text-xs text-expense">Os gastos passaram do saldo disponível.</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Item label="Saldo anterior" value={money(b.previous)} />
        <Item label="Disponível hoje" value={money(b.realized)} tone={b.realized < 0 ? "text-expense" : "text-income"} />
        <Item label="Recargas no mês" value={money(b.income)} tone="text-income" />
        <Item label="Gastos no mês" value={money(b.expense)} />
      </dl>
    </div>
  );
}

export function CardUsageDetails({ data, card, month }: { data: FinanceData; card: CreditCard; month: string }) {
  const { money } = usePrefs();
  if (isBenefitCard(card)) return <BenefitDetails data={data} card={card} month={month} />;
  const u = cardUsage(data, card, month);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: card.color }}>
          <CardIcon className="size-4" />
        </span>
        <div>
          <p className="font-semibold leading-tight">{card.name}</p>
          <p className="text-xs text-muted-foreground">
            Fecha dia {card.closing_day} · vence dia {card.due_day}
          </p>
        </div>
      </div>
      {u.limit != null ? (
        <>
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">Em uso {formatPercent(u.usedPct)}</span>
              <span className="text-muted-foreground">Livre {formatPercent(u.freePct)}</span>
            </div>
            <Progress value={u.usedPct} color={u.usedPct > 85 ? "var(--expense)" : card.color} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Item label="Limite total" value={money(u.limit)} />
            <Item label="Disponível" value={money(u.available ?? 0)} tone={(u.available ?? 0) < 0 ? "text-expense" : "text-income"} />
            <Item label="Comprometido" value={money(u.used)} />
            <Item label={`Fatura ${monthLabel(month, true)}`} value={money(u.currentInvoice)} />
            <Item label="Parcelas futuras" value={money(u.future)} className="col-span-2" />
          </dl>
        </>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Item label={`Fatura ${monthLabel(month, true)}`} value={money(u.currentInvoice)} />
          <Item label="Comprometido" value={money(u.used)} />
          <Item label="Parcelas futuras" value={money(u.future)} />
          <p className="col-span-2 text-muted-foreground">Informe o limite do cartão para ver o disponível.</p>
        </dl>
      )}
    </div>
  );
}

function Item({ label, value, tone, className }: { label: string; value: ReactNode; tone?: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

/** Nome do cartão que mostra o uso do limite ao passar o mouse/tocar. */
export function CardChip({ data, card, month, children }: { data: FinanceData; card: CreditCard; month: string; children?: ReactNode }) {
  return (
    <InfoPopover
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full cursor-pointer items-center gap-1.5 truncate rounded-md text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: card.color }} />
          {children ?? card.name}
        </button>
      }
    >
      <CardUsageDetails data={data} card={card} month={month} />
    </InfoPopover>
  );
}
