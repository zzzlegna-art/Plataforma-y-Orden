import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Boxes,
  CircleDot,
  CheckCircle2,
  Lock,
  Mail,
  ScanBarcode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { InstallAppButton } from "@/components/shared/install-app-button";
import { BrandLogo } from "@/components/shared/brand-logo";
import { PlatformGuide } from "@/components/shared/platform-guide";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { conTransicionCircular } from "@/lib/circular-transition";
import { cn } from "@/lib/utils";
import "./login-premium.css";

const FEATURES = [
  { icon: ScanBarcode, key: "auth.featureReceptions" },
  { icon: Boxes, key: "auth.featureInventory" },
  { icon: ShieldCheck, key: "auth.featureWarranties" },
];

/** Inicio de sesión. Las cuentas las crea el administrador. */
const Login = () => {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Se incrementa en cada intento fallido: al usarlo como key, React vuelve a montar el
  // bloque de campos y reinicia la animación de "sacudida", incluso si el error es el mismo
  // que el intento anterior (si no, la 2ª vez no habría cambio de estado que la reactive).
  const [shakeKey, setShakeKey] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (user) navigate(from ?? "/panel", { replace: true });
  }, [user, from, navigate]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErrorKey(null);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) {
      // En móvil el teclado suele tapar los campos justo cuando más importa verlos (el
      // error acaba de aparecer). Se cierra el teclado quitando el foco del campo activo.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setErrorKey(result.error ?? "errors.invalidCredentials");
      setShakeKey((key) => key + 1);
      return;
    }
    // Misma animación circular que el interruptor de tema, saliendo del botón de entrar.
    conTransicionCircular(submitRef.current, () => navigate(from ?? "/panel", { replace: true }));
  };

  return (
    <div className="nx-login-premium nx-login-scroll relative flex min-h-screen flex-col items-center bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--background)/0)_0%,hsl(var(--background)/.55)_100%)]" />
      </div>

      <div className="nx-login-toolbar relative z-20 flex w-full max-w-6xl items-center justify-between">
        <span className="nx-login-toolbar-id"><ShieldCheck aria-hidden="true" className="h-4 w-4" /><strong>NEXORA</strong><span className="nx-login-toolbar-divider" aria-hidden="true" /><span>Acceso privado</span></span>
        <ThemeToggle />
      </div>

      <main className="nx-login-stage relative z-10 grid w-full max-w-6xl overflow-hidden border bg-card lg:grid-cols-[1.05fr_.95fr]">
        <section className="nx-login-story relative hidden min-w-0 flex-col justify-between overflow-hidden p-8 text-slate-900 sm:p-10 dark:text-white lg:flex">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-400/15" />
            <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl dark:bg-sky-500/10" />
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.08),rgba(236,254,255,.18))] dark:bg-[linear-gradient(145deg,rgba(11,20,32,.1),rgba(11,20,32,.92))]" />
          </div>

          <div className="nx-login-story-brand relative flex flex-col items-start gap-1">
            <BrandLogo variant="horizontal" className="h-[62px] w-[235px] max-w-full" />
            <p className="pl-[62px] text-xs text-slate-600 dark:text-slate-300">{t("auth.brandTagline")}</p>
          </div>

          <div className="nx-login-story-content relative mt-10 max-w-md space-y-5"><div className="nx-login-workspace-label" aria-hidden="true"><span className="nx-login-workspace-line" /> PLATAFORMA DE OPERACIONES <span className="nx-login-workspace-code">01 / NEXORA</span></div>
            <span className="nx-login-operational-badge inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Control operativo
            </span>
            <div className="space-y-3">
              <h1 className="nx-login-headline max-w-md font-semibold leading-tight">
                {t("auth.heroTitle")}
              </h1>
              <p className="nx-login-story-description max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t("auth.heroSubtitle")}
              </p>
            </div>

            <ul className="nx-login-feature-list grid gap-2.5 pt-2">
              {FEATURES.map((feature) => (
                <li
                  key={feature.key}
                  className="nx-login-feature flex items-center gap-3 rounded-xl border px-3 py-3 text-sm text-slate-800 dark:text-slate-100"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-300">
                    <feature.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="leading-5">{t(feature.key)}</span>
                  <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-cyan-700/75 dark:text-cyan-300/75" />
                </li>
              ))}
            </ul>
          </div>

          <div className="nx-login-trust relative mt-10 flex items-center justify-between gap-4 border-t pt-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-300">
                <ShieldCheck className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Acceso protegido</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-400">Tu operación, en un solo lugar</p>
              </div>
            </div>
            <span className="hidden text-[10px] font-semibold tracking-[0.16em] text-slate-500 xl:block">
              NEXORA / BUSINESS
            </span>
          </div>
        </section>

        <section className="nx-login-access flex min-w-0 flex-col justify-center px-5 py-8 sm:px-10 sm:py-10 lg:px-12">
          <div className="nx-login-access-inner mx-auto w-full max-w-[410px] animate-fade-in"><div className="nx-login-access-index hidden items-center justify-between lg:flex"><span className="inline-flex items-center gap-2"><CircleDot className="h-3.5 w-3.5" /> IDENTIFICACIÓN</span><span>01 — 02</span></div>
            <div className="mb-8 flex flex-col items-start gap-1 lg:hidden">
              <BrandLogo variant="horizontal" className="h-12 w-[190px] max-w-full" />
              <p className="pl-12 text-xs text-muted-foreground">{t("auth.brandTagline")}</p>
            </div>

            <div className="nx-login-access-intro mb-7">
              <span className="nx-login-access-eyebrow mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/.12)]" />
                Acceso a Nexora
              </span>
              <h2 className="nx-login-access-title text-2xl font-semibold tracking-[-0.035em]">
                {t("auth.title")}
              </h2>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {t("auth.subtitle")}
              </p>
            </div>

            <form onSubmit={onSubmit} className="nx-login-form space-y-4">
              <div
                key={shakeKey}
                className={cn("space-y-4", errorKey && "animate-shake")}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="tu@empresa.com"
                      disabled={loading}
                      className={cn(
                        "nx-login-field h-11 rounded-xl pl-9",
                        errorKey && "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      disabled={loading}
                      className={cn(
                        "nx-login-field h-11 rounded-xl pl-9",
                        errorKey && "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                  </div>
                </div>

                {errorKey ? (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                    {t(errorKey)}
                  </p>
                ) : null}
              </div>

              <Button
                ref={submitRef}
                type="submit"
                className="nx-login-submit group relative h-11 w-full overflow-hidden rounded-xl before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent before:transition-transform before:duration-700 hover:before:translate-x-full active:before:translate-x-full motion-reduce:before:hidden"
                loading={loading}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {loading ? t("auth.signingIn") : t("auth.signIn")}
                  {loading ? null : (
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-active:translate-x-1" />
                  )}
                </span>
              </Button>
            </form>

            <div className="nx-login-help mt-6 border-t border-border/70 pt-4">
              <p className="mb-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("guide.firstTime")}
              </p>
              <div className="space-y-2">
                <PlatformGuide />
                <InstallAppButton variant="hero" soloInstalar />
              </div>
            </div>
          </div>
        </section>
      </main>

      <p className="nx-login-footnote relative z-10 mt-4 max-w-6xl px-2 text-center text-[11px] leading-5 text-muted-foreground">
        {t("common.localModeNote")}
      </p>
    </div>
  );
};

export default Login;
