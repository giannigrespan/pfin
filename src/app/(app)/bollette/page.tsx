import { createClient } from '@/lib/supabase/server'
import { markBillPaid, deleteBill, createBill } from '@/app/actions/bills'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Trash2, Plus, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default async function BollettePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const householdId = profile?.household_id ?? ''

  const { data: categories } = await supabase
    .from('categories').select('*').eq('household_id', householdId).order('name')

  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('due_day')

  const today = new Date()
  const todayDay = today.getDate()

  const getStatus = (dueDay: number, reminderDays: number) => {
    const diff = dueDay - todayDay
    if (diff < 0) return 'overdue'
    if (diff <= reminderDays) return 'urgent'
    return 'ok'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bollette</h1>
          <p className="text-sm text-gray-500 mt-1">Scadenze mensili con reminder</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nuova bolletta</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Nuova bolletta</DialogTitle></DialogHeader>
            <form action={createBill} className="space-y-4">
              <div>
                <Label>Nome bolletta</Label>
                <Input name="name" placeholder="Luce, Gas, Internet..." required className="mt-1" />
              </div>
              <div>
                <Label>Importo tipico (€) <span className="text-gray-400 font-normal">(opzionale)</span></Label>
                <Input name="amount" type="number" step="0.01" min="0" placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label>Categoria <span className="text-gray-400 font-normal">(opzionale)</span></Label>
                <Select name="category_id">
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Nessuna categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nessuna categoria</SelectItem>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Giorno di scadenza <span className="text-gray-400 font-normal">(1-31)</span></Label>
                <Input name="due_day" type="number" min="1" max="31" required className="mt-1" />
              </div>
              <div>
                <Label>Reminder (giorni prima)</Label>
                <Input name="reminder_days_before" type="number" min="1" max="30" defaultValue="3" required className="mt-1" />
              </div>
              <Button type="submit" className="w-full">Salva bolletta</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {bills?.map(bill => {
          const status = getStatus(bill.due_day, bill.reminder_days_before)
          const daysUntil = bill.due_day - todayDay

          return (
            <div key={bill.id}
              className={`p-4 bg-white dark:bg-gray-900 rounded-xl border ${
                status === 'overdue' ? 'border-red-300 dark:border-red-700' :
                status === 'urgent' ? 'border-amber-300 dark:border-amber-700' :
                'border-gray-200 dark:border-gray-800'
              }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  status === 'overdue' ? 'bg-red-100 dark:bg-red-900' :
                  status === 'urgent' ? 'bg-amber-100 dark:bg-amber-900' :
                  'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Zap className={`h-5 w-5 ${
                    status === 'overdue' ? 'text-red-500' :
                    status === 'urgent' ? 'text-amber-500' :
                    'text-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{bill.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {status === 'overdue' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 font-medium">
                        Scaduta
                      </span>
                    )}
                    {status === 'urgent' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 font-medium">
                        Entro {daysUntil}gg
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      Scade il {bill.due_day} del mese
                    </span>
                    {bill.last_paid_date && (
                      <span className="text-xs text-gray-400">
                        · Ultimo pagamento: {format(new Date(bill.last_paid_date), 'dd MMM', { locale: it })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {bill.amount && (
                    <span className="text-sm font-semibold mr-2">€{Number(bill.amount).toFixed(2)}</span>
                  )}
                  <form action={markBillPaid}>
                    <input type="hidden" name="billId" value={bill.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                      title="Segna come pagata"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </form>
                  <form action={deleteBill.bind(null, bill.id)}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}

        {(!bills || bills.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">⚡</p>
            <p>Nessuna bolletta. Aggiungine una!</p>
          </div>
        )}
      </div>
    </div>
  )
}
