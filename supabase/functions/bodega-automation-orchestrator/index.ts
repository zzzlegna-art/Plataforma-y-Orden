import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!body.instruction) {
      return new Response(JSON.stringify({ error: "instruction required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("BODEGA_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("BODEGA_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase
      .from("ai_automation_tasks")
      .insert({
        user_id: body.user_id ?? null,
        instruction: body.instruction,
        status: "analyzing"
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      task: data,
      next: "Task created. Ready for AI planner, GitHub executor and deployment pipeline."
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
