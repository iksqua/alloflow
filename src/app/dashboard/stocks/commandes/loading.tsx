import { TableSkeleton, PageHeaderSkeleton, KpiCardsSkeleton, SkeletonBox } from '../../_components/page-skeleton'

export default function CommandesLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={3} />
      {/* Status filter tabs */}
      <div className="flex gap-2 my-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBox key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}
