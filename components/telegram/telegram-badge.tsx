'use client'

import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { telegramDisplayName, type TelegramLinkSummary } from '@/lib/telegram'

export { useTelegramLinks } from '@/components/telegram/use-telegram'

/**
 * Tiny Telegram status for table rows. Pass the participant's link from
 * `useTelegramLinks().get(id)`; `null` means not linked.
 *
 * - `compact` (default): an icon only, with the details in a tooltip.
 *   Not linked renders a muted icon, so the column stays aligned.
 * - `compact={false}`: a badge with text.
 */
export function TelegramBadge({
  link,
  compact = true,
  className,
}: {
  link: TelegramLinkSummary | null | undefined
  compact?: boolean
  className?: string
}) {
  const linked = !!link
  const title = link
    ? `Telegram: ${telegramDisplayName(link)} · ${link.phoneVerified ? 'телефон подтверждён' : 'телефон не подтверждён'}`
    : 'Telegram не привязан'

  if (!compact) {
    return (
      <Badge variant={linked ? (link.phoneVerified ? 'success' : 'warning') : 'secondary'} className={className} title={title}>
        <Send /> {linked ? 'Telegram' : 'Нет Telegram'}
      </Badge>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={title}
          className={cn(
            'inline-flex size-5 items-center justify-center rounded-md',
            linked ? (link.phoneVerified ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning') : 'text-muted-foreground',
            className
          )}
        >
          <Send className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
