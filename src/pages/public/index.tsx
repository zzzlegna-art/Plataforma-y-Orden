import { ArrowRight, ClipboardCheck, LockKeyhole, PackageCheck, ScanBarcode, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/shared/brand-logo";

const CAPABILITIES = [
  {
    icon: PackageCheck,
    title: "Inventario y recepción",
    detail: "Control de equipos y movimientos de mercancía.",
  },
  {
    icon: ScanBarcode,
    title: "Seriales e IMEI",
    detail: "Trazabilidad de dispositivos dentro de la operación.",
  },
  {
    icon: ClipboardCheck,
    title: "Pedidos y garantías",
    detail: "Seguimiento de procesos desde un solo lugar.",
  },
];

/**
 * Presentación pública de NEXORA. Sin estadísticas reales, usuarios,
 * información de clientes ni acceso a recursos privados.
 */
const PublicLanding = () => (
  <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-56 -top-44 h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-[95px]" />
      <div className="absolute -bottom-56 -right-48 h-[38rem] w-[38rem] rounded-full bg-blue-500/10 blur-[110px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,hsl(var(--primary)/.05),transparent_60%)]" />
    </div>

    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
      <Link to="/" aria-label="NEXORA Smart Operations, inicio" className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <BrandLogo variant="horizontal" className="h-[50px] w-[210px] max-w-[48vw] sm:h-[61px] sm:w-[262px]" alt="Logotipo de NEXORA Smart Operations" />
      </Link>
      <Link
        to="/login"
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Iniciar sesión <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </header>

    <main id="contenido" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
      <section aria-labelledby="titulo-nexora" className="max-w-[780px]">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[.07] px-4 py-2 text-[11px] font-semibold uppercase tracking-[.16em] text-primary">
          <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
          Plataforma de acceso privado
        </div>
        <h1 id="titulo-nexora" className="max-w-[750px] font-['Space_Grotesk'] text-4xl font-bold leading-[1.12] tracking-[-.045em] sm:text-5xl lg:text-[4rem]">
          NEXORA <span className="text-primary">Smart Operations</span>
        </h1>
        <p className="mt-5 max-w-[650px] text-base leading-8 text-muted-foreground sm:text-lg">
          Una plataforma para organizar la gestión de inventarios, seriales e IMEI,
          recepciones de mercancía, pedidos y garantías en un solo entorno de trabajo.
        </p>
        <p className="mt-3 max-w-[640px] text-sm leading-7 text-muted-foreground">
          El acceso a los módulos de operación está reservado al personal autorizado.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_30px_-15px_hsl(var(--primary))] transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Entrar a NEXORA <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            Acceso restringido
          </span>
        </div>
      </section>

      <section aria-label="Áreas de gestión de NEXORA" className="mt-16 grid gap-3 sm:mt-20 sm:grid-cols-3 sm:gap-4">
        {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
          <article key={title} className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{detail}</p>
          </article>
        ))}
      </section>
    </main>

    <footer className="border-t border-border/70 bg-background/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-muted-foreground sm:px-8">
        <span>NEXORA · Smart Operations</span>
        <span>Plataforma de uso interno. Información operativa protegida.</span>
      </div>
    </footer>
  </div>
);

export default PublicLanding;
