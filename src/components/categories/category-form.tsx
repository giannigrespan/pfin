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
import { createCategory, updateCategory } from '@/app/actions/categories'
import { Category } from '@/types/database'
import { Plus, Pencil } from 'lucide-react'

const ICONS = ['🛒','⚡','🏠','🍕','🚗','👕','💊','🎮','📦','✈️','🎓','💄','🐾','🎵','🏋️','☕','🎁','🏥','📱','🌐']
const COLORS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#f59e0b', label: 'Ambra' },
  { value: '#ef4444', label: 'Rosso' },
  { value: '#3b82f6', label: 'Blu' },
  { value: '#8b5cf6', label: 'Viola' },
  { value: '#10b981', label: 'Smeraldo' },
  { value: '#f97316', label: 'Arancio' },
  { value: '#6b7280', label: 'Grigio' },
  { value: '#ec4899', label: 'Rosa' },
]

interface CategoryFormProps {
  category?: Category
}

export function CategoryForm({ category }: CategoryFormProps) {
  const [open, setOpen] = useState(false)
  const [splitType, setSplitType] = useState<string>(category?.split_type ?? 'shared')
  const [selectedIcon, setSelectedIcon] = useState<string>(category?.icon ?? '📦')
  const [selectedColor, setSelectedColor] = useState<string>(category?.color ?? '#6366f1')

  const handleAction = async (formData: FormData) => {
    formData.set('icon', selectedIcon)
    formData.set('color', selectedColor)
    if (category) {
      await updateCategory(category.id, formData)
    } else {
      await createCategory(formData)
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nuova categoria
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {category ? 'Modifica categoria' : 'Nuova categoria'}
          </DialogTitle>
        </DialogHeader>
        <form action={handleAction} className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              name="name"
              defaultValue={category?.name}
              placeholder="Es. Spesa alimentare"
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-1 mt-1 p-2 border rounded-lg">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`text-xl p-1 rounded transition-colors ${
                    selectedIcon === icon
                      ? 'bg-indigo-100 dark:bg-indigo-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Colore</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COLORS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedColor(value)}
                  title={label}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    selectedColor === value ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''
                  }`}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label>Tipo di spesa</Label>
            <Select
              name="split_type"
              defaultValue={category?.split_type ?? 'shared'}
              onValueChange={setSplitType}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">👤 Personale (100% tua)</SelectItem>
                <SelectItem value="shared">🤝 Condivisa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {splitType === 'shared' && (
            <div>
              <Label>Quota utente A (%)</Label>
              <Input
                name="split_ratio"
                type="number"
                min="0"
                max="100"
                step="5"
                defaultValue={category ? Math.round(category.split_ratio * 100) : 50}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                50 = metà ciascuno. Il restante va all'utente B.
              </p>
            </div>
          )}

          {splitType === 'personal' && (
            <input type="hidden" name="split_ratio" value="100" />
          )}

          <Button type="submit" className="w-full">
            {category ? 'Salva modifiche' : 'Crea categoria'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
