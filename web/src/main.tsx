import "@fontsource-variable/figtree";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { ConfirmProvider } from "./components/confirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyRememberedTheme, applyTheme } from "./lib/theme";

// before anything is drawn: the theme this browser saw last, or else the device's own light or dark
applyTheme("system", []); applyRememberedTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true, retry: (n, e) => n < 1 && !(e as { status?: number }).status } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <ErrorBoundary><App /></ErrorBoundary>
        <Toaster position="bottom-center" toastOptions={{ className: "!rounded-xl !bg-ink !text-bg !border-0 !font-sans" }} />
      </ConfirmProvider>
    </QueryClientProvider>
  </StrictMode>,
);
