import { cn } from "@/lib/utils";

const SIZES = {
  // Pantallas completas (carga inicial, inicio y cierre de sesión).
  lg: { box: "h-32 w-32", ring: "border-[3px]", logo: "h-14 w-20" },
  // Aviso pequeño de "Guardando…".
  sm: { box: "h-9 w-9", ring: "border-2", logo: "h-4 w-6" },
} as const;

/**
 * Indicador de carga de la marca: círculo que gira con el logo que flota en el centro.
 * Es el único estilo de "cargando" de la app, para que todas las pantallas se vean igual.
 */
export const BrandSpinner = ({
  size = "lg",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) => {
  const styles = SIZES[size];
  return (
    <div className={cn("relative flex items-center justify-center", styles.box, className)}>
      <span
        className={cn(
          "absolute inset-0 animate-spin rounded-full border-primary/20 border-t-primary motion-reduce:animate-none",
          styles.ring,
        )}
      />
      <img
        src="/icons/logo-bodega6a.png"
        alt=""
        className={cn("animate-logo-float object-contain motion-reduce:animate-none", styles.logo)}
      />
    </div>
  );
};
