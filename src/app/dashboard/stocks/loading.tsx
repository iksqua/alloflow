import { TableSkeleton, PageHeaderSkeleton, SkeletonBox } from '../_components/page-skeleton'

export default function StocksLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {['Stocks', 'Alertes', 'Mouvements'].map((t) => (
          <SkeletonBox key={t} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <TableSkeleton rows={10} cols={5} />
    </div>
  )
}
