import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, History, TriangleAlert, Wallet } from "lucide-react";
import type { MonthSummary } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Card } from "@/components/ui/misc";
import { InfoPopover } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  icon,
  tone,
  sub,
  info,
  className,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "income" | "expense" | "info" | "neutral" | "primary";
  sub?: ReactNode;
  info?: ReactNode;
  className?: string;
}) {
  const { money } = usePrefs();
  const toneClass = {
    income: "bg-income-soft text-income",
    expense: "bg-expense-soft text-expense",
    info: "bg-info-soft text-info",
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
  }[tone];
  const body = (
    <Card className={cn("flex flex-col gap-3 p-4", info && "cursor-help", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
        <span className={cn("grid size-8 place-items-center rounded-xl [&_svg]:size-4", toneClass)}>{icon}</span>
      </div>
      <div>
        <p className={cn("text-lg font-semibold tabular tracking-tight sm:text-2xl", value < 0 && "text-expense")}>{money(value)}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </Card>
  );
  if (!info) return body;
  return (
    <InfoPopover trigger={<div tabIndex={0} className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</div>}>
      {info}
    </InfoPopover>
  );
}

export function SummaryCards({ s, carry }: { s: MonthSummary; carry: boolean }) {
  const { money } = usePrefs();
  return (
    <div className="flex flex-col gap-3">
      {s.overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-expense/25 bg-expense-soft px-4 py-3 text-sm text-expense">
          <TriangleAlert className="size-5 shrink-0" />
          <span>
            <b>
              {s.overdueCount} {s.overdueCount === 1 ? "conta vencida" : "contas vencidas"}
            </b>{" "}
            não {s.overdueCount === 1 ? "paga" : "pagas"}, somando {money(s.overdueTotal)}.
          </span>
        </div>
      )}
      <div className={cn("grid grid-cols-2 gap-3", carry ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {carry && (
          <Stat
            label="Saldo anterior"
            value={s.previous}
            icon={<History />}
            tone="neutral"
            sub="acumulado até o mês passado"
            info={
              <p className="text-muted-foreground">
                Saldo inicial + tudo o que já foi <b className="text-foreground">pago/recebido</b> nos meses anteriores. Você pode
                desativar o acúmulo em Perfil.
              </p>
            }
          />
        )}
        <Stat label="Entradas" value={s.income} icon={<ArrowDownLeft />} tone="income" sub={`${money(s.incomePaid)} recebido`} />
        <Stat label="Saídas" value={s.expense} icon={<ArrowUpRight />} tone="expense" sub={`${money(s.expensePaid)} pago`} />
        <Stat
          label="Saldo realizado"
          value={s.realized}
          icon={<CircleCheck />}
          tone="info"
          sub="só o que já foi pago"
          info={
            <p className="text-muted-foreground">
              {carry ? "Saldo anterior + " : ""}entradas recebidas − saídas pagas neste mês.
            </p>
          }
        />
        <Stat
          label="Saldo previsto"
          value={s.predicted}
          icon={<Wallet />}
          tone="primary"
          sub="ao final do mês"
          className={cn(!carry && "col-span-2 lg:col-span-1", carry && "col-span-2 lg:col-span-1")}
          info={
            <p className="text-muted-foreground">
              {carry ? "Saldo anterior + " : ""}todas as entradas − todas as saídas do mês (pagas ou não).
            </p>
          }
        />
      </div>
    </div>
  );
}
