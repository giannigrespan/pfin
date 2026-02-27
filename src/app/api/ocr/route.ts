import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  if (!process.env.GEMINI_API_KEY) {
    // Gemini not configured - return empty result (graceful fallback)
    return NextResponse.json({ amount: null, description: null, date: null, notes: null })
  }

  const { imageUrl } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'Nessuna URL immagine' }, { status: 400 })

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // Download image and convert to base64
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) throw new Error('Cannot fetch image')
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64 = Buffer.from(imageBuffer).toString('base64')
    const mimeType = (imageResponse.headers.get('content-type') ?? 'image/jpeg') as string

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      `Analizza questo scontrino italiano e rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, nessun testo aggiuntivo. Il JSON deve avere esattamente questi campi:
{
  "amount": <numero decimale del totale da pagare, null se non leggibile>,
  "description": "<nome del negozio o esercizio commerciale, null se non leggibile>",
  "date": "<data in formato YYYY-MM-DD, null se non leggibile>",
  "notes": "<eventuali note utili come numero scontrino o lista articoli principali, null se non rilevanti>"
}
Rispondi solo con il JSON. Niente altro.`,
    ])

    const text = result.response.text().trim()

    // Strip markdown code blocks if model wraps response
    const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      description: typeof parsed.description === 'string' ? parsed.description : null,
      date: typeof parsed.date === 'string' && parsed.date.match(/^\d{4}-\d{2}-\d{2}$/) ? parsed.date : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes : null,
    })
  } catch (error) {
    console.error('OCR error:', error)
    // Return empty result on any error - user enters manually
    return NextResponse.json({ amount: null, description: null, date: null, notes: null })
  }
}
