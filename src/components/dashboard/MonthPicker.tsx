import { useState } from "react";
import { Popover as P } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, currentMonth, monthLabel, parts } from "@/lib/dates";
import { cn } from "@/lib/utils";

const SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function MonthPicker({ value, onChange }: { value: string; onChange(m: string): void }) {
  const [open, setOpen] = useState(false);
  const { y, m } = parts(value);
  const [year, setYear] = useState(y);
  const isCurrent = value === currentMonth();

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" onClick={() => onChange(addMonths(value, -1))} aria-label="Mês anterior">
        <ChevronLeft />
      </Button>
      <P.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setYear(y);
        }}
      >
        <P.Trigger asChild>
          <Button variant="outline" className="min-w-40 justify-center font-semibold sm:min-w-48">
            <CalendarDays className="text-muted-foreground" />
            {monthLabel(value)}
          </Button>
        </P.Trigger>
        <P.Portal>
          <P.Content
            sideOffset={6}
            align="center"
            className="z-50 w-72 rounded-2xl border border-border bg-popover p-3 shadow-xl data-[state=open]:animate-in"
          >
            <div className="mb-2 flex items-center justify-between">
              <Button variant="ghost" size="icon-sm" onClick={() => setYear(year - 1)} aria-label="Ano anterior">
                <ChevronLeft />
              </Button>
              <span className="font-semibold tabular">{year}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setYear(year + 1)} aria-label="Próximo ano">
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {SHORT.map((label, i) => {
                const selected = year === y && i + 1 === m;
                const cur = currentMonth() === `${year}-${String(i + 1).padStart(2, "0")}-01`;
                return (
                  <button
                    key={label}
                    className={cn(
                      "h-10 cursor-pointer rounded-xl text-sm transition hover:bg-accent",
                      cur && "font-semibold text-primary",
                      selected && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                    onClick={() => {
                      onChange(`${year}-${String(i + 1).padStart(2, "0")}-01`);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                onChange(currentMonth());
                setOpen(false);
              }}
            >
              Ir para o mês atual
            </Button>
          </P.Content>
        </P.Portal>
      </P.Root>
      <Button variant="outline" size="icon" onClick={() => onChange(addMonths(value, 1))} aria-label="Próximo mês">
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => onChange(currentMonth())}>
          Hoje
        </Button>
      )}
    </div>
  );
}
