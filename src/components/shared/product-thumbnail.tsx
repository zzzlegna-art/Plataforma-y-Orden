import { useState } from "react";

import { cn } from "@/lib/utils";

type ProductThumbnailProps = {
  src?: string | null;
  alt: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
};

/**
 * Miniatura consistente para referencias de inventario.
 * No muestra un sustituto si el producto no tiene fotografía o la URL falla.
 */
export const ProductThumbnail = ({
  src,
  alt,
  size = "sm",
  className,
}: ProductThumbnailProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return null;

  const sizeClass = {
    xs: "h-8 w-8",
    sm: "h-10 w-10",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
    "2xl": "h-28 w-28",
  }[size];

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cn(
        "shrink-0 rounded-lg border bg-background object-contain p-0.5",
        sizeClass,
        className,
      )}
    />
  );
};
