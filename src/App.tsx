import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { UpdateWatcher } from "@/components/shared/update-watcher";
import { registerServiceWorker } from "@/lib/pwa";
import { AppProvider } from "@/store/app-provider";
import { routers } from "./router";

const App = () => {
  const router = createBrowserRouter(routers);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <TooltipProvider>
        <AppProvider>
          <Toaster />
          <Sonner />
          <UpdateWatcher />
          <RouterProvider router={router} />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default App;
