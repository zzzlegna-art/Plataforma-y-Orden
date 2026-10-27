import { useState } from "react";

import { cn } from "@/lib/utils";

type ProductThumbnailProps = {
  src?: string | null;
  alt: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
};

// Fotos opcionales en garantías históricas; exclusivamente para nombres exactos de teléfonos,
// nunca para repuestos como "Display iPhone 13 Pro Max", baterías o flex.
const REFERENCE_IMAGE_FALLBACKS = [
  {
    pattern: /^(?:apple\s+)?iphone\s*16\s*pro\s*max(?:\s+\d+\s*(?:gb|tb))?$/i,
    src: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-max-naturaltitanium-select?wid=5120&hei=2880&fmt=png-alpha",
  },
  {
    pattern: /^(?:apple\s+)?iphone\s*16\s*pro(?:\s+\d+\s*(?:gb|tb))?$/i,
    src: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-deserttitanium-select?wid=5120&hei=2880&fmt=png-alpha",
  },
  {
    pattern: /^(?:apple\s+)?iphone\s*13\s*pro\s*max(?:\s+\d+\s*(?:gb|tb))?$/i,
    src: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-13-pro-max-gold-select?wid=940&hei=1112&fmt=png-alpha",
  },
] as const;

export const getProductReferenceImageFallback = (reference: string): string | undefined => {
  const normalized = reference
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return REFERENCE_IMAGE_FALLBACKS.find(({ pattern }) => pattern.test(normalized))?.src;
};

/**
 * Miniatura consistente para referencias de inventario.
 * Prioriza la imagen explícita; solo un nombre exacto de teléfono puede recibir
 * la fotografía histórica de respaldo, nunca una referencia de repuestos.
 */
export const ProductThumbnail = ({
  src,
  alt,
  size = "sm",
  className,
}: ProductThumbnailProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fallbackSrc = getProductReferenceImageFallback(alt);
  const primaryAvailable = Boolean(src && failedSrc !== src && failedSrc !== fallbackSrc);
  const imageSrc = primaryAvailable ? src : fallbackSrc;

  if (!imageSrc || failedSrc === imageSrc) return null;

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
      src={imageSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(imageSrc)}
      className={cn(
        "shrink-0 rounded-lg border bg-background object-contain p-0.5",
        sizeClass,
        className,
      )}
    />
  );
};
