/**
 * Endpoint legado retirado.
 * La gestión de usuarios opera exclusivamente mediante bodega-gestion-usuarios.
 * Se conserva esta respuesta 410 para que integraciones antiguas fallen de forma
 * explícita y no puedan seguir creando o modificando cuentas por la ruta obsoleta.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ ok: false, error: "funcion_retirada" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
