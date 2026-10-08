'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/cn'
import type { NavGroup } from '@/lib/nav'
import { Logo } from './Logo'

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, Icons.LucideIcon>)[name]
  if (!Cmp) return null
  return <Cmp className={className} strokeWidth={1.75} aria-hidden />
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] md:flex',
        'transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      <div className="flex h-16 items-center justify-between gap-2 px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center">
          {collapsed ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              BC
            </span>
          ) : (
            <Logo className="h-9 w-auto" />
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-md p-1.5 text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Icons.ChevronsLeft
            className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>

      <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className="mb-4">
            {group.title && !collapsed && (
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? // brand-700 fill: white label text needs 4.5:1
                            'bg-brand-700 text-white'
                          : 'text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong',
                      )}
                    >
                      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
