/** Server-only: the private Storage bucket that holds report files. */
import { supabaseAdmin } from '@/lib/supabase-client'
import { ALLOWED_TYPES, MAX_FILE_BYTES, REPORT_BUCKET, decodeName, isReportKey, type ReportFile } from '@/lib/report-files'

let bucketReady = false

/** The bucket is private; it is created on first use so no setup step is needed. */
export async function ensureBucket() {
  if (bucketReady) return
  const { data } = await supabaseAdmin.storage.getBucket(REPORT_BUCKET)
  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(REPORT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_BYTES,
      allowedMimeTypes: Object.keys(ALLOWED_TYPES),
    })
    // A parallel request may have created it a moment ago.
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Хранилище файлов недоступно: ${error.message}`)
  }
  bucketReady = true
}

export async function listFiles(assignmentId: string): Promise<ReportFile[]> {
  const { data, error } = await supabaseAdmin.storage.from(REPORT_BUCKET).list(assignmentId, { limit: 100, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(f => isReportKey(f.name))
    .map(f => ({ key: f.name, name: decodeName(f.name), size: Number((f.metadata as { size?: number } | null)?.size ?? 0) }))
}

/** Files on a report; 0 when Storage cannot be reached, so a report without files is never blocked by it. */
export async function countFiles(assignmentId: string): Promise<number> {
  try {
    return (await listFiles(assignmentId)).length
  } catch {
    return 0
  }
}
