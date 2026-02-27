export type SplitType = 'personal' | 'shared'
export type Frequency = 'weekly' | 'monthly' | 'yearly'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  household_id: string | null
  created_at: string
}

export interface Household {
  id: string
  name: string
  user_a_id: string | null
  user_b_id: string | null
  created_at: string
}

export interface Category {
  id: string
  household_id: string
  name: string
  icon: string
  color: string
  split_type: SplitType
  split_ratio: number
  created_at: string
}

export interface Expense {
  id: string
  household_id: string
  paid_by: string
  category_id: string
  amount: number
  description: string | null
  date: string
  is_recurring: boolean
  recurring_expense_id: string | null
  receipt_url: string | null
  notes: string | null
  created_at: string
  // joined relations
  category?: Category
  paid_by_profile?: Profile
}

export interface RecurringExpense {
  id: string
  household_id: string
  category_id: string
  paid_by: string
  amount: number
  description: string
  frequency: Frequency
  next_due: string
  auto_create: boolean
  active: boolean
  created_at: string
  category?: Category
}

export interface Bill {
  id: string
  household_id: string
  category_id: string | null
  name: string
  amount: number | null
  due_day: number
  reminder_days_before: number
  last_paid_date: string | null
  active: boolean
  created_at: string
}

export interface HouseholdInvite {
  id: string
  household_id: string
  invited_email: string
  token: string
  accepted: boolean
  expires_at: string
  created_at: string
}
