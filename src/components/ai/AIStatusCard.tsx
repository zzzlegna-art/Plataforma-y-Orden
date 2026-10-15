import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

export function AIStatusCard() {
  return (
    <section className={cn("flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm")}>
      <span className="rounded-md bg-primary/10 p-2 text-primary">
        <Bot className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">Bodega6A AI Automation</h2>
        <p className="text-xs text-muted-foreground">
          Motor de automatización conectado y listo para ejecutar tareas.
        </p>
      </div>
    </section>
  );
}
