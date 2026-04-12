import { KpiCardsSkeleton, PageHeaderSkeleton, SkeletonBox } from '../_components/page-skeleton'

export default function AnalyticsLoading() {
  return (
    <div>
      <PageHeaderSkeleton hasButton={false} />
      <KpiCardsSkeleton count={4} />
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonBox className="h-64 rounded-xl" />
        <SkeletonBox className="h-64 rounded-xl" />
      </div>
      <div className="mt-6">
        <SkeletonBox className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
