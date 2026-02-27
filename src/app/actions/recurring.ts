'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { addMonths, addWeeks, addYears, format } from 'date-fns'

const recurringSchema = z.object({
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  category_id: z.string().uuid(),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  next_due: z.string(),
  auto_create: z.coerce.boolean().default(false),
})

function getNextDueDate(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(current, 1)
    case 'monthly': return addMonths(current, 1)
    case 'yearly': return addYears(current, 1)
    default: return addMonths(current, 1)
  }
}

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id as string | null
}

export async function createRecurring(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) throw new Error('Nessun household')

  const raw = Object.fromEntries(formData)
  // Handle checkbox: not present in formData if unchecked
  raw.auto_create = raw.auto_create ?? 'false'

  const parsed = recurringSchema.parse(raw)

  await supabase.from('recurring_expenses').insert({
    ...parsed,
    household_id: householdId,
    paid_by: user.id,
  })
  revalidatePath('/ricorrenti')
}

export async function deactivateRecurring(id: string) {
  const supabase = await createClient()
  await supabase.from('recurring_expenses').update({ active: false }).eq('id', id)
  revalidatePath('/ricorrenti')
}

export async function createExpenseFromRecurring(recurringId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: r } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('id', recurringId)
    .single()

  if (!r) throw new Error('Ricorrente non trovata')

  const householdId = await getHouseholdId(supabase, user.id)

  // Create the expense
  await supabase.from('expenses').insert({
    household_id: householdId,
    paid_by: user.id,
    category_id: r.category_id,
    amount: r.amount,
    description: r.description,
    date: format(new Date(), 'yyyy-MM-dd'),
    is_recurring: true,
    recurring_expense_id: r.id,
  })

  // Update next_due
  const nextDue = getNextDueDate(new Date(r.next_due), r.frequency)
  await supabase.from('recurring_expenses')
    .update({ next_due: format(nextDue, 'yyyy-MM-dd') })
    .eq('id', r.id)

  revalidatePath('/ricorrenti')
  revalidatePath('/spese')
  revalidatePath('/dashboard')
}
