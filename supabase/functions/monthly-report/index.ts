// supabase/functions/monthly-report/index.ts
// Trigger: cron "0 8 1 * *" — il 1° di ogni mese alle 8:00
// Invia il report CSV del mese precedente via email attachment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

/** Formatta un numero come nome del mese in italiano */
function monthName(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

function formatDateIT(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

Deno.serve(async () => {
  // Calcola inizio/fine del mese precedente
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const start = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  const end = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${lastDay}`
  const monthLabel = formatDateIT(lastMonth)
  const fileMonth = `${lastMonth.getFullYear()}_${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

  const { data: households, error: hhError } = await supabase
    .from('households')
    .select('*, user_a:profiles!households_user_a_id_fkey(*), user_b:profiles!households_user_b_id_fkey(*)')

  if (hhError) {
    console.error('Error fetching households:', hhError)
    return new Response('Error', { status: 500 })
  }

  let reportsSent = 0

  for (const h of households ?? []) {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
      .eq('household_id', h.id)
      .gte('date', start)
      .lte('date', end)
      .order('date')

    if (!expenses?.length) continue

    // Genera CSV con BOM per compatibilità Excel italiano
    const BOM = '\uFEFF'
    const header = ['Data', 'Descrizione', 'Categoria', 'Tipo', 'Importo (€)', 'Pagato da'].join(';')
    const rows = expenses.map(e => [
      e.date,
      `"${(e.description ?? '').replace(/"/g, '""')}"`,
      (e as any).category?.name ?? '',
      (e as any).category?.split_type === 'personal' ? 'Personale' : 'Condivisa',
      Number(e.amount).toFixed(2).replace('.', ','),
      (e as any).paid_by_profile?.full_name ?? '',
    ].join(';'))

    const csv = BOM + [header, ...rows].join('\n')
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

    // Calcola conguaglio
    let userAPaid = 0
    let userBPaid = 0
    for (const e of expenses) {
      if (e.paid_by === h.user_a_id) userAPaid += Number(e.amount)
      else if (e.paid_by === h.user_b_id) userBPaid += Number(e.amount)
    }

    const emails: string[] = [
      h.user_a?.email,
      h.user_b?.email,
    ].filter(Boolean) as string[]

    for (const email of emails) {
      const { error } = await resend.emails.send({
        from: Deno.env.get('RESEND_FROM_EMAIL')!,
        to: email,
        subject: `📊 Report spese ${monthLabel}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
            <div style="background:#6366f1;color:white;border-radius:12px 12px 0 0;padding:24px;">
              <h1 style="margin:0;font-size:22px;">📊 Report spese mensile</h1>
              <p style="margin:8px 0 0;opacity:0.9;font-size:14px;text-transform:capitalize;">${monthLabel}</p>
            </div>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:24px;">
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Totale spese</td>
                  <td style="padding:8px 0;font-weight:700;font-size:18px;text-align:right;">€${total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Pagato da ${h.user_a?.full_name ?? 'Utente A'}</td>
                  <td style="padding:8px 0;font-weight:600;text-align:right;">€${userAPaid.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Pagato da ${h.user_b?.full_name ?? 'Utente B'}</td>
                  <td style="padding:8px 0;font-weight:600;text-align:right;">€${userBPaid.toFixed(2)}</td>
                </tr>
              </table>
              <p style="font-size:14px;color:#374151;margin-bottom:20px;">
                In allegato trovi il dettaglio completo in formato CSV, importabile su Excel o Google Sheets.
              </p>
              <a href="${Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://pfin.app'}/conguaglio"
                 style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;
                        text-decoration:none;display:inline-block;font-weight:600;">
                Vedi conguaglio →
              </a>
              <p style="font-size:12px;color:#9ca3af;margin-top:24px;">
                Inviato automaticamente da PFin il 1° del mese
              </p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `pfin_${fileMonth}.csv`,
            content: btoa(unescape(encodeURIComponent(csv))),
          },
        ],
      })

      if (error) {
        console.error(`Failed to send monthly report to ${email}:`, error)
      } else {
        reportsSent++
      }
    }
  }

  console.log(`Monthly reports sent: ${reportsSent}`)
  return new Response(JSON.stringify({ reportsSent }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
