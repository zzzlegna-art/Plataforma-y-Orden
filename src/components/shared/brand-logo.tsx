import { cn } from "@/lib/utils";

type BrandLogoVariant = "horizontal" | "symbol" | "stacked";

const sources: Record<BrandLogoVariant, { light: string; dark: string; width: number; height: number }> = {
  horizontal: {
    light: "/branding/nexora-horizontal-light.png",
    dark: "/branding/nexora-horizontal-dark.png",
    width: 556,
    height: 128,
  },
  symbol: {
    light: "/branding/nexora-symbol.png",
    dark: "/branding/nexora-symbol-dark.png",
    width: 384,
    height: 400,
  },
  stacked: {
    light: "/branding/nexora-logo-light.png",
    dark: "/branding/nexora-logo-dark.png",
    width: 448,
    height: 448,
  },
};

/**
 * Identidad oficial Nexora en PNG, con variante legible para cada tema.
 * No usa CSS filters sobre el logotipo: las dos versiones se producen
 * desde el mismo archivo maestro, conservando el degradado de la marca.
 */
export const BrandLogo = ({
  variant = "symbol",
  className,
  alt = "Nexora",
}: {
  variant?: BrandLogoVariant;
  className?: string;
  alt?: string;
}) => {
  const asset = sources[variant];
  return (
    <span className={cn("inline-block shrink-0", className)}>
      <img
        src={asset.light}
        width={asset.width}
        height={asset.height}
        alt={alt}
        draggable={false}
        className="block h-full w-full object-contain dark:hidden"
      />
      <img
        src={asset.dark}
        width={asset.width}
        height={asset.height}
        alt={alt}
        draggable={false}
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
};
