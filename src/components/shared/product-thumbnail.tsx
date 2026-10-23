import { useState } from "react";

import { cn } from "@/lib/utils";

type ProductThumbnailProps = {
  src?: string | null;
  alt: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
};

// Fotos oficiales de referencia para modelos que pueden existir en garantías históricas
// sin una URL de imagen guardada en el catálogo.
const REFERENCE_IMAGE_FALLBACKS = [
  {
    pattern: /\biphone\s*16\s*pro\s*max\b/i,
    src: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-max-naturaltitanium-select?wid=5120&hei=2880&fmt=png-alpha",
  },
  {
    pattern: /\biphone\s*16\s*pro\b/i,
    src: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-deserttitanium-select?wid=5120&hei=2880&fmt=png-alpha",
  },
] as const;

const getReferenceImageFallback = (reference: string): string | undefined => {
  const normalized = reference
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return REFERENCE_IMAGE_FALLBACKS.find(({ pattern }) => pattern.test(normalized))?.src;
};

/**
 * Miniatura consistente para referencias de inventario.
 * Prioriza la imagen del catálogo y usa una foto de referencia conocida si falta.
 */
export const ProductThumbnail = ({
  src,
  alt,
  size = "sm",
  className,
}: ProductThumbnailProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fallbackSrc = getReferenceImageFallback(alt);
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
