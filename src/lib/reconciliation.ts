import { Expense, Category, Profile } from '@/types/database'

export interface ReconciliationResult {
  totalAll: number           // totale tutte le spese
  totalShared: number        // totale spese condivise
  totalPersonal: number      // totale spese personali
  userAOwes: number          // quanto A avrebbe dovuto pagare (condivise)
  userBOwes: number          // quanto B avrebbe dovuto pagare (condivise)
  userAPaid: number          // quanto A ha effettivamente pagato (tutte)
  userBPaid: number          // quanto B ha effettivamente pagato (tutte)
  balance: number            // positivo = A ha pagato troppo → B deve ad A
  debtorName: string
  creditorName: string
  amount: number             // valore assoluto del debito
}

export function calculateReconciliation(
  expenses: (Expense & { category?: Category })[],
  userAId: string,
  userBId: string,
  userAName: string,
  userBName: string
): ReconciliationResult {
  let userAOwes = 0
  let userBOwes = 0
  let userAPaid = 0
  let userBPaid = 0
  let totalShared = 0
  let totalPersonal = 0

  for (const expense of expenses) {
    const amount = Number(expense.amount)
    const cat = expense.category

    // Track who paid
    if (expense.paid_by === userAId) userAPaid += amount
    else if (expense.paid_by === userBId) userBPaid += amount

    if (!cat || cat.split_type === 'personal') {
      // Personal expense: doesn't enter reconciliation
      totalPersonal += amount
      continue
    }

    // Shared expense: calculate each person's share
    totalShared += amount
    const aShare = amount * cat.split_ratio
    const bShare = amount * (1 - cat.split_ratio)
    userAOwes += aShare
    userBOwes += bShare
  }

  // balance: positive = A paid more than their share → B owes A
  const aBalance = userAPaid - userAOwes

  const isACreditor = aBalance >= 0
  const debtorName = isACreditor ? userBName : userAName
  const creditorName = isACreditor ? userAName : userBName

  return {
    totalAll: userAPaid + userBPaid,
    totalShared,
    totalPersonal,
    userAOwes,
    userBOwes,
    userAPaid,
    userBPaid,
    balance: aBalance,
    debtorName,
    creditorName,
    amount: Math.abs(aBalance),
  }
}

export function groupExpensesByCategory(
  expenses: (Expense & { category?: Category })[]
) {
  const map = new Map<string, { name: string; icon: string; color: string; value: number }>()

  for (const expense of expenses) {
    const catName = expense.category?.name ?? 'Altro'
    const existing = map.get(catName)
    if (existing) {
      existing.value += Number(expense.amount)
    } else {
      map.set(catName, {
        name: catName,
        icon: expense.category?.icon ?? '📦',
        color: expense.category?.color ?? '#6b7280',
        value: Number(expense.amount),
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.value - a.value)
}
