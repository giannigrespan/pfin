'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Receipt, Tags, Repeat,
  Zap, BarChart3,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/spese', label: 'Spese', icon: Receipt },
  { href: '/ricorrenti', label: 'Ricorrenti', icon: Repeat },
  { href: '/bollette', label: 'Bollette', icon: Zap },
  { href: '/categorie', label: 'Categorie', icon: Tags },
  { href: '/conguaglio', label: 'Conguaglio', icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex flex-col w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 shrink-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xl font-bold flex items-center gap-2">
          💰 <span>PFin</span>
        </span>
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
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <p className="text-xs text-gray-400 text-center">PFin v1.0</p>
      </div>
    </aside>
  )
}
