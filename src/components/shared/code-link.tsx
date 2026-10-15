import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * Enlace a un código (pedido, recepción o garantía). Va subrayado con puntos para que se note
 * que se puede tocar también en el celular, donde no existe el "pasar el cursor".
 */
export const CodeLink = ({
  to,
  children,
  className,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <Link
    to={to}
    className={cn(
      "font-tabular font-medium text-primary underline decoration-dotted underline-offset-4 transition-colors hover:decoration-solid",
      className,
    )}
  >
    {children}
  </Link>
);

/**
 * Texto donde el código de `enlace` se vuelve un enlace. Si el texto no contiene el código
 * (por ejemplo una nota escrita a mano), el enlace se agrega al final para no perderlo.
 */
export const TextWithCodeLink = ({
  text,
  enlace,
}: {
  text: string;
  enlace?: { to: string; codigo: string };
}) => {
  if (!enlace) return <>{text}</>;
  const index = text.indexOf(enlace.codigo);
  if (index === -1) {
    return (
      <>
        {text} · <CodeLink to={enlace.to}>{enlace.codigo}</CodeLink>
      </>
    );
  }
  return (
    <>
      {text.slice(0, index)}
      <CodeLink to={enlace.to}>{enlace.codigo}</CodeLink>
      {text.slice(index + enlace.codigo.length)}
    </>
  );
};
