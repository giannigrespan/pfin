// src/app/(app)/conguaglio/page.tsx
import { createClient } from '@/lib/supabase/server'
import { calculateReconciliation } from '@/lib/reconciliation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import Link from 'next/link'
import { MonthPicker } from '@/components/conguaglio/month-picker'

export default async function ConguaglioPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const month = params.month ?? format(new Date(), 'yyyy-MM')
  const [year, m] = month.split('-')
  const start = `${year}-${m}-01`
  const end = new Date(Number(year), Number(m), 0).toISOString().split('T')[0]

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*)')
    .eq('household_id', profile?.household_id)
    .gte('date', start).lte('date', end)

  const { data: household } = await supabase
    .from('households')
    .select('*, pa:profiles!households_user_a_id_fkey(*), pb:profiles!households_user_b_id_fkey(*)')
    .eq('id', profile?.household_id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hh = household as any
  const userAName = hh?.pa?.full_name ?? 'Utente A'
  const userBName = hh?.pb?.full_name ?? 'Utente B'

  const rec = calculateReconciliation(
    expenses ?? [],
    household?.user_a_id ?? '',
    household?.user_b_id ?? '',
    userAName,
    userBName
  )

  // Raggruppa per categoria (explicit type to help TS inference)
  type CatEntry = { name: string; icon: string; total: number; splitType: string; splitRatio: number }
  const byCategory: Record<string, CatEntry> = {}
  for (const e of expenses ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cat = (e as any).category
    const catId = e.category_id as string
    const catName = (cat?.name as string) ?? 'Altro'
    if (!byCategory[catId]) {
      byCategory[catId] = {
        name: catName,
        icon: (cat?.icon as string) ?? '📦',
        total: 0,
        splitType: (cat?.split_type as string) ?? 'shared',
        splitRatio: (cat?.split_ratio as number) ?? 0.5,
      }
    }
    byCategory[catId].total += Number(e.amount)
  }

  const monthLabel = format(new Date(`${year}-${m}-01`), 'MMMM yyyy', { locale: it })
  const isSettled = rec.amount < 0.01

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conguaglio</h1>
          <p className="text-gray-500 capitalize">{monthLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <MonthPicker value={month} />
          <Link href={`/api/export-csv?month=${month}`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Scarica CSV
            </Button>
          </Link>
        </div>
      </div>

      {/* Riepilogo finale */}
      {isSettled ? (
        <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 text-center">
              <Minus className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">Siete in pari! 🎉</p>
                <p className="text-sm text-gray-500">Nessun conguaglio necessario per {monthLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-indigo-300 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">deve pagare</p>
                <p className="text-xl font-bold">{rec.debtorName}</p>
              </div>
              <div className="text-indigo-600 dark:text-indigo-400 flex flex-col items-center">
                <ArrowRight className="h-6 w-6" />
                <p className="text-2xl font-bold">€{rec.amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">a</p>
                <p className="text-xl font-bold">{rec.creditorName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Totali */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Totale mese</p>
            <p className="text-lg font-bold">€{rec.totalAll.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Condivise</p>
            <p className="text-lg font-bold text-indigo-600">€{rec.totalShared.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Personali</p>
            <p className="text-lg font-bold text-gray-500">€{rec.totalPersonal.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chi ha pagato quanto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riepilogo pagamenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-medium">{userAName}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold">€{rec.userAPaid.toFixed(2)}</p>
              <p className="text-xs text-gray-400">quota: €{rec.userAOwes.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">{userBName}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold">€{rec.userBPaid.toFixed(2)}</p>
              <p className="text-xs text-gray-400">quota: €{rec.userBOwes.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dettaglio per categoria */}
      {Object.values(byCategory).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dettaglio per categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {Object.values(byCategory)
              .sort((a, b) => b.total - a.total)
              .map(cat => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{cat.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {cat.splitType === 'personal' ? (
                          <Badge variant="secondary" className="text-xs py-0 px-1.5">
                            👤 Personale
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs py-0 px-1.5 text-indigo-600 border-indigo-200">
                            🤝 {Math.round(cat.splitRatio * 100)}/{Math.round((1 - cat.splitRatio) * 100)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold">€{cat.total.toFixed(2)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center text-gray-400">
            Nessuna spesa per {monthLabel}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
