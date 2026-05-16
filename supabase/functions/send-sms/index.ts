// supabase/functions/send-sms/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

const CLIENT_ID = Deno.env.get("HUBTEL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("HUBTEL_CLIENT_SECRET")!;
const SENDER_ID = Deno.env.get("HUBTEL_SENDER_ID") || "EduManage";

// URL de l'API Quick Send de Hubtel
const HUBTEL_API_URL = "https://smsc.hubtel.com/v1/messages/send";

serve(async (req: Request) => {
  try {
    const { phone, message } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing phone or message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Conversion du format local (0532000000) vers international (233532000000)
    let intlPhone = phone.replace(/[^0-9]/g, "");
    if (intlPhone.startsWith("0")) {
      intlPhone = "233" + intlPhone.slice(1);
    } else if (!intlPhone.startsWith("233")) {
      intlPhone = "233" + intlPhone;
    }

    // Construction de l'URL avec les paramètres requis par Quick Send
    const params = new URLSearchParams({
      clientid: CLIENT_ID,
      clientsecret: CLIENT_SECRET,
      from: SENDER_ID,
      to: intlPhone,
      content: message,
    });

    const response = await fetch(`${HUBTEL_API_URL}?${params.toString()}`, {
      method: "GET",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Hubtel error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS via Hubtel", details: data }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});