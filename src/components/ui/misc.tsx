import type { HTMLAttributes, ReactNode } from "react";
import { Checkbox as CB, Switch as SW, Select as S } from "radix-ui";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-card text-card-foreground shadow-card", className)} {...props} />;
}

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  label,
  color,
}: {
  checked: boolean | "indeterminate";
  onCheckedChange(v: boolean): void;
  className?: string;
  label?: string;
  color?: string;
}) {
  return (
    <CB.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "relative grid size-5 shrink-0 cursor-pointer place-items-center rounded-md border-2 border-input bg-card transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-income data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-income/60",
        "before:absolute before:-inset-2.5 before:content-['']",
        className,
      )}
      style={color && checked ? { background: color } : undefined}
    >
      <CB.Indicator className="text-white">
        {checked === "indeterminate" ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
      </CB.Indicator>
    </CB.Root>
  );
}

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange(v: boolean): void; id?: string }) {
  return (
    <SW.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=checked]:bg-primary"
    >
      <SW.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SW.Root>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color ?? "var(--primary)" }}
      />
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Badge({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", className)} style={style}>
      {children}
    </span>
  );
}

/** Controle segmentado (abas compactas). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium text-muted-foreground transition-all [&_svg]:size-4",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
            value === o.value && cn("bg-card text-foreground shadow-sm", o.activeClass),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Select com itens ricos (bolinha de cor etc.). */
export function RichSelect({
  value,
  onChange,
  placeholder,
  items,
  id,
  className,
}: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  items: { value: string; label: string; color?: string; icon?: ReactNode }[];
  id?: string;
  className?: string;
}) {
  return (
    <S.Root value={value || undefined} onValueChange={onChange}>
      <S.Trigger
        id={id}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20 data-[placeholder]:text-muted-foreground",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 opacity-60" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-72 w-[var(--radix-select-trigger-width)] min-w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-xl data-[state=open]:animate-in"
        >
          <S.Viewport className="p-1">
            {items.map((it) => (
              <S.Item
                key={it.value}
                value={it.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-2.5 pr-8 text-sm outline-none data-[highlighted]:bg-accent"
              >
                {it.color ? <Dot color={it.color} /> : it.icon}
                <S.ItemText>{it.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-primary" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

export const PALETTE = [
  "#10b981", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#f43f5e", "#ec4899",
  "#d946ef", "#a855f7", "#8b5cf6", "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6",
  "#64748b", "#78716c", "#0f172a", "#b45309",
];

export function ColorPicker({ value, onChange }: { value: string; onChange(c: string): void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            "size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
            value.toLowerCase() === c && "ring-2 ring-foreground",
          )}
          style={{ background: c }}
        />
      ))}
      <label
        className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-input text-xs text-muted-foreground"
        title="Cor personalizada"
      >
        +
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-6">{icon}</div>
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}
