'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const expenseSchema = z.object({
  amount: z.coerce.number().positive(),
  description: z.string().optional(),
  category_id: z.string().uuid(),
  date: z.string(),
  notes: z.string().optional(),
})

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', userId)
    .single()
  return data?.household_id as string | null
}

export async function createExpense(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) throw new Error('Nessun household')

  const raw = Object.fromEntries(formData)
  const parsed = expenseSchema.parse(raw)
  const receiptUrl = formData.get('receipt_url') as string | null

  await supabase.from('expenses').insert({
    ...parsed,
    household_id: householdId,
    paid_by: user.id,
    receipt_url: receiptUrl || null,
  })
  revalidatePath('/spese')
  revalidatePath('/dashboard')
}

export async function deleteExpense(id: string) {
  const supabase = await createClient()
  await supabase.from('expenses').delete().eq('id', id)
  revalidatePath('/spese')
  revalidatePath('/dashboard')
}
