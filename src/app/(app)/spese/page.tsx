import { createClient } from '@/lib/supabase/server'
import { ExpenseForm } from '@/components/expenses/expense-form'
import { deleteExpense } from '@/app/actions/expenses'
import { Button } from '@/components/ui/button'
import { Trash2, Image } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default async function SpesePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user!.id)
    .single()

  const householdId = profile?.household_id ?? ''

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('name')

  // Get current month expenses
  const now = new Date()
  const start = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const end = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
    .eq('household_id', householdId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })

  const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spese</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(now, 'MMMM yyyy', { locale: it })} · Totale: <strong>€{total.toFixed(2)}</strong>
          </p>
        </div>
        <ExpenseForm categories={categories ?? []} />
      </div>

      <div className="space-y-2">
        {expenses?.map(expense => (
          <div
            key={expense.id}
            className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: (expense.category?.color ?? '#6b7280') + '25' }}
            >
              {expense.category?.icon ?? '📦'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {expense.description ?? expense.category?.name ?? 'Spesa'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(expense.date), 'dd MMM', { locale: it })} ·{' '}
                {(expense.paid_by_profile as any)?.full_name ?? 'Tu'} ·{' '}
                {expense.category?.split_type === 'personal' ? '👤' : '🤝'}
              </p>
            </div>
            {expense.receipt_url && (
              <a
                href={expense.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-600"
              >
                <Image className="h-4 w-4" />
              </a>
            )}
            <span className="font-semibold text-sm shrink-0">
              €{Number(expense.amount).toFixed(2)}
            </span>
            <form action={deleteExpense.bind(null, expense.id)}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        ))}

        {(!expenses || expenses.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">💸</p>
            <p>Nessuna spesa questo mese. Aggiungine una!</p>
          </div>
        )}
      </div>
    </div>
  )
}
