import { useRef, useState, type ReactNode } from "react";
import { Dialog as D, Popover as P, DropdownMenu as DM } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// ---------------------------------------------------------------------
// Dialog — vira "bottom sheet" no celular
// ---------------------------------------------------------------------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] w-full flex-col border border-border bg-card text-card-foreground shadow-2xl outline-none data-[state=open]:animate-in",
            "inset-x-0 bottom-0 rounded-t-3xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted sm:hidden" />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:pt-5">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                <X />
              </Button>
            </D.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4 pt-1">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ---------------------------------------------------------------------
// Popover que abre ao passar o mouse (desktop) ou ao tocar (celular)
// ---------------------------------------------------------------------

export function InfoPopover({
  trigger,
  children,
  className,
  side = "bottom",
  align = "start",
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hoverable = typeof matchMedia !== "undefined" && matchMedia("(hover: hover)").matches;
  const enter = () => {
    if (!hoverable) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 180);
  };
  const leave = () => {
    if (!hoverable) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild onMouseEnter={enter} onMouseLeave={leave}>
        {trigger}
      </P.Trigger>
      <P.Portal>
        <P.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "z-50 w-72 max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-popover p-4 text-sm shadow-xl outline-none data-[state=open]:animate-in",
            className,
          )}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-44 rounded-xl border border-border bg-popover p-1 text-sm shadow-xl data-[state=open]:animate-in"
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  destructive,
  icon,
}: {
  children: ReactNode;
  onSelect(): void;
  destructive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-accent [&_svg]:size-4",
        destructive && "text-expense",
      )}
    >
      {icon}
      {children}
    </DM.Item>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5 text-xs text-muted-foreground">{children}</DM.Label>;
}
