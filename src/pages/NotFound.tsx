import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-6 py-16">
      <div className="max-w-sm animate-fade-in text-center motion-reduce:animate-none">
        <p className="animate-pop-in bg-gradient-primary bg-clip-text text-7xl font-bold tracking-tight text-transparent motion-reduce:animate-none">
          404
        </p>
        <h1 className="mt-3 text-lg font-semibold">{t("notFound.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFound.description")}</p>
        <Button asChild className="mt-6">
          <Link to="/panel">
            <ArrowLeft />
            {t("notFound.actions.backHome")}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
