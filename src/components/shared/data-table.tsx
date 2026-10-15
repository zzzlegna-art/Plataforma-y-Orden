import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

/** Cuántas filas se dibujan por página: listas de miles de filas responden al instante. */
const TAMANO_PAGINA = 50;

/**
 * Tabla responsive: en escritorio muestra la tabla y en móvil la misma
 * información como tarjetas. Solo se dibuja la vista que corresponde al tamaño
 * de pantalla (antes se montaban las dos, lo que duplicaba el trabajo) y las
 * listas largas se paginan.
 */
export const DataTable = <T,>({
  rows,
  columns,
  renderCard,
  rowKey,
  onRowClick,
  rowClassName,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  footer,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  renderCard: (row: T) => ReactNode;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Clases extra por fila (por ejemplo, para resaltar las verificadas en un control físico). */
  rowClassName?: (row: T) => string | undefined;
  emptyTitle: string;
  emptyDescription?: string;
  /** Ícono del estado vacío; sin él, la lista vacía se ve como puro texto. */
  emptyIcon?: LucideIcon;
  /** Atajo para resolver el vacío (por ejemplo, "Crear el primer pedido"). */
  emptyAction?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) => {
  const { t } = useTranslation();
  const esMovil = useIsMobile();
  const [pagina, setPagina] = useState(0);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(rows.length / TAMANO_PAGINA));
  const actual = Math.min(pagina, totalPaginas - 1);
  const desde = actual * TAMANO_PAGINA;
  const visibles = rows.slice(desde, desde + TAMANO_PAGINA);
  const paginado = rows.length > TAMANO_PAGINA;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      {esMovil ? (
        <div className="divide-y">
          {visibles.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "p-4",
                onRowClick && "cursor-pointer active:bg-muted/60",
                rowClassName?.(row),
              )}
            >
              {renderCard(row)}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.className,
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    onRowClick &&
                      "cursor-pointer [&>td:first-child]:transition-shadow [@media(hover:hover)]:hover:[&>td:first-child]:shadow-[inset_3px_0_0_hsl(var(--primary))] motion-reduce:[&>td:first-child]:transition-none",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.align === "right" && "text-right",
                        column.align === "center" && "text-center",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {footer || paginado ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>{footer}</span>
          {paginado ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={actual === 0}
                onClick={() => setPagina(actual - 1)}
              >
                <ChevronLeft />
                {t("common.previous")}
              </Button>
              <span className="font-tabular text-xs">
                {desde + 1}–{Math.min(desde + TAMANO_PAGINA, rows.length)} / {rows.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={actual >= totalPaginas - 1}
                onClick={() => setPagina(actual + 1)}
              >
                {t("common.next")}
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
