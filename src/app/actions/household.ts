'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const DEFAULT_CATEGORIES = [
  { name: 'Spesa alimentare', icon: '🛒', color: '#22c55e', split_type: 'shared', split_ratio: 0.5 },
  { name: 'Bollette', icon: '⚡', color: '#f59e0b', split_type: 'shared', split_ratio: 0.5 },
  { name: 'Affitto/Mutuo', icon: '🏠', color: '#6366f1', split_type: 'shared', split_ratio: 0.5 },
  { name: 'Ristoranti', icon: '🍕', color: '#ef4444', split_type: 'shared', split_ratio: 0.5 },
  { name: 'Trasporti', icon: '🚗', color: '#3b82f6', split_type: 'shared', split_ratio: 0.5 },
  { name: 'Abbigliamento', icon: '👕', color: '#8b5cf6', split_type: 'personal', split_ratio: 1.0 },
  { name: 'Salute', icon: '💊', color: '#10b981', split_type: 'personal', split_ratio: 1.0 },
  { name: 'Svago', icon: '🎮', color: '#f97316', split_type: 'personal', split_ratio: 1.0 },
  { name: 'Altro', icon: '📦', color: '#6b7280', split_type: 'shared', split_ratio: 0.5 },
]

export async function createHousehold(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const householdName = formData.get('name') as string
  const partnerEmail = formData.get('partnerEmail') as string

  // Create household
  const { data: household, error } = await supabase
    .from('households')
    .insert({ name: householdName, user_a_id: user.id })
    .select()
    .single()

  if (error || !household) throw new Error('Errore creazione household')

  // Update profile with household_id
  await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  // Create default categories
  await supabase.from('categories').insert(
    DEFAULT_CATEGORIES.map(c => ({ ...c, household_id: household.id }))
  )

  // Create invite token
  const { randomBytes } = await import('crypto')
  const token = randomBytes(32).toString('hex')
  await supabase.from('household_invites').insert({
    household_id: household.id,
    invited_email: partnerEmail,
    token,
  })

  // Send invite email via Resend (only if RESEND_API_KEY is set)
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@pfin.app',
      to: partnerEmail,
      subject: `${user.email} ti invita su PFin 💰`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2>💰 Sei stato invitato su PFin</h2>
          <p><strong>${user.email}</strong> ti ha invitato a gestire le spese insieme su PFin.</p>
          <p style="margin:24px 0">
            <a href="${appUrl}/invite/${token}"
               style="background:#6366f1;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
              Accetta invito
            </a>
          </p>
          <p style="color:#6b7280;font-size:14px">Il link scade tra 7 giorni.</p>
        </div>
      `,
    })
  }

  redirect('/dashboard')
}

export async function acceptInvite(token: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login`)

  const { data: invite } = await supabase
    .from('household_invites')
    .select('*')
    .eq('token', token)
    .eq('accepted', false)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) redirect('/login?error=invite_invalid')

  // Update household with user_b
  await supabase
    .from('households')
    .update({ user_b_id: user.id })
    .eq('id', invite.household_id)

  // Update profile
  await supabase
    .from('profiles')
    .update({ household_id: invite.household_id })
    .eq('id', user.id)

  // Mark invite as accepted
  await supabase
    .from('household_invites')
    .update({ accepted: true })
    .eq('id', invite.id)

  redirect('/dashboard')
}
