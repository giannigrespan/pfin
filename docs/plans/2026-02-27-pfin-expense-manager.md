# PFin — Personal Finance Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Web app per la gestione delle spese di coppia con Google OAuth, categorie con split configurabile, conguaglio mensile, OCR scontrini, bollette con reminder email, spese ricorrenti, export CSV mensile via email.

**Architecture:** Next.js 15 App Router full-stack con Supabase per auth/DB/storage. Due utenti fissi in un "household". Server Actions per mutazioni dati. Supabase Edge Functions per cron job (reminder bollette + CSV mensile).

**Tech Stack:** Next.js 15, Supabase, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Google Gemini Vision API, Resend

---

## FASE 1 — Foundation (Auth + Struttura Base)

### Task 1: Setup progetto Next.js + dipendenze

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `.env.local.example`

**Step 1: Inizializza il progetto**

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

**Step 2: Installa dipendenze**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-tabs
npm install shadcn-ui
npx shadcn@latest init
npx shadcn@latest add button card dialog input label select tabs badge avatar dropdown-menu sheet toast sonner
npm install recharts
npm install date-fns
npm install resend
npm install lucide-react
npm install @google/generative-ai
npm install react-hook-form @hookform/resolvers zod
```

**Step 3: Crea `.env.local.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Step 4: Commit**

```bash
git init
git add .
git commit -m "feat: setup Next.js 15 + Supabase + shadcn/ui"
```

---

### Task 2: Supabase — Schema database

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Crea il file di migrazione**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Households (nucleo familiare)
create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Casa',
  user_a_id uuid references auth.users(id),
  user_b_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Profiles (estende auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  household_id uuid references households(id),
  created_at timestamptz default now()
);

-- Categorie con regola di split
create table categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text default '💰',
  color text default '#6366f1',
  split_type text not null check (split_type in ('personal', 'shared')),
  -- ratio: percentuale pagata da user_a (0.0 - 1.0). 0.5 = 50/50
  split_ratio float default 0.5,
  created_at timestamptz default now()
);

-- Spese
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  paid_by uuid references auth.users(id),
  category_id uuid references categories(id),
  amount decimal(10,2) not null,
  description text,
  date date not null default current_date,
  is_recurring boolean default false,
  recurring_expense_id uuid,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

-- Template spese ricorrenti
create table recurring_expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  paid_by uuid references auth.users(id),
  amount decimal(10,2) not null,
  description text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due date not null,
  auto_create boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

-- Bollette
create table bills (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  name text not null,
  amount decimal(10,2),
  due_day int not null check (due_day between 1 and 31),
  reminder_days_before int default 3,
  last_paid_date date,
  active boolean default true,
  created_at timestamptz default now()
);

-- Inviti household
create table household_invites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  invited_email text not null,
  token text unique not null,
  accepted boolean default false,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- RLS Policies
alter table households enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;
alter table recurring_expenses enable row level security;
alter table bills enable row level security;
alter table household_invites enable row level security;

-- Policy: utenti vedono solo il proprio household
create policy "household_access" on households
  for all using (
    auth.uid() = user_a_id or auth.uid() = user_b_id
  );

create policy "profile_access" on profiles
  for all using (auth.uid() = id);

create policy "category_access" on categories
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "expense_access" on expenses
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "recurring_access" on recurring_expenses
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "bills_access" on bills
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

create policy "invite_access" on household_invites
  for all using (
    household_id in (
      select id from households
      where user_a_id = auth.uid() or user_b_id = auth.uid()
    )
  );

-- Trigger: crea profilo automaticamente dopo signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Categorie di default (inserite dopo la creazione del household via server action)
-- Non inserire qui, le creiamo programmaticamente
```

**Step 2: Applica la migrazione su Supabase**

Nel pannello Supabase → SQL Editor → incolla e esegui.
In alternativa con CLI: `supabase db push`

**Step 3: Configura Google OAuth su Supabase**

1. Supabase Dashboard → Authentication → Providers → Google
2. Abilita Google, inserisci Client ID e Secret da Google Cloud Console
3. Aggiungi redirect URL: `https://your-project.supabase.co/auth/v1/callback`
4. In Google Cloud Console aggiungi anche: `http://localhost:3000/auth/callback`

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: database schema con RLS policies"
```

---

### Task 3: Supabase client + tipi TypeScript

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/types/database.ts`
- Create: `src/middleware.ts`

**Step 1: Client browser**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: Client server**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 3: Middleware per proteggere le route**

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect al login se non autenticato (eccetto /login e /auth)
  if (!user && !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect alla dashboard se già autenticato e va al login
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**Step 4: Tipi TypeScript**

```typescript
// src/types/database.ts
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
  // joined
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
```

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: Supabase client + TypeScript types + middleware auth"
```

---

### Task 4: Auth — pagina login + OAuth callback

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/actions/auth.ts`

**Step 1: Server action per login Google**

```typescript
// src/app/actions/auth.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export async function signInWithGoogle() {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) redirect('/login?error=auth_failed')
  if (data.url) redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

**Step 2: Callback route**

```typescript
// src/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Controlla se l'utente ha già un household
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('household_id')
          .eq('id', user.id)
          .single()

        if (!profile?.household_id) {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

**Step 3: Pagina login**

```typescript
// src/app/login/page.tsx
import { signInWithGoogle } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Chrome } from 'lucide-react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💰</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PFin</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Gestione spese di coppia
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm text-center">
            Accesso fallito. Riprova.
          </div>
        )}

        <form action={signInWithGoogle}>
          <Button type="submit" className="w-full" size="lg">
            <Chrome className="mr-2 h-5 w-5" />
            Accedi con Google
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          App privata per uso familiare
        </p>
      </div>
    </div>
  )
}
```

**Step 4: Testa il login**

```bash
npm run dev
# Vai su http://localhost:3000 → dovrebbe redirectare a /login
# Clicca "Accedi con Google" → completa OAuth → redirecta a /dashboard o /onboarding
```

**Step 5: Commit**

```bash
git add src/app/
git commit -m "feat: Google OAuth login + auth callback route"
```

---

### Task 5: Onboarding — creazione household + invito partner

**Files:**
- Create: `src/app/onboarding/page.tsx`
- Create: `src/app/actions/household.ts`
- Create: `src/app/invite/[token]/page.tsx`

**Step 1: Server actions household**

```typescript
// src/app/actions/household.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

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

  // Crea household
  const { data: household, error } = await supabase
    .from('households')
    .insert({ name: householdName, user_a_id: user.id })
    .select()
    .single()

  if (error) throw new Error('Errore creazione household')

  // Aggiorna profilo con household_id
  await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  // Crea categorie di default
  await supabase.from('categories').insert(
    DEFAULT_CATEGORIES.map(c => ({ ...c, household_id: household.id }))
  )

  // Crea invito per il partner
  const token = crypto.randomBytes(32).toString('hex')
  await supabase.from('household_invites').insert({
    household_id: household.id,
    invited_email: partnerEmail,
    token,
  })

  // Invia email invito
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: partnerEmail,
    subject: `${user.email} ti invita su PFin`,
    html: `
      <h2>Sei stato invitato su PFin</h2>
      <p>${user.email} ti ha invitato a gestire le spese insieme.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}"
         style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Accetta invito
      </a>
      <p>Il link scade tra 7 giorni.</p>
    `,
  })

  redirect('/dashboard')
}

export async function acceptInvite(token: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/invite/${token}`)

  const { data: invite } = await supabase
    .from('household_invites')
    .select('*, households(*)')
    .eq('token', token)
    .eq('accepted', false)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) redirect('/login?error=invite_invalid')

  // Aggiorna household con user_b
  await supabase
    .from('households')
    .update({ user_b_id: user.id })
    .eq('id', invite.household_id)

  // Aggiorna profilo
  await supabase
    .from('profiles')
    .update({ household_id: invite.household_id })
    .eq('id', user.id)

  // Segna invito come accettato
  await supabase
    .from('household_invites')
    .update({ accepted: true })
    .eq('id', invite.id)

  redirect('/dashboard')
}
```

**Step 2: Pagina onboarding**

```typescript
// src/app/onboarding/page.tsx
import { createHousehold } from '@/app/actions/household'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Benvenuto su PFin! 🎉</h1>
        <p className="text-gray-500 mb-6">
          Crea il tuo nucleo domestico e invita il tuo partner.
        </p>
        <form action={createHousehold} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome nucleo domestico</Label>
            <Input id="name" name="name" placeholder="Casa Rossi" required />
          </div>
          <div>
            <Label htmlFor="partnerEmail">Email del partner</Label>
            <Input
              id="partnerEmail"
              name="partnerEmail"
              type="email"
              placeholder="partner@email.com"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Crea e invia invito
          </Button>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Pagina accetta invito**

```typescript
// src/app/invite/[token]/page.tsx
import { acceptInvite } from '@/app/actions/household'
import { Button } from '@/components/ui/button'

export default function InvitePage({ params }: { params: { token: string } }) {
  const accept = acceptInvite.bind(null, params.token)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <div className="text-4xl mb-4">🏠</div>
        <h1 className="text-2xl font-bold mb-2">Invito ricevuto!</h1>
        <p className="text-gray-500 mb-6">
          Sei stato invitato a gestire le spese insieme.
        </p>
        <form action={accept}>
          <Button type="submit" className="w-full">Accetta invito</Button>
        </form>
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: onboarding household + invito partner via email"
```

---

### Task 6: Layout principale con sidebar

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/app/(app)/dashboard/page.tsx` (placeholder)

**Step 1: Sidebar component**

```typescript
// src/components/layout/sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Receipt, Tags, Repeat,
  Zap, BarChart3, Settings
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/spese', label: 'Spese', icon: Receipt },
  { href: '/ricorrenti', label: 'Ricorrenti', icon: Repeat },
  { href: '/bollette', label: 'Bollette', icon: Zap },
  { href: '/categorie', label: 'Categorie', icon: Tags },
  { href: '/conguaglio', label: 'Conguaglio', icon: BarChart3 },
  { href: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex flex-col w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xl font-bold">💰 PFin</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === href
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

**Step 2: Layout app**

```typescript
// src/app/(app)/layout.tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

**Step 3: Header con user menu**

```typescript
// src/components/layout/header.tsx
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { LogOut } from 'lucide-react'

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user?.id)
    .single()

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-end px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? ''} />
              <AvatarFallback>
                {profile?.full_name?.[0] ?? '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm hidden sm:block">{profile?.full_name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full flex items-center gap-2 cursor-pointer">
                <LogOut className="h-4 w-4" />
                Esci
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: layout principale con sidebar + header"
```

---

## FASE 2 — Core Spese

### Task 7: Categorie — CRUD completo

**Files:**
- Create: `src/app/(app)/categorie/page.tsx`
- Create: `src/app/actions/categories.ts`
- Create: `src/components/categories/category-form.tsx`

**Step 1: Server actions categorie**

```typescript
// src/app/actions/categories.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const categorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().default('📦'),
  color: z.string().default('#6b7280'),
  split_type: z.enum(['personal', 'shared']),
  split_ratio: z.coerce.number().min(0).max(1).default(0.5),
})

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', userId)
    .single()
  return data?.household_id
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  const parsed = categorySchema.parse(Object.fromEntries(formData))

  await supabase.from('categories').insert({ ...parsed, household_id: householdId })
  revalidatePath('/categorie')
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient()
  const parsed = categorySchema.parse(Object.fromEntries(formData))
  await supabase.from('categories').update(parsed).eq('id', id)
  revalidatePath('/categorie')
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()
  await supabase.from('categories').delete().eq('id', id)
  revalidatePath('/categorie')
}
```

**Step 2: Pagina categorie**

```typescript
// src/app/(app)/categorie/page.tsx
import { createClient } from '@/lib/supabase/server'
import { CategoryForm } from '@/components/categories/category-form'
import { deleteCategory } from '@/app/actions/categories'
import { Button } from '@/components/ui/button'
import { Trash2, Pencil } from 'lucide-react'

export default async function CategoriePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', profile?.household_id)
    .order('name')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorie</h1>
        <CategoryForm />
      </div>

      <div className="space-y-2">
        {categories?.map(cat => (
          <div key={cat.id}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{ backgroundColor: cat.color + '20' }}>
                {cat.icon}
              </div>
              <div>
                <p className="font-medium">{cat.name}</p>
                <p className="text-xs text-gray-500">
                  {cat.split_type === 'personal' ? '👤 Personale' :
                    `🤝 Condivisa ${Math.round(cat.split_ratio * 100)}% / ${Math.round((1 - cat.split_ratio) * 100)}%`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <CategoryForm category={cat} />
              <form action={deleteCategory.bind(null, cat.id)}>
                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Form categoria (dialog)**

```typescript
// src/components/categories/category-form.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCategory, updateCategory } from '@/app/actions/categories'
import { Category } from '@/types/database'
import { Plus, Pencil } from 'lucide-react'

const ICONS = ['🛒','⚡','🏠','🍕','🚗','👕','💊','🎮','📦','✈️','🎓','💄','🐾','🎵','🏋️']
const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#10b981','#f97316','#6b7280']

export function CategoryForm({ category }: { category?: Category }) {
  const [open, setOpen] = useState(false)
  const [splitType, setSplitType] = useState(category?.split_type ?? 'shared')

  const action = category
    ? updateCategory.bind(null, category.id)
    : createCategory

  const handleAction = async (formData: FormData) => {
    await action(formData)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={category ? 'ghost' : 'default'} size={category ? 'icon' : 'default'}>
          {category ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4 mr-2" />Nuova categoria</>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>
        <form action={handleAction} className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input name="name" defaultValue={category?.name} placeholder="Es. Spesa alimentare" required />
          </div>
          <div>
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONS.map(icon => (
                <label key={icon} className="cursor-pointer">
                  <input type="radio" name="icon" value={icon} className="sr-only"
                    defaultChecked={category?.icon === icon} />
                  <span className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 block">{icon}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select name="split_type" defaultValue={category?.split_type ?? 'shared'}
              onValueChange={v => setSplitType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">👤 Personale</SelectItem>
                <SelectItem value="shared">🤝 Condivisa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {splitType === 'shared' && (
            <div>
              <Label>Quota utente A (%)</Label>
              <Input name="split_ratio" type="number" min="0" max="100" step="5"
                defaultValue={Math.round((category?.split_ratio ?? 0.5) * 100)}
                onChange={e => {
                  const input = e.target as HTMLInputElement
                  input.value = String(Math.min(100, Math.max(0, Number(input.value))))
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                50 = metà ciascuno. Il valore viene diviso per 100 internamente.
              </p>
            </div>
          )}
          {splitType === 'personal' && (
            <input type="hidden" name="split_ratio" value="1.0" />
          )}
          <Button type="submit" className="w-full">
            {category ? 'Salva' : 'Crea categoria'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: CRUD categorie con configurazione split"
```

---

### Task 8: Spese — lista + inserimento manuale

**Files:**
- Create: `src/app/(app)/spese/page.tsx`
- Create: `src/app/actions/expenses.ts`
- Create: `src/components/expenses/expense-form.tsx`
- Create: `src/components/expenses/expense-list.tsx`

**Step 1: Server actions spese**

```typescript
// src/app/actions/expenses.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const expenseSchema = z.object({
  amount: z.coerce.number().positive(),
  description: z.string().optional(),
  category_id: z.string().uuid(),
  date: z.string(),
  notes: z.string().optional(),
})

async function getHouseholdId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id
}

export async function createExpense(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const householdId = await getHouseholdId(supabase, user.id)
  const parsed = expenseSchema.parse(Object.fromEntries(formData))
  const receiptUrl = formData.get('receipt_url') as string | null

  await supabase.from('expenses').insert({
    ...parsed,
    household_id: householdId,
    paid_by: user.id,
    receipt_url: receiptUrl || null,
  })
  revalidatePath('/spese')
  revalidatePath('/dashboard')
}

export async function deleteExpense(id: string) {
  const supabase = await createClient()
  await supabase.from('expenses').delete().eq('id', id)
  revalidatePath('/spese')
  revalidatePath('/dashboard')
}

export async function getExpenses(month?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  let query = supabase
    .from('expenses')
    .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
    .eq('household_id', profile?.household_id)
    .order('date', { ascending: false })

  if (month) {
    const [year, m] = month.split('-')
    const start = `${year}-${m}-01`
    const end = new Date(Number(year), Number(m), 0).toISOString().split('T')[0]
    query = query.gte('date', start).lte('date', end)
  }

  const { data } = await query
  return data ?? []
}
```

**Step 2: Form spesa**

Vedi componente completo nella sezione OCR (Task 10) che include anche l'upload foto.
Per ora crea un form base senza OCR:

```typescript
// src/components/expenses/expense-form.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createExpense } from '@/app/actions/expenses'
import { Category } from '@/types/database'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'

export function ExpenseForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false)

  const handleAction = async (formData: FormData) => {
    await createExpense(formData)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Aggiungi spesa</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuova spesa</DialogTitle>
        </DialogHeader>
        <form action={handleAction} className="space-y-4">
          <div>
            <Label>Importo (€)</Label>
            <Input name="amount" type="number" step="0.01" placeholder="0.00" required />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Input name="description" placeholder="Es. Esselunga" />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select name="category_id" required>
              <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
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
            <Input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required />
          </div>
          <Button type="submit" className="w-full">Aggiungi</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 3: Pagina spese**

```typescript
// src/app/(app)/spese/page.tsx
import { getExpenses } from '@/app/actions/expenses'
import { createClient } from '@/lib/supabase/server'
import { ExpenseForm } from '@/components/expenses/expense-form'
import { deleteExpense } from '@/app/actions/expenses'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default async function SpesePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const { data: categories } = await supabase
    .from('categories').select('*').eq('household_id', profile?.household_id).order('name')

  const expenses = await getExpenses()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Spese</h1>
        <ExpenseForm categories={categories ?? []} />
      </div>

      <div className="space-y-2">
        {expenses.map(expense => (
          <div key={expense.id}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{expense.category?.icon ?? '📦'}</div>
              <div>
                <p className="font-medium">{expense.description ?? expense.category?.name}</p>
                <p className="text-xs text-gray-500">
                  {format(new Date(expense.date), 'dd MMM yyyy', { locale: it })} •{' '}
                  {expense.paid_by_profile?.full_name ?? 'Tu'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-lg">€{Number(expense.amount).toFixed(2)}</span>
              <form action={deleteExpense.bind(null, expense.id)}>
                <Button variant="ghost" size="icon" className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: lista e inserimento spese"
```

---

### Task 9: Dashboard con totali e grafico

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/dashboard/spending-chart.tsx`
- Create: `src/components/dashboard/balance-card.tsx`

**Step 1: Logica di calcolo conguaglio (riutilizzata anche in /conguaglio)**

```typescript
// src/lib/reconciliation.ts
import { Expense, Category, Profile } from '@/types/database'

export interface ReconciliationResult {
  totalShared: number
  userAShared: number  // quanto A avrebbe dovuto pagare
  userBShared: number  // quanto B avrebbe dovuto pagare
  userAPaid: number    // quanto A ha effettivamente pagato
  userBPaid: number    // quanto B ha effettivamente pagato
  balance: number      // positivo = A deve a B, negativo = B deve ad A
  debtorName: string
  creditorName: string
  amount: number
}

export function calculateReconciliation(
  expenses: (Expense & { category?: Category })[],
  userAId: string,
  userBId: string,
  userAName: string,
  userBName: string
): ReconciliationResult {
  let userAOwes = 0  // quanto A avrebbe dovuto pagare
  let userBOwes = 0  // quanto B avrebbe dovuto pagare
  let userAPaid = 0  // quanto A ha pagato
  let userBPaid = 0  // quanto B ha pagato
  let totalShared = 0

  for (const expense of expenses) {
    const amount = Number(expense.amount)
    const cat = expense.category

    if (!cat || cat.split_type === 'personal') {
      // Spesa personale: non entra nel conguaglio
      if (expense.paid_by === userAId) userAPaid += amount
      else userBPaid += amount
      continue
    }

    // Spesa condivisa
    totalShared += amount
    const aShare = amount * cat.split_ratio
    const bShare = amount * (1 - cat.split_ratio)
    userAOwes += aShare
    userBOwes += bShare

    if (expense.paid_by === userAId) userAPaid += amount
    else userBPaid += amount
  }

  // Bilancio: positivo = A ha pagato più di quello che doveva
  const aBalance = userAPaid - userAOwes  // se positivo A ha pagato troppo → B deve ad A

  const debtorName = aBalance >= 0 ? userBName : userAName
  const creditorName = aBalance >= 0 ? userAName : userBName

  return {
    totalShared,
    userAShared: userAOwes,
    userBShared: userBOwes,
    userAPaid,
    userBPaid,
    balance: aBalance,
    debtorName,
    creditorName,
    amount: Math.abs(aBalance),
  }
}
```

**Step 2: Dashboard page**

```typescript
// src/app/(app)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { calculateReconciliation } from '@/lib/reconciliation'
import { SpendingChart } from '@/components/dashboard/spending-chart'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingDown, Users, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const { data: household } = await supabase
    .from('households').select('*, profiles!households_user_a_id_fkey(*), profiles!households_user_b_id_fkey(*)')
    .eq('id', profile?.household_id).single()

  const now = new Date()
  const start = format(startOfMonth(now), 'yyyy-MM-dd')
  const end = format(endOfMonth(now), 'yyyy-MM-dd')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*)')
    .eq('household_id', profile?.household_id)
    .gte('date', start).lte('date', end)

  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .eq('household_id', profile?.household_id)
    .eq('active', true)

  // Bollette in scadenza nei prossimi 7 giorni
  const today = now.getDate()
  const upcomingBills = bills?.filter(b => {
    const diff = b.due_day - today
    return diff >= 0 && diff <= 7
  }) ?? []

  const userAId = household?.user_a_id
  const userBId = household?.user_b_id
  const userAName = (household as any)?.['profiles!households_user_a_id_fkey']?.full_name ?? 'Utente A'
  const userBName = (household as any)?.['profiles!households_user_b_id_fkey']?.full_name ?? 'Utente B'

  const reconciliation = calculateReconciliation(
    expenses ?? [], userAId, userBId, userAName, userBName
  )

  const totalMonth = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0

  // Raggruppa per categoria per il grafico
  const categoryTotals = (expenses ?? []).reduce((acc, e) => {
    const catName = e.category?.name ?? 'Altro'
    const icon = e.category?.icon ?? '📦'
    const color = e.category?.color ?? '#6b7280'
    if (!acc[catName]) acc[catName] = { name: catName, icon, color, value: 0 }
    acc[catName].value += Number(e.amount)
    return acc
  }, {} as Record<string, { name: string; icon: string; color: string; value: number }>)

  const chartData = Object.values(categoryTotals).sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500">
          {format(now, 'MMMM yyyy', { locale: it })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Spese del mese</CardTitle>
            <TrendingDown className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">€{totalMonth.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conguaglio</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-indigo-600">
              €{reconciliation.amount.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {reconciliation.debtorName} deve a {reconciliation.creditorName}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bollette in scadenza</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{upcomingBills.length}</p>
            <p className="text-xs text-gray-500 mt-1">nei prossimi 7 giorni</p>
          </CardContent>
        </Card>
      </div>

      {/* Grafico */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spese per categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingChart data={chartData} />
          </CardContent>
        </Card>
      )}

      {/* Bollette imminenti */}
      {upcomingBills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Bollette in scadenza
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingBills.map(bill => (
              <div key={bill.id}
                className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="font-medium">{bill.name}</span>
                <div className="text-right">
                  {bill.amount && <span className="font-semibold">€{Number(bill.amount).toFixed(2)}</span>}
                  <p className="text-xs text-gray-500">entro il {bill.due_day}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Step 3: Grafico donut**

```typescript
// src/components/dashboard/spending-chart.tsx
'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ChartData {
  name: string
  icon: string
  color: string
  value: number
}

export function SpendingChart({ data }: { data: ChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: dashboard con KPI, grafico donut e bollette imminenti"
```

---

## FASE 3 — Features Avanzate

### Task 10: OCR scontrini con Gemini Vision

**Files:**
- Create: `src/app/api/ocr/route.ts`
- Create: `src/app/api/upload-receipt/route.ts`
- Modify: `src/components/expenses/expense-form.tsx`

**Step 1: API route per upload foto**

```typescript
// src/app/api/upload-receipt/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'Nessun file' }, { status: 400 })

  const filename = `${user.id}/${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(filename, file, { contentType: file.type })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('receipts').getPublicUrl(data.path)

  return NextResponse.json({ url: publicUrl })
}
```

**Step 2: API route OCR con Gemini**

```typescript
// src/app/api/ocr/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { imageUrl } = await req.json()

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // Scarica l'immagine e convertila in base64
    const imageResponse = await fetch(imageUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64 = Buffer.from(imageBuffer).toString('base64')
    const mimeType = imageResponse.headers.get('content-type') ?? 'image/jpeg'

    const result = await model.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      `Analizza questo scontrino e rispondi SOLO con un JSON valido (nessun markdown) con questi campi:
      {
        "amount": <numero decimale totale da pagare>,
        "description": "<nome negozio o esercizio commerciale>",
        "date": "<data in formato YYYY-MM-DD, se leggibile>",
        "notes": "<eventuali note rilevanti>"
      }
      Se non riesci a leggere un campo, usa null per quel campo.
      Non aggiungere testo prima o dopo il JSON.`,
    ])

    const text = result.response.text().trim()
    const parsed = JSON.parse(text)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json({ amount: null, description: null, date: null, notes: null })
  }
}
```

**Step 3: Crea bucket su Supabase**

Nel pannello Supabase → Storage → New bucket → nome: `receipts` → Public: true

**Step 4: Form spesa aggiornato con OCR**

Aggiorna `src/components/expenses/expense-form.tsx` per includere:
- Upload foto con preview
- Chiamata a `/api/upload-receipt` poi `/api/ocr`
- Pre-compilazione automatica dei campi

```typescript
// src/components/expenses/expense-form.tsx (versione completa con OCR)
'use client'
import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createExpense } from '@/app/actions/expenses'
import { Category } from '@/types/database'
import { Plus, Camera, Loader2, X } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export function ExpenseForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [ocrData, setOcrData] = useState<{
    amount?: number; description?: string; date?: string; notes?: string
  }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Upload foto
      const fd = new FormData()
      fd.append('file', file)
      const uploadRes = await fetch('/api/upload-receipt', { method: 'POST', body: fd })
      const { url } = await uploadRes.json()
      setReceiptUrl(url)

      // OCR
      toast.loading('Analisi scontrino in corso...')
      const ocrRes = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url }),
      })
      const data = await ocrRes.json()
      setOcrData(data)
      toast.dismiss()
      toast.success('Scontrino analizzato! Verifica i dati.')
    } catch {
      toast.error('Errore analisi scontrino. Inserisci i dati manualmente.')
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Aggiungi spesa</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova spesa</DialogTitle>
        </DialogHeader>

        {/* Upload scontrino */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          {receiptUrl ? (
            <div className="relative">
              <img src={receiptUrl} alt="Scontrino" className="max-h-32 mx-auto rounded-lg" />
              <button onClick={() => { setReceiptUrl(null); setOcrData({}) }}
                className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center gap-2 w-full text-gray-500 hover:text-gray-700">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              <span className="text-sm">{uploading ? 'Analisi...' : 'Scatta o carica scontrino'}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={handleFileChange} className="hidden" />
        </div>

        <form action={handleAction} className="space-y-4">
          <div>
            <Label>Importo (€)</Label>
            <Input name="amount" type="number" step="0.01"
              defaultValue={ocrData.amount ?? ''} key={ocrData.amount}
              placeholder="0.00" required />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Input name="description"
              defaultValue={ocrData.description ?? ''} key={ocrData.description}
              placeholder="Es. Esselunga" />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select name="category_id" required>
              <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data</Label>
            <Input name="date" type="date"
              defaultValue={ocrData.date ?? format(new Date(), 'yyyy-MM-dd')}
              key={ocrData.date} required />
          </div>
          {ocrData.notes && (
            <div>
              <Label>Note (da scontrino)</Label>
              <Input name="notes" defaultValue={ocrData.notes} />
            </div>
          )}
          <Button type="submit" className="w-full">Aggiungi spesa</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: upload scontrino + OCR Gemini Vision"
```

---

### Task 11: Spese ricorrenti

**Files:**
- Create: `src/app/(app)/ricorrenti/page.tsx`
- Create: `src/app/actions/recurring.ts`
- Create: `src/components/recurring/recurring-form.tsx`

**Step 1: Server actions**

```typescript
// src/app/actions/recurring.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns'

const recurringSchema = z.object({
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  category_id: z.string().uuid(),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  next_due: z.string(),
  auto_create: z.coerce.boolean().default(false),
})

function getNextDue(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(current, 1)
    case 'monthly': return addMonths(current, 1)
    case 'yearly': return addYears(current, 1)
    default: return addMonths(current, 1)
  }
}

export async function createRecurring(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const parsed = recurringSchema.parse(Object.fromEntries(formData))

  await supabase.from('recurring_expenses').insert({
    ...parsed,
    household_id: profile?.household_id,
    paid_by: user.id,
  })
  revalidatePath('/ricorrenti')
}

export async function processRecurringExpenses(householdId: string) {
  // Chiamata da cron job — crea le spese scadute oggi
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: due } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .eq('auto_create', true)
    .lte('next_due', today)

  for (const r of due ?? []) {
    await supabase.from('expenses').insert({
      household_id: r.household_id,
      paid_by: r.paid_by,
      category_id: r.category_id,
      amount: r.amount,
      description: r.description,
      date: r.next_due,
      is_recurring: true,
      recurring_expense_id: r.id,
    })

    const nextDue = getNextDue(new Date(r.next_due), r.frequency)
    await supabase.from('recurring_expenses')
      .update({ next_due: format(nextDue, 'yyyy-MM-dd') })
      .eq('id', r.id)
  }
}

export async function deleteRecurring(id: string) {
  const supabase = await createClient()
  await supabase.from('recurring_expenses').update({ active: false }).eq('id', id)
  revalidatePath('/ricorrenti')
}
```

**Step 2: Pagina ricorrenti**

```typescript
// src/app/(app)/ricorrenti/page.tsx
import { createClient } from '@/lib/supabase/server'
import { RecurringForm } from '@/components/recurring/recurring-form'
import { deleteRecurring } from '@/app/actions/recurring'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const FREQ_LABELS = { weekly: 'Settimanale', monthly: 'Mensile', yearly: 'Annuale' }

export default async function RicorrentiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const { data: categories } = await supabase
    .from('categories').select('*').eq('household_id', profile?.household_id)

  const { data: recurring } = await supabase
    .from('recurring_expenses')
    .select('*, category:categories(*)')
    .eq('household_id', profile?.household_id)
    .eq('active', true)
    .order('next_due')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Spese ricorrenti</h1>
        <RecurringForm categories={categories ?? []} />
      </div>

      <div className="space-y-2">
        {recurring?.map(r => (
          <div key={r.id}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{r.category?.icon}</div>
              <div>
                <p className="font-medium">{r.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{FREQ_LABELS[r.frequency as keyof typeof FREQ_LABELS]}</Badge>
                  <span className="text-xs text-gray-500">
                    Prossima: {format(new Date(r.next_due), 'dd MMM', { locale: it })}
                  </span>
                  {r.auto_create && <Badge className="bg-green-100 text-green-700">Auto</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">€{Number(r.amount).toFixed(2)}</span>
              <form action={deleteRecurring.bind(null, r.id)}>
                <Button variant="ghost" size="icon" className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: spese ricorrenti con auto-creazione"
```

---

### Task 12: Bollette con scadenze

**Files:**
- Create: `src/app/(app)/bollette/page.tsx`
- Create: `src/app/actions/bills.ts`

**Step 1: Server actions bollette**

```typescript
// src/app/actions/bills.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { format } from 'date-fns'

const billSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().optional(),
  due_day: z.coerce.number().min(1).max(31),
  reminder_days_before: z.coerce.number().min(1).max(30).default(3),
  category_id: z.string().uuid().optional(),
})

export async function createBill(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const parsed = billSchema.parse(Object.fromEntries(formData))
  await supabase.from('bills').insert({ ...parsed, household_id: profile?.household_id })
  revalidatePath('/bollette')
}

export async function markBillPaid(billId: string, amount?: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: bill } = await supabase
    .from('bills').select('*, categories(*)').eq('id', billId).single()
  if (!bill) throw new Error('Bolletta non trovata')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  // Crea spesa automatica
  if (bill.category_id) {
    await supabase.from('expenses').insert({
      household_id: profile?.household_id,
      paid_by: user.id,
      category_id: bill.category_id,
      amount: amount ?? bill.amount,
      description: bill.name,
      date: format(new Date(), 'yyyy-MM-dd'),
    })
  }

  await supabase.from('bills')
    .update({ last_paid_date: format(new Date(), 'yyyy-MM-dd') })
    .eq('id', billId)

  revalidatePath('/bollette')
  revalidatePath('/dashboard')
}

export async function deleteBill(id: string) {
  const supabase = await createClient()
  await supabase.from('bills').update({ active: false }).eq('id', id)
  revalidatePath('/bollette')
}
```

**Step 2: Pagina bollette**

```typescript
// src/app/(app)/bollette/page.tsx
import { createClient } from '@/lib/supabase/server'
import { markBillPaid, deleteBill, createBill } from '@/app/actions/bills'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Trash2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function BollettePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const { data: bills } = await supabase
    .from('bills').select('*').eq('household_id', profile?.household_id).eq('active', true).order('due_day')

  const today = new Date().getDate()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bollette</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nuova bolletta</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Nuova bolletta</DialogTitle></DialogHeader>
            <form action={createBill} className="space-y-4">
              <div><Label>Nome</Label><Input name="name" placeholder="Luce, Gas..." required /></div>
              <div><Label>Importo tipico (€)</Label><Input name="amount" type="number" step="0.01" /></div>
              <div><Label>Giorno di scadenza</Label><Input name="due_day" type="number" min="1" max="31" required /></div>
              <div><Label>Reminder (giorni prima)</Label><Input name="reminder_days_before" type="number" defaultValue="3" /></div>
              <Button type="submit" className="w-full">Salva</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {bills?.map(bill => {
          const daysUntil = bill.due_day - today
          const isUrgent = daysUntil >= 0 && daysUntil <= bill.reminder_days_before
          const isOverdue = daysUntil < 0

          return (
            <div key={bill.id}
              className={`flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border ${
                isOverdue ? 'border-red-300' : isUrgent ? 'border-amber-300' : 'border-gray-200 dark:border-gray-800'
              }`}>
              <div>
                <p className="font-medium">{bill.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {isOverdue && <Badge className="bg-red-100 text-red-700">Scaduta</Badge>}
                  {isUrgent && !isOverdue && <Badge className="bg-amber-100 text-amber-700">Entro {daysUntil}gg</Badge>}
                  <span className="text-xs text-gray-500">il giorno {bill.due_day} del mese</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {bill.amount && <span className="font-semibold">€{Number(bill.amount).toFixed(2)}</span>}
                <form action={markBillPaid.bind(null, bill.id, undefined)}>
                  <Button variant="outline" size="icon" className="text-green-600 border-green-300">
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </form>
                <form action={deleteBill.bind(null, bill.id)}>
                  <Button variant="ghost" size="icon" className="text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: gestione bollette con mark-as-paid e reminder visivo"
```

---

## FASE 4 — Conguaglio + Notifiche

### Task 13: Pagina conguaglio con export CSV

**Files:**
- Create: `src/app/(app)/conguaglio/page.tsx`
- Create: `src/app/api/export-csv/route.ts`

**Step 1: API export CSV**

```typescript
// src/app/api/export-csv/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') ??
    format(new Date(), 'yyyy-MM')
  const [year, m] = month.split('-')
  const start = `${year}-${m}-01`
  const end = new Date(Number(year), Number(m), 0).toISOString().split('T')[0]

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
    .eq('household_id', profile?.household_id)
    .gte('date', start).lte('date', end)
    .order('date')

  // Genera CSV
  const rows = [
    ['Data', 'Descrizione', 'Categoria', 'Tipo', 'Importo', 'Pagato da'].join(';'),
    ...(expenses ?? []).map(e => [
      e.date,
      e.description ?? '',
      e.category?.name ?? '',
      e.category?.split_type === 'personal' ? 'Personale' : 'Condivisa',
      Number(e.amount).toFixed(2).replace('.', ','),
      e.paid_by_profile?.full_name ?? '',
    ].join(';'))
  ]

  const csv = rows.join('\n')
  const monthLabel = format(new Date(`${year}-${m}-01`), 'MMMM_yyyy', { locale: it })

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pfin_${monthLabel}.csv"`,
    },
  })
}
```

**Step 2: Pagina conguaglio**

```typescript
// src/app/(app)/conguaglio/page.tsx
import { createClient } from '@/lib/supabase/server'
import { calculateReconciliation } from '@/lib/reconciliation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import Link from 'next/link'

export default async function ConguaglioPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user!.id).single()

  const month = searchParams.month ?? format(new Date(), 'yyyy-MM')
  const [year, m] = month.split('-')
  const start = `${year}-${m}-01`
  const end = new Date(Number(year), Number(m), 0).toISOString().split('T')[0]

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, category:categories(*)')
    .eq('household_id', profile?.household_id)
    .gte('date', start).lte('date', end)

  const { data: household } = await supabase
    .from('households')
    .select('*, pa:profiles!households_user_a_id_fkey(*), pb:profiles!households_user_b_id_fkey(*)')
    .eq('id', profile?.household_id).single()

  const userAName = (household as any)?.pa?.full_name ?? 'Utente A'
  const userBName = (household as any)?.pb?.full_name ?? 'Utente B'

  const rec = calculateReconciliation(
    expenses ?? [],
    household?.user_a_id ?? '',
    household?.user_b_id ?? '',
    userAName,
    userBName
  )

  // Raggruppa per categoria
  const byCategory = (expenses ?? []).reduce((acc, e) => {
    const catId = e.category_id
    const catName = e.category?.name ?? 'Altro'
    if (!acc[catId]) acc[catId] = { name: catName, icon: e.category?.icon ?? '📦', total: 0, splitType: e.category?.split_type }
    acc[catId].total += Number(e.amount)
    return acc
  }, {} as Record<string, { name: string; icon: string; total: number; splitType?: string }>)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conguaglio</h1>
          <p className="text-gray-500 capitalize">
            {format(new Date(`${year}-${m}-01`), 'MMMM yyyy', { locale: it })}
          </p>
        </div>
        <div className="flex gap-2">
          <input type="month" defaultValue={month}
            onChange={e => window.location.href = `/conguaglio?month=${e.target.value}`}
            className="border rounded-lg px-3 py-2 text-sm" />
          <Link href={`/api/export-csv?month=${month}`}>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
          </Link>
        </div>
      </div>

      {/* Riepilogo finale */}
      <Card className={`border-2 ${rec.amount > 0 ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">deve</p>
              <p className="text-xl font-bold">{rec.debtorName}</p>
            </div>
            <div className="text-indigo-600">
              <ArrowRight className="h-6 w-6" />
              <p className="text-2xl font-bold">€{rec.amount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">a</p>
              <p className="text-xl font-bold">{rec.creditorName}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dettaglio per categoria */}
      <Card>
        <CardHeader><CardTitle>Dettaglio per categoria</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Object.values(byCategory).map(cat => (
            <div key={cat.name} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span>{cat.icon}</span>
                <div>
                  <p className="font-medium text-sm">{cat.name}</p>
                  <p className="text-xs text-gray-500">
                    {cat.splitType === 'personal' ? '👤 Personale' : '🤝 Condivisa'}
                  </p>
                </div>
              </div>
              <span className="font-semibold">€{cat.total.toFixed(2)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: pagina conguaglio mensile + export CSV"
```

---

### Task 14: Edge Functions — reminder bollette + CSV mensile

**Files:**
- Create: `supabase/functions/bill-reminders/index.ts`
- Create: `supabase/functions/monthly-report/index.ts`

**Step 1: Edge Function reminder bollette**

```typescript
// supabase/functions/bill-reminders/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { format, addDays } from 'https://esm.sh/date-fns'
import { it } from 'https://esm.sh/date-fns/locale/it'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

Deno.serve(async () => {
  const today = new Date()
  const todayDay = today.getDate()

  // Recupera tutti gli households
  const { data: households } = await supabase.from('households').select('*, user_a:profiles!households_user_a_id_fkey(*), user_b:profiles!households_user_b_id_fkey(*)')

  for (const h of households ?? []) {
    const { data: bills } = await supabase
      .from('bills').select('*')
      .eq('household_id', h.id).eq('active', true)

    for (const bill of bills ?? []) {
      const daysUntil = bill.due_day - todayDay
      if (daysUntil === bill.reminder_days_before) {
        // Invia reminder a entrambi gli utenti
        const emails = [h.user_a?.email, h.user_b?.email].filter(Boolean)
        for (const email of emails) {
          await resend.emails.send({
            from: Deno.env.get('RESEND_FROM_EMAIL')!,
            to: email,
            subject: `⚡ Scadenza bolletta: ${bill.name} tra ${daysUntil} giorni`,
            html: `
              <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                <h2>⚡ Reminder bolletta</h2>
                <p>La bolletta <strong>${bill.name}</strong> scade tra <strong>${daysUntil} giorni</strong> (il ${bill.due_day} del mese).</p>
                ${bill.amount ? `<p>Importo tipico: <strong>€${Number(bill.amount).toFixed(2)}</strong></p>` : ''}
                <a href="${Deno.env.get('NEXT_PUBLIC_APP_URL')}/bollette"
                   style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
                  Gestisci bollette
                </a>
              </div>
            `,
          })
        }
      }
    }
  }

  return new Response('OK', { status: 200 })
})
```

**Step 2: Edge Function report mensile**

```typescript
// supabase/functions/monthly-report/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { format, startOfMonth, endOfMonth, subMonths } from 'https://esm.sh/date-fns'
import { it } from 'https://esm.sh/date-fns/locale/it'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

Deno.serve(async () => {
  // Esegue il 1° di ogni mese — manda report del mese precedente
  const lastMonth = subMonths(new Date(), 1)
  const start = format(startOfMonth(lastMonth), 'yyyy-MM-dd')
  const end = format(endOfMonth(lastMonth), 'yyyy-MM-dd')
  const monthLabel = format(lastMonth, 'MMMM yyyy', { locale: it })

  const { data: households } = await supabase
    .from('households')
    .select('*, user_a:profiles!households_user_a_id_fkey(*), user_b:profiles!households_user_b_id_fkey(*)')

  for (const h of households ?? []) {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, category:categories(*), paid_by_profile:profiles!expenses_paid_by_fkey(*)')
      .eq('household_id', h.id)
      .gte('date', start).lte('date', end)
      .order('date')

    if (!expenses?.length) continue

    // Genera CSV
    const rows = [
      ['Data', 'Descrizione', 'Categoria', 'Tipo', 'Importo', 'Pagato da'].join(';'),
      ...expenses.map(e => [
        e.date,
        e.description ?? '',
        e.category?.name ?? '',
        e.category?.split_type === 'personal' ? 'Personale' : 'Condivisa',
        Number(e.amount).toFixed(2).replace('.', ','),
        e.paid_by_profile?.full_name ?? '',
      ].join(';'))
    ]
    const csv = rows.join('\n')

    // Calcola totale
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

    const emails = [h.user_a?.email, h.user_b?.email].filter(Boolean)
    for (const email of emails) {
      await resend.emails.send({
        from: Deno.env.get('RESEND_FROM_EMAIL')!,
        to: email,
        subject: `📊 Report spese ${monthLabel}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2>📊 Report spese ${monthLabel}</h2>
            <p>Totale spese del mese: <strong>€${total.toFixed(2)}</strong></p>
            <p>In allegato trovi il dettaglio completo in formato CSV, importabile su Google Sheets.</p>
            <a href="${Deno.env.get('NEXT_PUBLIC_APP_URL')}/conguaglio"
               style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
              Vedi conguaglio
            </a>
          </div>
        `,
        attachments: [
          {
            filename: `pfin_${format(lastMonth, 'MMMM_yyyy', { locale: it })}.csv`,
            content: btoa(csv),
          }
        ],
      })
    }
  }

  return new Response('OK', { status: 200 })
})
```

**Step 3: Deploy edge functions**

```bash
supabase functions deploy bill-reminders
supabase functions deploy monthly-report
```

**Step 4: Configura cron jobs su Supabase**

Nel pannello Supabase → Database → Extensions → abilita `pg_cron`

```sql
-- Cron job: reminder bollette ogni giorno alle 9:00
select cron.schedule(
  'bill-reminders-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/bill-reminders',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);

-- Cron job: report mensile il 1° di ogni mese alle 8:00
select cron.schedule(
  'monthly-report',
  '0 8 1 * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/monthly-report',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

**Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: edge functions reminder bollette + report CSV mensile"
```

---

## FASE 5 — Polish

### Task 15: Mobile navigation + dark mode

**Files:**
- Create: `src/components/layout/mobile-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Nav mobile bottom bar**

```typescript
// src/components/layout/mobile-nav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Receipt, Zap, BarChart3, Tags } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/spese', label: 'Spese', icon: Receipt },
  { href: '/bollette', label: 'Bollette', icon: Zap },
  { href: '/conguaglio', label: 'Conguaglio', icon: BarChart3 },
  { href: '/categorie', label: 'Categorie', icon: Tags },
]

export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50">
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn(
              'flex-1 flex flex-col items-center py-2 text-xs gap-1',
              pathname === href
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 dark:text-gray-400'
            )}>
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
```

**Step 2: Aggiungi dark mode + Toaster**

```typescript
// src/app/layout.tsx - aggiungi ThemeProvider e Toaster
import { Toaster } from 'sonner'

// nel body:
// <Toaster richColors position="top-right" />
```

**Step 3: Commit finale**

```bash
git add src/
git commit -m "feat: mobile nav bottom bar + dark mode + toast notifications"
```

---

### Task 16: Deploy su Vercel

**Files:**
- Create: `vercel.json`

**Step 1: Crea progetto Vercel**

```bash
npm install -g vercel
vercel login
vercel
```

**Step 2: Configura variabili d'ambiente su Vercel**

Nel pannello Vercel → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL` → `https://your-app.vercel.app`

**Step 3: Aggiungi URL Vercel su Supabase**

Supabase → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/auth/callback`

**Step 4: Deploy**

```bash
vercel --prod
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: configurazione deploy Vercel"
```

---

## Checklist finale

- [ ] Google OAuth funziona per entrambi gli utenti
- [ ] Onboarding + invito partner via email funziona
- [ ] CRUD categorie con split configurabile
- [ ] Inserimento spese con OCR scontrino
- [ ] Spese ricorrenti con auto-creazione
- [ ] Gestione bollette con reminder visivo
- [ ] Dashboard con totali + grafico donut
- [ ] Pagina conguaglio con calcolo corretto
- [ ] Export CSV manuale funziona
- [ ] Reminder bollette via email (cron)
- [ ] Report mensile CSV via email (cron)
- [ ] Mobile navigation funziona
- [ ] Dark mode funziona
- [ ] Deploy Vercel funzionante
