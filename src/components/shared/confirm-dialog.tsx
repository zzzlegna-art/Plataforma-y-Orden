import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/** Diálogo de confirmación para acciones destructivas o irreversibles. */
export const ConfirmDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
}) => {
  const { t } = useTranslation();
  const actionRef = useRef<HTMLButtonElement>(null);
  const ocupadoRef = useRef(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent
        // Al abrir, el foco va a "Confirmar" para que Enter confirme. En acciones
        // destructivas se deja el foco en "Cancelar": un Enter de más no debe borrar nada.
        onOpenAutoFocus={(event) => {
          if (destructive) return;
          event.preventDefault();
          actionRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            ref={actionRef}
            onClick={() => {
              // Un doble clic rápido no debe confirmar dos veces.
              if (ocupadoRef.current) return;
              ocupadoRef.current = true;
              const liberar = () => {
                ocupadoRef.current = false;
              };
              try {
                void Promise.resolve(onConfirm()).then(liberar, liberar);
              } catch (error) {
                liberar();
                throw error;
              }
            }}
            className={cn(
              // Entrada con rebote, elevación + brillo al pasar el cursor y "presión" al hacer clic.
              "group relative overflow-hidden transition-all animate-pop-in [animation-delay:120ms] [animation-fill-mode:backwards]",
              "hover:-translate-y-0.5 hover:opacity-100 active:translate-y-0",
              "motion-reduce:animate-none motion-reduce:hover:translate-y-0",
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_8px_20px_-6px_hsl(var(--destructive)/0.65)]"
                : "hover:shadow-glow",
            )}
          >
            {/* Destello que cruza el botón al pasar el cursor */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/30 opacity-0 transition-all duration-700 ease-out group-hover:translate-x-[520%] group-hover:opacity-100 motion-reduce:hidden"
            />
            <span className="relative">{confirmLabel ?? t("common.confirm")}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
