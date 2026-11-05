import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { SessionProvider } from "@/data/session";
import { PrefsProvider, usePrefs } from "@/hooks/prefs";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function ThemedToaster() {
  const { resolvedTheme } = usePrefs();
  return <Toaster theme={resolvedTheme} position="top-center" richColors closeButton toastOptions={{ className: "!rounded-xl" }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrefsProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <BrowserRouter>
            <App />
            <ThemedToaster />
          </BrowserRouter>
        </SessionProvider>
      </QueryClientProvider>
    </PrefsProvider>
  </React.StrictMode>,
);
