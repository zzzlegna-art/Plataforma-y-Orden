/**
 * Gestión de cuentas por parte del administrador.
 *
 * El registro libre está desactivado: el administrador crea cada usuario con su
 * correo, contraseña y rol desde Administración → Usuarios, y puede restablecer
 * contraseñas. Solo responde a administradores activos.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const responder = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    return responder({ ok: false, error: "sin_configuracion" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // La identidad se verifica contra Auth: decodificar el JWT no comprueba su firma,
  // así que no se confía en el payload aunque `verify_jwt` esté activo en el despliegue.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: sesionError } = token
    ? await admin.auth.getUser(token)
    : { data: null, error: new Error("sin_token") };
  const uid = sesion?.user?.id ?? null;
  if (sesionError || !uid) return responder({ ok: false, error: "sin_autenticacion" }, 401);

  // Solo el personal administrador activo puede gestionar cuentas.
  const { data: perfil, error: perfilError } = await admin
    .from("bodega_profiles")
    .select("role, is_active")
    .eq("id", uid)
    .maybeSingle();
  if (perfilError || !perfil || perfil.role !== "admin" || perfil.is_active !== true) {
    return responder({ ok: false, error: "sin_permiso" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const accion = texto(body.accion);

  if (accion === "crear") {
    const email = texto(body.email)?.toLowerCase();
    const password = texto(body.password) ?? "";
    const nombre = texto(body.nombre) ?? email ?? "Usuario";
    const rol = body.rol === "admin" ? "admin" : "bodeguero";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder({ ok: false, error: "email_invalido" });
    }
    if (password.length < 8) {
      return responder({ ok: false, error: "clave_corta" });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: nombre },
    });
    if (error || !data?.user) {
      console.error("No se pudo crear la cuenta", error?.message ?? "");
      return responder({ ok: false, error: error?.message ?? "error_desconocido" });
    }

    // El disparador de alta ya creó el perfil; aquí se fija el rol elegido.
    const { error: perfilUpdate } = await admin
      .from("bodega_profiles")
      .update({ role: rol, full_name: nombre, email })
      .eq("id", data.user.id);
    if (perfilUpdate) {
      console.error("No se pudo fijar el rol", perfilUpdate.message);
      return responder({ ok: false, error: perfilUpdate.message });
    }

    console.log(`Cuenta creada: ${email} (${rol})`);
    return responder({ ok: true, id: data.user.id });
  }

  if (accion === "clave") {
    const userId = texto(body.userId);
    const password = texto(body.password) ?? "";

    if (!userId) return responder({ ok: false, error: "sin_usuario" });
    if (password.length < 8) return responder({ ok: false, error: "clave_corta" });

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error("No se pudo restablecer la contraseña", error.message);
      return responder({ ok: false, error: error.message });
    }
    return responder({ ok: true });
  }

  return responder({ ok: false, error: "accion_desconocida" });
});
