import type { ReactNode } from 'react';

export interface Column {
  label: string;
  /** Amounts and counts: aligned to the end on wide screens. */
  numeric?: boolean;
}

/**
 * A table of the reserved area. On wide screens it scrolls sideways inside a labelled region
 * that the keyboard can reach; on phones the styles turn every row into a card where each cell
 * shows its column name. The roles are written out because the card layout changes `display`,
 * and some browsers then stop treating the markup as a table.
 */
export function DataTable({ label, columns, children }: { label: string; columns: Column[]; children: ReactNode }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.label} scope="col" role="columnheader" className={column.numeric ? 'num' : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <tr role="row" id={id} className={className}>
      {children}
    </tr>
  );
}

/** First cell of a row when it names the row: on phones it becomes the title of the card. */
export function RowHead({ children }: { children: ReactNode }) {
  return (
    <th scope="row" role="rowheader">
      {children}
    </th>
  );
}

/** A cell that carries the name of its column, shown before the value on phones. */
export function Cell({ label, numeric = false, children }: { label: string; numeric?: boolean; children?: ReactNode }) {
  return (
    <td role="cell" data-label={label} className={numeric ? 'num' : undefined}>
      {children}
    </td>
  );
}
