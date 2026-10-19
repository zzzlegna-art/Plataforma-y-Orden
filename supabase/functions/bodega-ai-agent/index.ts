// Nexora AI Developer Agent
// Version 1.4: repository analysis layer scaffold

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AgentRequest {
  task_id?: string;
  request?: string;
  repository_context?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function analyzeRepositoryContext(context?: string) {
  if (!context) {
    return {
      loaded: false,
      files: [],
      note: "Repository reader pending GitHub App connection"
    };
  }

  return {
    loaded: true,
    files: context.split(",").map((file) => file.trim())
  };
}

function buildImplementationPlan(request: string, repository: unknown) {
  return {
    objective: request,
    repository_analysis: repository,
    steps: [
      "Locate affected components",
      "Review existing business rules",
      "Prepare frontend and database changes",
      "Create implementation proposal"
    ],
    safety: [
      "Never modify main directly",
      "Use pull requests for changes"
    ]
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as AgentRequest;

    if (!body.request && !body.task_id) {
      return new Response(JSON.stringify({ error: "Missing task request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: knowledge } = await supabase
      .from("bodega_ai_knowledge")
      .select("topic, content")
      .limit(10);

    const repository = analyzeRepositoryContext(body.repository_context);

    return new Response(JSON.stringify({
      agent: "Nexora AI Developer",
      version: "1.4",
      status: "repository_analysis_ready",
      task_id: body.task_id ?? null,
      knowledge_items: knowledge?.length ?? 0,
      analysis: buildImplementationPlan(body.request ?? "", repository)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
