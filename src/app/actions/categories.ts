'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const categorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().default('📦'),
  color: z.string().default('#6b7280'),
  split_type: z.enum(['personal', 'shared']),
  split_ratio: z.coerce.number().min(0).max(100).transform(v => v / 100),
})

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', userId)
    .single()
  return data?.household_id as string | null
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) throw new Error('Nessun household trovato')

  const raw = Object.fromEntries(formData)
  // If personal, force split_ratio to 100 (will become 1.0)
  if (raw.split_type === 'personal') raw.split_ratio = '100'
  const parsed = categorySchema.parse(raw)

  await supabase.from('categories').insert({ ...parsed, household_id: householdId })
  revalidatePath('/categorie')
  revalidatePath('/spese')
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient()
  const raw = Object.fromEntries(formData)
  if (raw.split_type === 'personal') raw.split_ratio = '100'
  const parsed = categorySchema.parse(raw)
  await supabase.from('categories').update(parsed).eq('id', id)
  revalidatePath('/categorie')
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()
  await supabase.from('categories').delete().eq('id', id)
  revalidatePath('/categorie')
  revalidatePath('/spese')
}
