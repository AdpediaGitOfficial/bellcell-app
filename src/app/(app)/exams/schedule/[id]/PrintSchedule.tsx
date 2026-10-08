'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function PrintSchedule() {
  return (
    <Button size="sm" variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      Print
    </Button>
  )
}
