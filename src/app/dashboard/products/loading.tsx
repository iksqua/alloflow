import { TableSkeleton, PageHeaderSkeleton } from '../_components/page-skeleton'

export default function ProductsLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <TableSkeleton rows={10} cols={5} />
    </div>
  )
}
