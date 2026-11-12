// Drains public.mail_outbox and sends through Resend. Called every minute by pg_cron (see README).
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "BYD EMEA Aftersales PMO <pmo-noreply@yourdomain.com>"), CRON_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });

  const { data: rows, error } = await db.from("mail_outbox").select("*")
    .eq("status", "queued").lt("attempts", 5).order("id").limit(25);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const m of rows ?? []) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM"),
        to: m.to_emails, cc: m.cc_emails.length ? m.cc_emails : undefined,
        subject: m.subject,
        text: `${m.body}\n\n——\nEMEA Aftersales PMO · automatic notification`,
      }),
    });
    if (r.ok) { sent++; await db.from("mail_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", m.id); }
    else {
      const attempts = m.attempts + 1;
      await db.from("mail_outbox").update({ attempts, error: (await r.text()).slice(0, 500), status: attempts >= 5 ? "failed" : "queued" }).eq("id", m.id);
    }
  }
  return Response.json({ picked: rows?.length ?? 0, sent });
});
