'use client'

import { PageContainer, PageHeader } from '@/components/erp/page-header'

// Placeholder — implemented in a follow-up change.
export function MyPaymentsPage({ participantId, participantName }: { participantId: string | null; participantName: string | null }) {
  void participantId
  return (
    <PageContainer>
      <PageHeader title="Мои оплаты" description={participantName ?? 'Раздел в разработке'} />
    </PageContainer>
  )
}
