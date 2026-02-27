// src/app/api/export-csv/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') ??
    format(new Date(), 'yyyy-MM')
  const [year, m] = month.split('-')
  const start = `${year}-${m}-01`
  const end = new Date(Number(year), Number(m), 0).toISOString().split('T')[0]

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'Household non trovato' }, { status: 404 })
  }

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
    .eq('household_id', profile.household_id)
    .gte('date', start).lte('date', end)
    .order('date')

  // Genera CSV con BOM per Excel italiano
  const BOM = '\uFEFF'
  const rows = [
    ['Data', 'Descrizione', 'Categoria', 'Tipo', 'Importo (€)', 'Pagato da'].join(';'),
    ...(expenses ?? []).map(e => [
      e.date,
      `"${(e.description ?? '').replace(/"/g, '""')}"`,
      e.category?.name ?? '',
      e.category?.split_type === 'personal' ? 'Personale' : 'Condivisa',
      Number(e.amount).toFixed(2).replace('.', ','),
      e.paid_by_profile?.full_name ?? '',
    ].join(';'))
  ]

  const csv = BOM + rows.join('\n')
  const monthLabel = format(new Date(`${year}-${m}-01`), 'MMMM_yyyy', { locale: it })

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pfin_${monthLabel}.csv"`,
    },
  })
}
