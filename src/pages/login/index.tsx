import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Boxes,
  Lock,
  Mail,
  ScanBarcode,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { InstallAppButton } from "@/components/shared/install-app-button";
import { PlatformGuide } from "@/components/shared/platform-guide";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { conTransicionCircular } from "@/lib/circular-transition";
import { cn } from "@/lib/utils";

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
    <div className="relative flex min-h-full flex-col lg:flex-row">
      <div className="absolute right-3 top-3 z-10">
        <ThemeToggle />
      </div>

      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <img
            src="/branding/nexora-symbol.webp"
            alt={t("common.appName")}
            className="h-11 w-11 rounded-lg object-cover"
          />
          <div>
            <p className="text-lg font-semibold">{t("common.appName")}</p>
            <p className="text-sm text-primary-foreground/80">{t("auth.brandTagline")}</p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">{t("auth.heroTitle")}</h1>
          <p className="text-primary-foreground/85">{t("auth.heroSubtitle")}</p>
          <ul className="space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature.key} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <feature.icon className="h-4 w-4" />
                </span>
                {t(feature.key)}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/70">{t("common.localModeNote")}</p>
      </section>

      <section className="flex flex-1 items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/branding/nexora-symbol.webp"
              alt={t("common.appName")}
              className="h-10 w-10 rounded-lg object-cover"
            />
            <div>
              <p className="font-semibold">{t("common.appName")}</p>
              <p className="text-xs text-muted-foreground">{t("auth.brandTagline")}</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">{t("auth.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                    className={cn("pl-9", errorKey && "border-destructive focus-visible:ring-destructive")}
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
                    className={cn("pl-9", errorKey && "border-destructive focus-visible:ring-destructive")}
                  />
                </div>
              </div>

              {errorKey ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t(errorKey)}
                </p>
              ) : null}
            </div>

            <Button
              ref={submitRef}
              type="submit"
              // hover: para mouse en escritorio; active: para que lo mismo pase al TOCAR en
              // móvil, donde no existe "pasar el cursor por encima", solo presionar y soltar.
              className="group relative w-full overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent before:transition-transform before:duration-700 hover:before:translate-x-full active:before:translate-x-full motion-reduce:before:hidden"
              loading={loading}
            >
              <span className="relative z-10 flex items-center gap-2">
                {loading ? t("auth.signingIn") : t("auth.signIn")}
                {loading ? null : (
                  <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1 group-active:translate-x-1" />
                )}
              </span>
            </Button>
          </form>

          <div className="mt-6 border-t pt-5">
            <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("guide.firstTime")}
            </p>
            <div className="space-y-2">
              <PlatformGuide />
              <InstallAppButton variant="hero" soloInstalar />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;
