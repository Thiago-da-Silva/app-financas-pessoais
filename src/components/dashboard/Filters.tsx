import { useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import type { FinanceData, Transaction } from "@/lib/types";
import { isOverdue } from "@/domain/finance";
import { Input, NativeSelect } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface FilterState {
  search: string;
  category: string; // all | none | id
  kind: "all" | "income" | "expense";
  status: "all" | "paid" | "pending" | "overdue";
  payment: string; // all | cash | pix | debit | card:<id>
}

export const EMPTY_FILTERS: FilterState = { search: "", category: "all", kind: "all", status: "all", payment: "all" };

export function applyFilters(list: Transaction[], f: FilterState, data: FinanceData): Transaction[] {
  const q = f.search.trim().toLowerCase();
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const now = today();
  return list.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) return false;
    if (f.category === "none" ? !!t.category_id : f.category !== "all" && t.category_id !== f.category) return false;
    if (f.kind !== "all" && t.kind !== f.kind) return false;
    if (f.status === "paid" && !t.paid) return false;
    if (f.status === "pending" && t.paid) return false;
    if (f.status === "overdue" && !isOverdue(t, cards, now)) return false;
    if (f.payment !== "all") {
      if (f.payment.startsWith("card:")) {
        if (t.card_id !== f.payment.slice(5)) return false;
      } else if (t.payment_method !== f.payment) return false;
    }
    return true;
  });
}

export function Filters({ value, onChange, data }: { value: FilterState; onChange(f: FilterState): void; data: FinanceData }) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  const activeCount = (["category", "kind", "status", "payment"] as const).filter((k) => value[k] !== "all").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar lançamento..." maxLength={100} value={value.search} onChange={(e) => set("search", e.target.value)} />
          {value.search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-muted-foreground" onClick={() => set("search", "")} aria-label="Limpar busca">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button variant={activeCount ? "secondary" : "outline"} className="lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ListFilter />
          <span className="hidden sm:inline">Filtros</span>
          {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{activeCount}</span>}
        </Button>
      </div>
      <div className={cn("grid grid-cols-2 gap-2 lg:grid lg:grid-cols-4", !open && "hidden")}>
        <NativeSelect value={value.category} onChange={(e) => set("category", e.target.value)} aria-label="Categoria">
          <option value="all">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {data.categories
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect value={value.kind} onChange={(e) => set("kind", e.target.value as FilterState["kind"])} aria-label="Tipo">
          <option value="all">Entradas e saídas</option>
          <option value="income">Somente entradas</option>
          <option value="expense">Somente saídas</option>
        </NativeSelect>
        <NativeSelect value={value.status} onChange={(e) => set("status", e.target.value as FilterState["status"])} aria-label="Status">
          <option value="all">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="pending">Pendentes</option>
          <option value="overdue">Vencidos</option>
        </NativeSelect>
        <NativeSelect value={value.payment} onChange={(e) => set("payment", e.target.value)} aria-label="Forma de pagamento">
          <option value="all">Todas as formas</option>
          <option value="pix">Pix</option>
          <option value="debit">Débito</option>
          <option value="cash">Dinheiro</option>
          {data.cards.map((c) => (
            <option key={c.id} value={`card:${c.id}`}>
              {c.type === "benefit" ? "Benefício" : "Cartão"} {c.name}
            </option>
          ))}
        </NativeSelect>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="col-span-2 justify-self-start lg:col-span-4" onClick={() => onChange({ ...EMPTY_FILTERS, search: value.search })}>
            <X /> Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
