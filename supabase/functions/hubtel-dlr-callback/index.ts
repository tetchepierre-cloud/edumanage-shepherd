// supabase/functions/hubtel-dlr-callback/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    const payload = await req.json();

    // Journalise le payload brut pour identifier les vrais noms de champs
    console.log("[hubtel-dlr-callback] Payload brut :", JSON.stringify(payload));

    // Mapping souple des champs
    const messageId = payload.MessageId ?? payload.messageId ?? payload.message_id ?? null;
    const status = payload.Status ?? payload.status ?? payload.DeliveryStatus ?? null;
    const networkId = payload.NetworkId ?? payload.networkId ?? null;

    // Insère dans la table sms_delivery_log
    const { error } = await supabaseAdmin.from("sms_delivery_log").insert({
      message_id: messageId,
      status: status === null ? null : String(status),
      network_id: networkId,
      raw_payload: payload,
      received_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[hubtel-dlr-callback] Erreur d'insertion :", error);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[hubtel-dlr-callback] Erreur :", err);
    return new Response(JSON.stringify({ received: false }), { status: 200 });
  }
});