import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nessun file' }, { status: 400 })

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo immagini supportate' }, { status: 400 })
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Immagine troppo grande (max 5MB)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${user.id}/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(filename, file, { contentType: file.type, upsert: false })

  if (error) {
    console.error('Storage upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('receipts')
    .getPublicUrl(data.path)

  return NextResponse.json({ url: publicUrl })
}
