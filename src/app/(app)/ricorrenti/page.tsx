import { createClient } from '@/lib/supabase/server'
import { deactivateRecurring, createExpenseFromRecurring, createRecurring } from '@/app/actions/recurring'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Play } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Settimanale',
  monthly: 'Mensile',
  yearly: 'Annuale',
}

const FREQ_COLORS: Record<string, string> = {
  weekly: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  monthly: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  yearly: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

export default async function RicorrentiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const householdId = profile?.household_id ?? ''

  const { data: categories } = await supabase
    .from('categories').select('*').eq('household_id', householdId).order('name')

  const { data: recurring } = await supabase
    .from('recurring_expenses')
    .select('*, category:categories(*)')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('next_due')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spese ricorrenti</h1>
          <p className="text-sm text-gray-500 mt-1">Template per spese periodiche</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nuova</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Nuova spesa ricorrente</DialogTitle></DialogHeader>
            <form action={createRecurring} className="space-y-4">
              <div>
                <Label>Descrizione</Label>
                <Input name="description" placeholder="Es. Abbonamento Netflix" required className="mt-1" />
              </div>
              <div>
                <Label>Importo (€)</Label>
                <Input name="amount" type="number" step="0.01" min="0" placeholder="0.00" required className="mt-1" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select name="category_id" required>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequenza</Label>
                <Select name="frequency" defaultValue="monthly">
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Settimanale</SelectItem>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="yearly">Annuale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prima scadenza</Label>
                <Input name="next_due" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="auto_create" value="true" id="auto_create" className="h-4 w-4" />
                <Label htmlFor="auto_create" className="text-sm font-normal cursor-pointer">
                  Crea spesa automaticamente alla scadenza
                </Label>
              </div>
              <Button type="submit" className="w-full">Salva</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {recurring?.map(r => {
          const daysUntil = Math.ceil(
            (new Date(r.next_due).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)
          )
          return (
            <div key={r.id}
              className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: ((r as any).category?.color ?? '#6b7280') + '25' }}
              >
                {(r as any).category?.icon ?? '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQ_COLORS[r.frequency]}`}>
                    {FREQ_LABELS[r.frequency]}
                  </span>
                  <span className="text-xs text-gray-500">
                    Prossima: {format(new Date(r.next_due), 'dd MMM', { locale: it })}
                    {daysUntil <= 3 && daysUntil >= 0 && (
                      <span className="ml-1 text-amber-600 font-medium">(tra {daysUntil}gg)</span>
                    )}
                  </span>
                  {r.auto_create && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium">
                      Auto
                    </span>
                  )}
                </div>
              </div>
              <span className="font-semibold text-sm shrink-0">€{Number(r.amount).toFixed(2)}</span>
              <form action={createExpenseFromRecurring.bind(null, r.id)}>
                <Button variant="outline" size="icon" className="h-8 w-8 text-green-600 border-green-300 hover:bg-green-50" title="Registra ora">
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </form>
              <form action={deactivateRecurring.bind(null, r.id)}>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          )
        })}
        {(!recurring || recurring.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🔄</p>
            <p>Nessuna spesa ricorrente. Aggiungine una!</p>
          </div>
        )}
      </div>
    </div>
  )
}
