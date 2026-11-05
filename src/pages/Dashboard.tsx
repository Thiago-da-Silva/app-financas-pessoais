import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Ellipsis, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/lib/types";
import { useAction, useFinance } from "@/hooks/useFinance";
import { monthSummary } from "@/domain/finance";
import { deleteEntry, ensureFixed, FIXED_AHEAD, setPaid, undoDelete, type DeleteScope } from "@/domain/operations";
import { MonthPicker } from "@/components/dashboard/MonthPicker";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { CardsSummary } from "@/components/dashboard/CardsSummary";
import { BenefitsSummary } from "@/components/dashboard/BenefitsSummary";
import { BudgetsPanel, CategoryChart, EvolutionChart } from "@/components/dashboard/Charts";
import { applyFilters, EMPTY_FILTERS, Filters, type FilterState } from "@/components/dashboard/Filters";
import { TransactionList, type RowActions } from "@/components/dashboard/TransactionList";
import { TransactionForm, type FormMode } from "@/components/dashboard/TransactionForm";
import { DeleteDialog } from "@/components/dashboard/DeleteDialog";
import { Button } from "@/components/ui/button";
import { Card, Spinner } from "@/components/ui/misc";
import { Menu, MenuItem } from "@/components/ui/overlay";
import { addMonths, currentMonth, monthLabel } from "@/lib/dates";
import { exportCsv } from "@/lib/csv";
import { useSession } from "@/data/session";

export default function DashboardPage() {
  const { data, isLoading, error } = useFinance();
  const { repo } = useSession();
  const { run } = useAction();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("mes") ?? "") ? `${params.get("mes")}-01` : currentMonth();
  const setMonth = (m: string) => setParams(m === currentMonth() ? {} : { mes: m.slice(0, 7) }, { replace: true });

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ type: "new" });
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  // Gera lançamentos fixos à frente conforme o usuário navega pelos meses
  const ensuring = useRef(false);
  useEffect(() => {
    if (!data || !repo || ensuring.current) return;
    const horizon = addMonths(month > currentMonth() ? month : currentMonth(), FIXED_AHEAD);
    const needs = data.series.some(
      (s) => s.type === "fixed" && (s.generated_until ?? s.start_month) < horizon && (!s.end_month || (s.generated_until ?? "") < s.end_month),
    );
    if (!needs) return;
    ensuring.current = true;
    run((r, d) => ensureFixed(r, d, horizon)).finally(() => {
      ensuring.current = false;
    });
  }, [data, month, repo, run]);

  const monthTx = useMemo(() => (data ? data.transactions.filter((t) => t.month === month) : []), [data, month]);
  const filtered = useMemo(() => (data ? applyFilters(monthTx, filters, data) : []), [monthTx, filters, data]);
  const summary = useMemo(() => (data ? monthSummary(data, month) : null), [data, month]);

  const openForm = (mode: FormMode) => {
    setFormMode(mode);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const actions: RowActions = useMemo(
    () => ({
      onEdit: (tx) => openForm({ type: "edit", tx }),
      onDuplicate: (tx) => openForm({ type: "duplicate", tx }),
      onDelete: (tx) => setDeleting(tx),
      onTogglePaid: (ids, paid) => {
        const set = new Set(ids);
        run(
          (r) => setPaid(r, ids, paid),
          (d) => ({ ...d, transactions: d.transactions.map((t) => (set.has(t.id) ? { ...t, paid } : t)) }),
        ).then(() => {
          if (ids.length > 1)
            toast.success(paid ? `${ids.length} itens marcados como pagos` : "Pagamento desmarcado", {
              action: { label: "Desfazer", onClick: () => run((r) => setPaid(r, ids, !paid)) },
            });
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const confirmDelete = useCallback(
    async (tx: Transaction, scope: DeleteScope) => {
      setDeleting(null);
      const snap = await run((r, d) => deleteEntry(r, d, tx, scope));
      toast.success(snap.transactions.length > 1 ? `${snap.transactions.length} lançamentos excluídos` : "Lançamento excluído", {
        action: { label: "Desfazer", onClick: () => run((r) => undoDelete(r, snap)).then(() => toast.success("Exclusão desfeita")) },
        duration: 6000,
      });
    },
    [run],
  );

  if (isLoading || !data || !summary) {
    return (
      <div className="grid place-items-center py-24 text-primary">
        {error ? <p className="text-sm text-expense">Erro ao carregar: {String((error as Error).message)}</p> : <Spinner />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Olá{data.profile.name ? `, ${data.profile.name.split(" ")[0]}` : ""} 👋</h1>
          <p className="text-sm text-muted-foreground">Resumo de {monthLabel(month).toLowerCase()}</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      <SummaryCards s={summary} carry={data.profile.carry_balance} />
      <CardsSummary data={data} month={month} />
      <BenefitsSummary data={data} month={month} />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* Lançamentos */}
        <Card className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Lançamentos</h2>
                <p className="text-xs text-muted-foreground">
                  {filtered.length} de {monthTx.length} em {monthLabel(month).toLowerCase()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button className="hidden md:inline-flex" onClick={() => openForm({ type: "new" })}>
                  <Plus /> Novo lançamento
                </Button>
                <Menu
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Mais opções">
                      <Ellipsis />
                    </Button>
                  }
                >
                  <MenuItem icon={<Download />} onSelect={() => exportCsv(data, filtered, `lancamentos-${month.slice(0, 7)}.csv`)}>
                    Exportar mês (CSV)
                  </MenuItem>
                </Menu>
              </div>
            </div>
            <Filters value={filters} onChange={setFilters} data={data} />
          </div>
          <TransactionList data={data} month={month} transactions={filtered} actions={actions} />
        </Card>

        {/* Gráficos */}
        <div className="flex min-w-0 flex-col gap-5">
          <CategoryChart transactions={monthTx} categories={data.categories} />
          <EvolutionChart data={data} month={month} />
          <BudgetsPanel data={data} month={month} />
        </div>
      </div>

      {/* Botão flutuante (celular) */}
      <Button
        size="icon"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-2xl shadow-lg shadow-primary/30 md:hidden [&_svg]:size-6"
        onClick={() => openForm({ type: "new" })}
        aria-label="Novo lançamento"
      >
        <Plus />
      </Button>

      <TransactionForm key={formKey} open={formOpen} onOpenChange={setFormOpen} data={data} month={month} mode={formMode} />
      <DeleteDialog tx={deleting} data={data} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
    </div>
  );
}
