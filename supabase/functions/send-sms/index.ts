// supabase/functions/send-sms/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

const HUBTEL_API_KEY = Deno.env.get("HUBTEL_API_KEY")!;
const HUBTEL_SENDER_ID = Deno.env.get("HUBTEL_SENDER_ID") || Deno.env.get("HUBTEL_API_KEY")!;
const HUBTEL_API_URL = "https://api.hubtel.com/v1/messages/send";

serve(async (req: Request) => {
  try {
    const { phone, message } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing phone or message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Hubtel attend le numéro au format local (0532000000)
    // Nettoyage basique au cas où
    const cleanedPhone = phone.replace(/[^0-9]/g, "");
    const localPhone = cleanedPhone.startsWith("233")
      ? "0" + cleanedPhone.slice(3) // convertit 233532000000 en 0532000000
      : cleanedPhone;

    const payload = {
      from: HUBTEL_SENDER_ID,
      to: localPhone,
      content: message,
    };

    const response = await fetch(HUBTEL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa(HUBTEL_API_KEY + ":"),
      },
      body: JSON.stringify(payload),
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