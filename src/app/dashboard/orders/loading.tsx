import { TableSkeleton, PageHeaderSkeleton, KpiCardsSkeleton } from '../_components/page-skeleton'

export default function OrdersLoading() {
  return (
    <div>
      <PageHeaderSkeleton hasButton={false} />
      <KpiCardsSkeleton count={3} />
      <div className="mt-4">
        <TableSkeleton rows={12} cols={6} />
      </div>
    </div>
  )
}
