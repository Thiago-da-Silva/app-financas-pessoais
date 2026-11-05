import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CreditCard, Eye, EyeOff, LayoutDashboard, LogOut, Monitor, Moon, Sun, Tags, User } from "lucide-react";
import { useSession } from "@/data/session";
import { usePrefs } from "@/hooks/prefs";
import { useFinance } from "@/hooks/useFinance";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlay";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/categorias", label: "Categorias", icon: Tags },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
  { to: "/perfil", label: "Perfil", icon: User },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = usePrefs();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Tema">
          {resolvedTheme === "dark" ? <Moon /> : <Sun />}
        </Button>
      }
    >
      <MenuLabel>Tema</MenuLabel>
      {(
        [
          ["light", "Claro", <Sun key="s" />],
          ["dark", "Escuro", <Moon key="m" />],
          ["system", "Sistema", <Monitor key="d" />],
        ] as const
      ).map(([v, label, icon]) => (
        <MenuItem key={v} icon={icon} onSelect={() => setTheme(v)}>
          <span className={cn(theme === v && "font-semibold text-primary")}>{label}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}

export function AppLayout() {
  const { mode, email, signOut } = useSession();
  const { hideValues, toggleHideValues } = usePrefs();
  const { data } = useFinance();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {mode === "demo" && (
        <div className="bg-info-soft px-4 py-1.5 text-center text-xs text-info">
          Modo demonstração: os dados são fictícios e ficam apenas neste navegador.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
          <NavLink to="/" className="mr-4 flex items-center gap-2 font-semibold">
            <Logo />
            <span className="hidden sm:inline">Finanças</span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.slice(0, 3).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent font-medium text-foreground",
                  )
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleHideValues}
              aria-label={hideValues ? "Mostrar valores" : "Esconder valores"}
              title={hideValues ? "Mostrar valores" : "Esconder valores"}
            >
              {hideValues ? <EyeOff /> : <Eye />}
            </Button>
            <ThemeToggle />
            <Menu
              trigger={
                <button className="ml-1 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Conta">
                  <Avatar name={data?.profile.name ?? ""} url={data?.profile.avatar_url ?? null} size={34} />
                </button>
              }
            >
              <div className="px-2.5 py-2">
                <p className="text-sm font-medium">{data?.profile.name || "Minha conta"}</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
              <MenuSeparator />
              <MenuItem icon={<User />} onSelect={() => navigate("/perfil")}>
                Perfil e configurações
              </MenuItem>
              <MenuItem
                icon={<LogOut />}
                destructive
                onSelect={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                {mode === "demo" ? "Sair da demonstração" : "Sair"}
              </MenuItem>
            </Menu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>

      {/* Navegação inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] text-muted-foreground", isActive && "font-medium text-primary")
              }
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
