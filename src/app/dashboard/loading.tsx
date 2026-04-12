import { KpiCardsSkeleton, TableSkeleton, PageHeaderSkeleton } from './_components/page-skeleton'

export default function DashboardLoading() {
  return (
    <div>
      <PageHeaderSkeleton hasButton={false} />
      <KpiCardsSkeleton count={4} />
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TableSkeleton rows={6} cols={3} />
        <TableSkeleton rows={6} cols={3} />
      </div>
    </div>
  )
}
