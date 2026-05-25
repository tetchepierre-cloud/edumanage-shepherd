// supabase/functions/parent-auth/index.ts
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HUBTEL_CLIENT_ID = Deno.env.get("HUBTEL_CLIENT_ID")!;
const HUBTEL_CLIENT_SECRET = Deno.env.get("HUBTEL_CLIENT_SECRET")!;
const HUBTEL_SENDER_ID = Deno.env.get("HUBTEL_SENDER_ID") || "EduManage";
const HUBTEL_QUICK_SEND_URL = "https://smsc.hubtel.com/v1/messages/send";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, phone, code, password } = body;

    if (!action || !phone) {
      return new Response(JSON.stringify({ error: "Missing action or phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = phone.replace(/[^0-9]/g, "");
    let formattedPhone = cleaned;
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "233" + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith("233")) {
      formattedPhone = "233" + formattedPhone;
    }

    const fakeEmail = `${cleaned}@parent.edumanage.gh`;

    // ── ACTION 1 : send-otp ──
    if (action === "send-otp") {
      // Vérifier que le numéro existe dans students
      // Vérifier que le numéro existe dans students (blindé pour les fratries)
      const { data: students, error: studentError } = await supabaseAdmin
        .from("students")
        .select("id, first_name, last_name")
        .eq("parent_phone", cleaned)
        .limit(1);

      if (studentError) {
        // ÇA, C'EST POUR TOI : Le log interne dans Supabase reste en français
        console.error("Erreur de base de données lors de la recherche de l'élève :", studentError);
      }

      const student = students && students.length > 0 ? students[0] : null;

      if (!student) {
        // ÇA, C'EST POUR LE PARENT : Le message d'erreur qui part vers l'application est en anglais
        return new Response(JSON.stringify({ error: "Phone number not registered." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Invalider les anciens OTP
      await supabaseAdmin
        .from("parent_otp")
        .update({ used: true })
        .eq("phone", cleaned)
        .eq("used", false);

      // Stocker le nouveau
      await supabaseAdmin.from("parent_otp").insert({
        phone: cleaned,
        code: otp,
        expires_at: expiresAt,
      });

      // SMS Quick Send
      const smsParams = new URLSearchParams({
        clientid: HUBTEL_CLIENT_ID,
        clientsecret: HUBTEL_CLIENT_SECRET,
        from: HUBTEL_SENDER_ID,
        to: formattedPhone,
        content: `Your EduManage verification code is: ${otp}`,
      });

      await fetch(`${HUBTEL_QUICK_SEND_URL}?${smsParams.toString()}`, { method: "GET" });

      // Vérifier si un compte existe déjà avec cet email fictif
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
      const found = (existingUser?.users || []).find(u => u.email === fakeEmail);

      return new Response(JSON.stringify({
        success: true,
        isNewUser: !found,
        studentName: `${student.first_name} ${student.last_name}`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION 2 : verify-otp ──
    if (action === "verify-otp") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: otpRecord } = await supabaseAdmin
        .from("parent_otp")
        .select("*")
        .eq("phone", cleaned)
        .eq("code", code)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!otpRecord) {
        return new Response(JSON.stringify({ error: "Invalid or expired code." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Marquer comme utilisé
      await supabaseAdmin.from("parent_otp").update({ used: true }).eq("id", otpRecord.id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION 3 : set-password (crée ou met à jour, puis connecte) ──
    if (action === "set-password") {
      if (!password) {
        return new Response(JSON.stringify({ error: "Missing password" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Essayer de se connecter directement (utilisateur existant)
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });

      if (!signInError && signInData.user) {
        // Utilisateur existant, mot de passe correct → tout va bien
        await supabaseAdmin.from("profiles").upsert({
          id: signInData.user.id,
          role: "parent",
          phone: cleaned,
          first_name: "Parent",
          last_name: cleaned,
        }, { onConflict: "id" });

        return new Response(JSON.stringify({
          success: true,
          access_token: signInData.session?.access_token,
          refresh_token: signInData.session?.refresh_token,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Si la connexion échoue, l'utilisateur n'existe peut-être pas → le créer
      if (signInError?.message?.includes("Invalid login credentials")) {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password,
          email_confirm: true,
          user_metadata: { role: "parent", phone: cleaned },
        });
        if (createError) throw createError;

        // Re-connecter avec le compte fraîchement créé
        const { data: freshSignIn, error: freshError } = await supabaseAdmin.auth.signInWithPassword({
          email: fakeEmail,
          password,
        });
        if (freshError) throw freshError;

        await supabaseAdmin.from("profiles").upsert({
          id: newUser.user.id,
          role: "parent",
          phone: cleaned,
          first_name: "Parent",
          last_name: cleaned,
        }, { onConflict: "id" });

        return new Response(JSON.stringify({
          success: true,
          access_token: freshSignIn.session?.access_token,
          refresh_token: freshSignIn.session?.refresh_token,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. Autre erreur (mot de passe trop faible, etc.)
      throw signInError;
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});