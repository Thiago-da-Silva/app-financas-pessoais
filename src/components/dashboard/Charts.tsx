import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartColumn, ChartPie, List, Target } from "lucide-react";
import type { Category, FinanceData, Transaction } from "@/lib/types";
import { budgetProgress, categoryBreakdown, evolution, type CategorySlice } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Card, Dot, EmptyState, Progress, Segmented } from "@/components/ui/misc";
import { formatPercent } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { cn, safeStorage } from "@/lib/utils";

const store = safeStorage();
type View = "donut" | "bars" | "list";

function useChartColors() {
  const { resolvedTheme } = usePrefs();
  const dark = resolvedTheme === "dark";
  return {
    grid: dark ? "#232834" : "#e5e8ee",
    text: dark ? "#8b93a5" : "#64748b",
    income: dark ? "#34d399" : "#059669",
    expense: dark ? "#fb7185" : "#e11d48",
    cursor: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)",
  };
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg">{children}</div>;
}

export function CategoryChart({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const { money } = usePrefs();
  const colors = useChartColors();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [view, setView] = useState<View>(() => (store.get("chart-view") as View) || "donut");
  const slices = categoryBreakdown(transactions, categories, kind);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const [active, setActive] = useState<string | null>(null);

  const changeView = (v: View) => {
    store.set("chart-view", v);
    setView(v);
  };

  return (
    <Card className="@container flex flex-col p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Por categoria</h3>
        <div className="flex gap-2">
          <Segmented<"expense" | "income">
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Saídas" },
              { value: "income", label: "Entradas" },
            ]}
          />
          <Segmented
            size="sm"
            value={view}
            onChange={changeView}
            options={[
              { value: "donut", label: <ChartPie aria-label="Rosca" /> },
              { value: "bars", label: <ChartColumn aria-label="Barras" /> },
              { value: "list", label: <List aria-label="Lista" /> },
            ]}
          />
        </div>
      </div>

      {slices.length === 0 ? (
        <EmptyState icon={<ChartPie />} title="Sem dados neste mês" />
      ) : view === "donut" ? (
        <div className="mt-2 grid items-center gap-4 @lg:grid-cols-[200px_1fr]">
          <div className="relative mx-auto h-[200px] w-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={64}
                  outerRadius={92}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  stroke="none"
                  onMouseEnter={(_, i) => setActive(slices[i].id)}
                  onMouseLeave={() => setActive(null)}
                >
                  {slices.map((s) => (
                    <Cell key={s.id} fill={s.color} opacity={active && active !== s.id ? 0.35 : 1} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {(() => {
                const a = slices.find((s) => s.id === active);
                return (
                  <>
                    <span className="max-w-28 truncate text-xs text-muted-foreground">{a ? a.name : "Total"}</span>
                    <span className="text-base font-semibold tabular">{money(a ? a.value : total)}</span>
                    {a && <span className="text-xs text-muted-foreground">{formatPercent(a.pct)}</span>}
                  </>
                );
              })()}
            </div>
          </div>
          <Legend slices={slices} active={active} setActive={setActive} />
        </div>
      ) : view === "bars" ? (
        <div className="mt-3" style={{ height: Math.max(160, slices.length * 38) }}>
          <ResponsiveContainer>
            <BarChart data={slices} layout="vertical" margin={{ left: 0, right: 12 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tickLine={false}
                axisLine={false}
                tick={{ fill: colors.text, fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: colors.cursor }}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as CategorySlice | undefined;
                  if (!p) return null;
                  return (
                    <TooltipBox>
                      <p className="font-medium">{p.name}</p>
                      <p className="tabular">
                        {money(p.value)} · {formatPercent(p.pct)}
                      </p>
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {slices.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3">
          <Legend slices={slices} active={active} setActive={setActive} bars />
        </div>
      )}
    </Card>
  );
}

function Legend({
  slices,
  active,
  setActive,
  bars,
}: {
  slices: CategorySlice[];
  active: string | null;
  setActive(id: string | null): void;
  bars?: boolean;
}) {
  const { money } = usePrefs();
  return (
    <ul className="flex flex-col gap-1">
      {slices.map((s) => (
        <li
          key={s.id}
          onMouseEnter={() => setActive(s.id)}
          onMouseLeave={() => setActive(null)}
          className={cn("rounded-lg px-2 py-1.5 transition", active === s.id && "bg-accent")}
        >
          <div className="flex items-center gap-2 text-sm">
            <Dot color={s.color} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular">{formatPercent(s.pct)}</span>
            <span className="w-24 text-right font-medium tabular">{money(s.value)}</span>
          </div>
          {bars && <Progress className="mt-1.5 h-1.5" value={s.pct} color={s.color} />}
        </li>
      ))}
    </ul>
  );
}

export function EvolutionChart({ data, month }: { data: FinanceData; month: string }) {
  const { money, hideValues } = usePrefs();
  const colors = useChartColors();
  const rows = evolution(data, month, 6).map((r) => ({ ...r, label: monthLabel(r.month, true) }));
  const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Últimos 6 meses</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Dot color={colors.income} /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <Dot color={colors.expense} /> Saídas
          </span>
        </div>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ left: -12, right: 4 }} barGap={3}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.text, fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: colors.text, fontSize: 11 }}
              tickFormatter={(v: number) => (hideValues ? "•••" : compact.format(v / 100))}
            />
            <Tooltip
              cursor={{ fill: colors.cursor }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!p) return null;
                return (
                  <TooltipBox>
                    <p className="mb-1 font-medium">{monthLabel(p.month)}</p>
                    <p className="text-income tabular">Entradas: {money(p.income)}</p>
                    <p className="text-expense tabular">Saídas: {money(p.expense)}</p>
                    <p className="mt-1 font-medium tabular">Resultado: {money(p.balance)}</p>
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="income" fill={colors.income} radius={[6, 6, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" fill={colors.expense} radius={[6, 6, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function BudgetsPanel({ data, month }: { data: FinanceData; month: string }) {
  const { money } = usePrefs();
  const items = budgetProgress(data, month);
  if (!items.length) return null;
  return (
    <Card className="@container p-4">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-muted-foreground" />
        <h3 className="font-semibold">Orçamentos do mês</h3>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-3 @xl:grid-cols-2">
        {items.map(({ category, spent, budget, pct }) => (
          <li key={category.id}>
            <div className="mb-1.5 flex items-center gap-2 text-sm">
              <Dot color={category.color} />
              <span className="flex-1 truncate">{category.name}</span>
              <span className={cn("text-xs tabular", pct > 100 ? "font-semibold text-expense" : "text-muted-foreground")}>
                {money(spent)} / {money(budget)}
              </span>
            </div>
            <Progress value={pct} color={pct > 100 ? "var(--expense)" : pct > 80 ? "var(--warning)" : category.color} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
