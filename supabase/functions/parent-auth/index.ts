// supabase/functions/parent-auth/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Mode test : si true, les OTP sont toujours 123456 et aucun SMS n'est envoyé
const TEST_MODE = true;
const TEST_OTP = "123456";

serve(async (req: Request) => {
  const { action, phone } = await req.json();

  if (!action || !phone) {
    return new Response(JSON.stringify({ error: "Missing action or phone" }), { status: 400 });
  }

  // Nettoyer le numéro (garder le format local 0538777840)
  const cleanedPhone = phone.replace(/[^0-9]/g, "");

  // ── ACTION : send-otp ──────────────────────────────────────────
  if (action === "send-otp") {
    // Vérifier que le numéro existe dans students
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("parent_phone", cleanedPhone)
      .eq("active", true)
      .maybeSingle();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ error: "Phone number not registered in our system." }),
        { status: 404 }
      );
    }

    if (TEST_MODE) {
      return new Response(JSON.stringify({ success: true, testOtp: TEST_OTP }), { status: 200 });
    }

    // TODO : envoyer un vrai SMS via Hubtel ici
    // Pour l'instant, on retourne une erreur car le fournisseur n'est pas configuré
    return new Response(
      JSON.stringify({ error: "SMS provider not configured yet." }),
      { status: 500 }
    );
  }

  // ── ACTION : verify-otp ────────────────────────────────────────
  if (action === "verify-otp") {
    const { otp } = await req.json();

    if (TEST_MODE) {
      if (otp !== TEST_OTP) {
        return new Response(JSON.stringify({ error: "Invalid code." }), { status: 400 });
      }
    }

    // Vérifier à nouveau que le numéro existe (au cas où supprimé entre-temps)
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("parent_phone", cleanedPhone)
      .eq("active", true)
      .maybeSingle();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ error: "Phone number not registered in our system." }),
        { status: 404 }
      );
    }

    // Créer l'utilisateur via l'API Admin (bypass RLS, bypass hook)
    const phoneForSignUp = `+233${cleanedPhone.slice(1)}`;
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      phone: phoneForSignUp,
      phone_confirm: true,
      user_metadata: { role: "parent", phone: cleanedPhone },
    });

    if (userError) {
      return new Response(
        JSON.stringify({ error: "Failed to create user account." }),
        { status: 500 }
      );
    }

    // Générer une session pour cet utilisateur
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: `${userData.user.id}@parent.local`,
    });

    // On va plutôt créer une session directement avec l'ID utilisateur
    // pour éviter de dépendre d'un email factice.
    // On retourne simplement l'ID utilisateur, le frontend se chargera de signIn.
    return new Response(
      JSON.stringify({
        success: true,
        userId: userData.user.id,
        message: "Account created. You can now sign in.",
      }),
      { status: 200 }
    );
  }

  return new Response(JSON.stringify({ error: "Invalid action." }), { status: 400 });
});