/**
 * Círculo y check que se dibujan con el trazo (en vez de aparecer de golpe). Pensado como
 * ícono de un toast de éxito para las confirmaciones con más peso (crear o despachar un
 * pedido), sin retrasar nada: el toast se muestra igual de rápido, solo que el ícono se anima.
 */
export const DrawnCheckIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
    <circle
      cx={12}
      cy={12}
      r={10}
      pathLength={1}
      strokeDasharray={1}
      className="animate-draw-circle stroke-success"
      strokeWidth={2}
    />
    <path
      d="M7.5 12.5l3 3 6-6.5"
      pathLength={1}
      strokeDasharray={1}
      className="animate-draw-check stroke-success"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
