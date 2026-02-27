'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { format } from 'date-fns'

const billSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().optional(),
  due_day: z.coerce.number().min(1).max(31),
  reminder_days_before: z.coerce.number().min(1).max(30).default(3),
  category_id: z.string().uuid().optional(),
})

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id as string | null
}

export async function createBill(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) throw new Error('Nessun household')

  const raw = Object.fromEntries(formData)
  // Remove empty category_id
  if (!raw.category_id || raw.category_id === '') delete raw.category_id

  const parsed = billSchema.parse(raw)
  await supabase.from('bills').insert({ ...parsed, household_id: householdId })
  revalidatePath('/bollette')
  revalidatePath('/dashboard')
}

export async function markBillPaid(formData: FormData) {
  const billId = formData.get('billId') as string
  const customAmount = formData.get('customAmount') as string | null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: bill } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .single()

  if (!bill) throw new Error('Bolletta non trovata')

  const householdId = await getHouseholdId(supabase, user.id)
  const amount = customAmount ? parseFloat(customAmount) : Number(bill.amount)

  // Create expense automatically if category is set and amount is known
  if (bill.category_id && amount > 0) {
    await supabase.from('expenses').insert({
      household_id: householdId,
      paid_by: user.id,
      category_id: bill.category_id,
      amount,
      description: bill.name,
      date: format(new Date(), 'yyyy-MM-dd'),
    })
  }

  await supabase.from('bills')
    .update({ last_paid_date: format(new Date(), 'yyyy-MM-dd') })
    .eq('id', billId)

  revalidatePath('/bollette')
  revalidatePath('/dashboard')
  revalidatePath('/spese')
}

export async function deleteBill(id: string) {
  const supabase = await createClient()
  await supabase.from('bills').update({ active: false }).eq('id', id)
  revalidatePath('/bollette')
  revalidatePath('/dashboard')
}
