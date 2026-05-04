import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const { student_id, phone, activation_code, email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required." }), { status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: portalAccount, error: portalError } = await supabaseAdmin
      .from("parent_portal_accounts")
      .select("id, activation_code, is_active")
      .eq("student_id", student_id)
      .single();

    if (portalError || !portalAccount)
      return new Response(JSON.stringify({ error: "No portal account found." }), { status: 404 });
    if (portalAccount.activation_code !== activation_code)
      return new Response(JSON.stringify({ error: "Invalid activation code." }), { status: 400 });
    if (portalAccount.is_active)
      return new Response(JSON.stringify({ error: "Already active." }), { status: 400 });

    const tempPassword = "EduM" + Math.random().toString(36).slice(2, 10);

    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: "parent", student_id, phone },
    });

    if (userError)
      return new Response(JSON.stringify({ error: userError.message }), { status: 400 });

    await supabaseAdmin
      .from("profiles")
      .update({ role: "parent", phone, email })
      .eq("id", newUser.user.id);

    await supabaseAdmin
      .from("parent_portal_accounts")
      .update({ is_active: true })
      .eq("id", portalAccount.id);

    return new Response(JSON.stringify({
      success: true,
      user_id: newUser.user.id,
      email,
      temp_password: tempPassword,
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});