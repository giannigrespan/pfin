import { createClient } from '@/lib/supabase/server'
import { calculateReconciliation, groupExpensesByCategory } from '@/lib/reconciliation'
import { SpendingChart } from '@/components/dashboard/spending-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingDown, Users, Zap, ArrowRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user!.id)
    .single()

  const householdId = profile?.household_id ?? ''

  // Fetch household with both user profiles
  const { data: household } = await supabase
    .from('households')
    .select(`
      *,
      user_a:profiles!households_user_a_id_fkey(id, full_name, avatar_url),
      user_b:profiles!households_user_b_id_fkey(id, full_name, avatar_url)
    `)
    .eq('id', householdId)
    .single()

  const now = new Date()
  const start = format(startOfMonth(now), 'yyyy-MM-dd')
  const end = format(endOfMonth(now), 'yyyy-MM-dd')

  // Fetch this month's expenses with category and payer info
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*)')
    .eq('household_id', householdId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })

  // Fetch active bills
  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)

  // Bills due in next 7 days
  const todayDay = now.getDate()
  const upcomingBills = (bills ?? []).filter(b => {
    const diff = b.due_day - todayDay
    return diff >= 0 && diff <= 7
  })

  // User names for reconciliation
  const userAId = household?.user_a_id ?? ''
  const userBId = household?.user_b_id ?? ''
  const userAName = (household as any)?.user_a?.full_name ?? 'Utente A'
  const userBName = (household as any)?.user_b?.full_name ?? 'Utente B'

  const rec = calculateReconciliation(
    expenses ?? [],
    userAId,
    userBId,
    userAName,
    userBName
  )

  const chartData = groupExpensesByCategory(expenses ?? [])

  // Recent expenses (last 5)
  const recentExpenses = (expenses ?? []).slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm capitalize mt-0.5">
          {format(now, 'MMMM yyyy', { locale: it })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Spese del mese
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">€{rec.totalAll.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Condivise: €{rec.totalShared.toFixed(2)} · Personali: €{rec.totalPersonal.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className={rec.amount > 0 ? 'border-indigo-200 dark:border-indigo-800' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Conguaglio
            </CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              €{rec.amount.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {rec.amount > 0
                ? `${rec.debtorName} → ${rec.creditorName}`
                : 'In pari! 🎉'}
            </p>
          </CardContent>
        </Card>

        <Card className={upcomingBills.length > 0 ? 'border-amber-200 dark:border-amber-800' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Bollette imminenti
            </CardTitle>
            <Zap className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {upcomingBills.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">nei prossimi 7 giorni</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Spese per categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingChart data={chartData} />
            </CardContent>
          </Card>
        )}

        {/* Recent expenses */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ultime spese</CardTitle>
              <Link href="/spese" className="text-xs text-indigo-600 hover:underline">
                Vedi tutte →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExpenses.length > 0 ? recentExpenses.map(expense => (
              <div key={expense.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                <span className="text-lg">{(expense as any).category?.icon ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {expense.description ?? (expense as any).category?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(expense.date), 'dd MMM', { locale: it })}
                  </p>
                </div>
                <span className="text-sm font-semibold shrink-0">
                  €{Number(expense.amount).toFixed(2)}
                </span>
              </div>
            )) : (
              <p className="text-sm text-gray-400 text-center py-4">Nessuna spesa</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming bills */}
      {upcomingBills.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Bollette in scadenza
              </CardTitle>
              <Link href="/bollette" className="text-xs text-indigo-600 hover:underline">
                Gestisci →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingBills.map(bill => (
              <div key={bill.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{bill.name}</p>
                  <p className="text-xs text-gray-500">Scade il {bill.due_day} del mese</p>
                </div>
                <div className="text-right">
                  {bill.amount && (
                    <p className="text-sm font-semibold">€{Number(bill.amount).toFixed(2)}</p>
                  )}
                  <p className="text-xs text-amber-600">
                    tra {bill.due_day - todayDay} gg
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
