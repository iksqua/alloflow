import { TableSkeleton, PageHeaderSkeleton, KpiCardsSkeleton } from '../_components/page-skeleton'

export default function CrmLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={3} />
      <div className="mt-4">
        <TableSkeleton rows={10} cols={5} />
      </div>
    </div>
  )
}
