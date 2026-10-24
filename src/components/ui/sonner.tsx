import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme = "dark" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      closeButton
      visibleToasts={3}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-border/80 group-[.toaster]:bg-card/95 group-[.toaster]:text-card-foreground group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-md",
          // Acento de color a la izquierda según el tipo de aviso (éxito, error, alerta, info).
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-success",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-warning",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-info",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast }
