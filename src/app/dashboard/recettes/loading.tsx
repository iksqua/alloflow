import { TableSkeleton, PageHeaderSkeleton } from '../_components/page-skeleton'

export default function RecettesLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} cols={4} />
    </div>
  )
}
