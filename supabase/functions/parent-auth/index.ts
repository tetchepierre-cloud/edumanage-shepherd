// supabase/functions/parent-auth/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TEST_MODE = true;
const TEST_OTP = "123456";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { action, phone } = await req.json();

  if (!action || !phone) {
    return new Response(JSON.stringify({ error: "Missing action or phone" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cleanedPhone = phone.replace(/[^0-9]/g, "");

  if (action === "send-otp") {
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("parent_phone", cleanedPhone)
      .eq("active", true)
      .maybeSingle();

    if (!student) {
      return new Response(JSON.stringify({ error: "Phone number not registered." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, testOtp: TEST_OTP }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "verify-otp") {
    const { otp } = await req.json();

    if (TEST_MODE && otp !== TEST_OTP) {
      return new Response(JSON.stringify({ error: "Invalid code." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phoneForSignUp = `+233${cleanedPhone.slice(1)}`;
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      phone: phoneForSignUp,
      phone_confirm: true,
      user_metadata: { role: "parent", phone: cleanedPhone },
    });

    if (userError) {
      // Si l'utilisateur existe déjà, on le laisse continuer
      if (userError.message?.includes("already exists")) {
        // Récupérer l'utilisateur existant
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const found = (existingUser?.users || []).find(u => u.phone === phoneForSignUp);
        if (found) {
          // S'assurer que le profil existe
          await supabase.from("profiles").upsert({
            id: found.id,
            full_name: "Parent",
            role: "parent",
          }, { onConflict: "id" });
          return new Response(JSON.stringify({ success: true, userId: found.id }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Créer automatiquement le profil pour ce nouveau parent
    await supabase.from("profiles").upsert({
      id: userData.user.id,
      full_name: "Parent",
      role: "parent",
    }, { onConflict: "id" });

    return new Response(JSON.stringify({ success: true, userId: userData.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action." }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});