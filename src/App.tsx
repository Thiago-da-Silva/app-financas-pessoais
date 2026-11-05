import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "@/data/session";
import { Spinner } from "@/components/ui/misc";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/Login";
import ResetPasswordPage from "@/pages/ResetPassword";
import DashboardPage from "@/pages/Dashboard";
import CategoriesPage from "@/pages/Categories";
import CardsPage from "@/pages/Cards";
import ProfilePage from "@/pages/Profile";

export default function App() {
  const { status, passwordRecovery } = useSession();

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center text-primary">
        <Spinner />
      </div>
    );
  }

  if (passwordRecovery) return <ResetPasswordPage />;

  if (status === "signedOut") {
    return (
      <Routes>
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="cartoes" element={<CardsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
