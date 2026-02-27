// supabase/functions/bill-reminders/index.ts
// Trigger: cron "0 9 * * *" — ogni giorno alle 9:00
// Invia un email di reminder per ogni bolletta in scadenza

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

Deno.serve(async () => {
  const today = new Date()
  const todayDay = today.getDate()

  // Recupera tutti gli households con i profili dei due utenti
  const { data: households, error: hhError } = await supabase
    .from('households')
    .select('*, user_a:profiles!households_user_a_id_fkey(*), user_b:profiles!households_user_b_id_fkey(*)')

  if (hhError) {
    console.error('Error fetching households:', hhError)
    return new Response('Error', { status: 500 })
  }

  let remindersSent = 0

  for (const h of households ?? []) {
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('household_id', h.id)
      .eq('active', true)

    for (const bill of bills ?? []) {
      const daysUntil = bill.due_day - todayDay

      // Invia reminder esattamente N giorni prima
      if (daysUntil === bill.reminder_days_before && daysUntil > 0) {
        const emails: string[] = [
          h.user_a?.email,
          h.user_b?.email,
        ].filter(Boolean) as string[]

        for (const email of emails) {
          const { error } = await resend.emails.send({
            from: Deno.env.get('RESEND_FROM_EMAIL')!,
            to: email,
            subject: `⚡ Scadenza bolletta: ${bill.name} tra ${daysUntil} giorni`,
            html: `
              <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
                <div style="background:#6366f1;color:white;border-radius:12px 12px 0 0;padding:24px;">
                  <h1 style="margin:0;font-size:24px;">⚡ Reminder bolletta</h1>
                </div>
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:24px;">
                  <p style="font-size:16px;color:#374151;">
                    La bolletta <strong>${bill.name}</strong> scade tra
                    <strong style="color:#6366f1;">${daysUntil} giorni</strong>
                    (il giorno ${bill.due_day} del mese).
                  </p>
                  ${bill.amount ? `
                    <p style="font-size:14px;color:#6b7280;">
                      Importo tipico: <strong>€${Number(bill.amount).toFixed(2)}</strong>
                    </p>
                  ` : ''}
                  <div style="margin-top:24px;">
                    <a href="${Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://pfin.app'}/bollette"
                       style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;
                              text-decoration:none;display:inline-block;font-weight:600;">
                      Gestisci bollette →
                    </a>
                  </div>
                  <p style="font-size:12px;color:#9ca3af;margin-top:24px;">
                    Inviato da PFin — il tuo gestore spese di coppia
                  </p>
                </div>
              </div>
            `,
          })

          if (error) {
            console.error(`Failed to send reminder to ${email}:`, error)
          } else {
            remindersSent++
          }
        }
      }
    }
  }

  console.log(`Bill reminders sent: ${remindersSent}`)
  return new Response(JSON.stringify({ remindersSent }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
