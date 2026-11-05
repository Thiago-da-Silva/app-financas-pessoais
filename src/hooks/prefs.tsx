import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeStorage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export type Theme = "light" | "dark" | "system";
const store = safeStorage();

interface Prefs {
  theme: Theme;
  setTheme(t: Theme): void;
  resolvedTheme: "light" | "dark";
  hideValues: boolean;
  toggleHideValues(): void;
  /** Formata valores respeitando o modo "esconder valores". */
  money(cents: number): string;
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (store.get("theme") as Theme) || "system");
  const [hideValues, setHide] = useState(() => store.get("hide-values") === "1");
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#0b0d12" : "#f6f7f9");
  }, [resolvedTheme]);

  const value = useMemo<Prefs>(
    () => ({
      theme,
      resolvedTheme,
      setTheme(t) {
        store.set("theme", t);
        setThemeState(t);
      },
      hideValues,
      toggleHideValues() {
        setHide((h) => {
          store.set("hide-values", h ? "0" : "1");
          return !h;
        });
      },
      money: (c) => (hideValues ? "R$ •••••" : formatMoney(c)),
    }),
    [theme, resolvedTheme, hideValues],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs fora do provider");
  return ctx;
}
