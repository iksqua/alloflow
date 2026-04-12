import { TableSkeleton, PageHeaderSkeleton, KpiCardsSkeleton } from '../_components/page-skeleton'

export default function FiscalLoading() {
  return (
    <div>
      <PageHeaderSkeleton hasButton={false} />
      <KpiCardsSkeleton count={3} />
      <div className="mt-4">
        <TableSkeleton rows={10} cols={5} />
      </div>
    </div>
  )
}
