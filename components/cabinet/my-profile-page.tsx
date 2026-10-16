'use client'

import { MessageCircleQuestion } from 'lucide-react'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { ProfileEditor } from '@/components/profile/profile-editor'

/** The participant's own profile: personal data, passport, business and the year-by-year dynamics. */
export function MyProfilePage({ participantId }: { participantId: string | null }) {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Мой профиль" description="Личные данные, паспорт и цифры вашего бизнеса по годам" />
      {participantId ? (
        <ProfileEditor participantId={participantId} variant="self" />
      ) : (
        <Panel>
          <EmptyState icon={MessageCircleQuestion} title="Профиль участника не подключён" description="Попросите администратора привязать ваш вход к карточке участника." />
        </Panel>
      )}
    </PageContainer>
  )
}
