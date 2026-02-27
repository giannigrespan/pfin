'use client'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { createExpense } from '@/app/actions/expenses'
import { Category } from '@/types/database'
import { Plus, Camera, Loader2, X } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface ExpenseFormProps {
  categories: Category[]
}

export function ExpenseForm({ categories }: ExpenseFormProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [ocrData, setOcrData] = useState<{
    amount?: number | null
    description?: string | null
    date?: string | null
    notes?: string | null
  }>({})

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const uploadRes = await fetch('/api/upload-receipt', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { url } = await uploadRes.json()
      setReceiptUrl(url)

      // OCR
      const toastId = toast.loading('Analisi scontrino...')
      const ocrRes = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url }),
      })
      const data = await ocrRes.json()
      setOcrData(data)
      toast.dismiss(toastId)
      if (data.amount) {
        toast.success('Scontrino analizzato! Verifica i dati.')
      } else {
        toast.info('Inserisci i dati manualmente.')
      }
    } catch {
      toast.error('Errore caricamento. Inserisci manualmente.')
    } finally {
      setUploading(false)
    }
  }

  const handleAction = async (formData: FormData) => {
    if (receiptUrl) formData.set('receipt_url', receiptUrl)
    await createExpense(formData)
    setOpen(false)
    setReceiptUrl(null)
    setOcrData({})
  }

  const resetReceipt = () => {
    setReceiptUrl(null)
    setOcrData({})
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi spesa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova spesa</DialogTitle>
        </DialogHeader>

        {/* Receipt upload area */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-3 text-center">
          {receiptUrl ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl} alt="Scontrino" className="max-h-28 mx-auto rounded-lg" />
              <button
                type="button"
                onClick={resetReceipt}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-2">
              {uploading
                ? <Loader2 className="h-6 w-6 animate-spin" />
                : <Camera className="h-6 w-6" />}
              <span className="text-xs">{uploading ? 'Analisi in corso...' : 'Scatta o carica scontrino'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
          )}
        </div>

        <form action={handleAction} className="space-y-3">
          <div>
            <Label>Importo (€)</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              defaultValue={ocrData.amount ?? ''}
              key={`amount-${ocrData.amount}`}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Input
              name="description"
              placeholder="Es. Esselunga"
              defaultValue={ocrData.description ?? ''}
              key={`desc-${ocrData.description}`}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select name="category_id" required>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleziona categoria..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data</Label>
            <Input
              name="date"
              type="date"
              defaultValue={ocrData.date ?? format(new Date(), 'yyyy-MM-dd')}
              key={`date-${ocrData.date}`}
              required
              className="mt-1"
            />
          </div>
          {ocrData.notes && (
            <div>
              <Label>Note</Label>
              <Input name="notes" defaultValue={ocrData.notes} className="mt-1" />
            </div>
          )}
          <Button type="submit" className="w-full mt-1">
            Aggiungi spesa
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
