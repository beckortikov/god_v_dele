'use client'

import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ProfileEditor } from '@/components/profile/profile-editor'
import type { Participant } from '@/components/participants/types'

/** Profile of any participant for an administrator or wheels manager. */
export function ParticipantProfileSheet({ open, onOpenChange, participant }: { open: boolean; onOpenChange: (o: boolean) => void; participant: Participant | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[760px]">
        <SheetHeader>
          <SheetTitle>Профиль и документы</SheetTitle>
          <SheetDescription>{participant?.name}</SheetDescription>
        </SheetHeader>
        <SheetBody>{open && participant && <ProfileEditor key={participant.id} participantId={participant.id} variant="staff" />}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}
