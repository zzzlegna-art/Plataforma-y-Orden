import type { ReactNode } from "react";

/** Encabezado estándar de página: título, descripción y acciones. */
export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div
    className={
      className ??
      "nx-page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    }
  >
    <div className="min-w-0">
      <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
  </div>
);
