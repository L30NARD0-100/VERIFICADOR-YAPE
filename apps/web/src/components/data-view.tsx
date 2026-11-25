import type { ReactNode } from 'react'
import { Empty, ErrorNotice, Loading, Pagination } from './common'

type Result<T> = { isPending: boolean; isError: boolean; error: unknown; data?: T; refetch: () => unknown }
export function DataView<T>({ result, children }: { result: Result<T>; children: (data: T) => ReactNode }) {
  if (result.isPending) return <Loading />
  if (result.isError) return <ErrorNotice error={result.error} retry={result.refetch} />
  return result.data === undefined ? null : children(result.data)
}

type PageResult<T> = Result<{ data: T[] }> & { pagination: Parameters<typeof Pagination>[0] }
export function TablePage<T>({ result, empty, children }: {
  result: PageResult<T>; empty?: string; children: (rows: T[]) => ReactNode
}) {
  return <div className="surface">
    <DataView result={result}>{({ data }) => data.length ? children(data) : <Empty title={empty} />}</DataView>
    <Pagination {...result.pagination} />
  </div>
}

export function Table({ columns, children }: { columns: string[]; children: ReactNode }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla desplazable">
    <table><thead><tr>{columns.map((column) => <th key={column} scope="col">{column || <span className="sr-only">Acciones</span>}</th>)}</tr></thead>
      <tbody>{children}</tbody></table>
  </div>
}
