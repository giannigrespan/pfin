import { createClient } from '@/lib/supabase/server'
import { CategoryForm } from '@/components/categories/category-form'
import { deleteCategory } from '@/app/actions/categories'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default async function CategoriePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user!.id)
    .single()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', profile?.household_id ?? '')
    .order('name')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorie</h1>
          <p className="text-sm text-gray-500 mt-1">
            Definisci come suddividere ogni tipo di spesa
          </p>
        </div>
        <CategoryForm />
      </div>

      <div className="space-y-2">
        {categories?.map(cat => (
          <div
            key={cat.id}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: cat.color + '25' }}
              >
                {cat.icon}
              </div>
              <div>
                <p className="font-medium text-sm">{cat.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {cat.split_type === 'personal'
                    ? '👤 Personale'
                    : `🤝 ${Math.round(cat.split_ratio * 100)}% / ${Math.round((1 - cat.split_ratio) * 100)}%`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <CategoryForm category={cat} />
              <form action={deleteCategory.bind(null, cat.id)}>
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
        ))}

        {(!categories || categories.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📁</p>
            <p>Nessuna categoria. Creane una!</p>
          </div>
        )}
      </div>
    </div>
  )
}
