import type { ModelResultTable } from '../../models/types'
import { Table } from 'lucide-react'
import { columnLabels, formatResultValue } from './resultFormat'

type ResultTablesProps = {
  secondaryResultTables: ModelResultTable[]
}

export function ResultTables({ secondaryResultTables }: ResultTablesProps) {
  return (
    <section className="result-tables result-tables--secondary">
      <div className="paper-section-heading paper-section-heading--compact">
        <span className="paper-section-heading__index">三</span>
        <div>
          <strong>稳健性 / 附加结果</strong>
          <small>Additional result tables</small>
        </div>
      </div>

      {secondaryResultTables.length > 0 ? (
        <div className="result-secondary-tables">
          {secondaryResultTables.map((table) => (
            <div className="coef-table is-secondary" key={table.id}>
              <div className="table-caption">
                {table.title}
                <span>{table.rows.length} 行</span>
              </div>
              <div
                className="coef-table__head"
                style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(${table.columns.length > 8 ? 50 : 0}px, 1fr))` }}
              >
                {table.columns.map((column) => (
                  <span key={column}>{columnLabels[column] ?? column}</span>
                ))}
              </div>
              {table.rows.map((row, rowIndex) => (
                <div
                  className="coef-table__row"
                  key={`${row.term ?? row.variable ?? row.source ?? row.model ?? rowIndex}`}
                  style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(${table.columns.length > 8 ? 50 : 0}px, 1fr))` }}
                >
                  {table.columns.map((column, columnIndex) => (
                    <span className={columnIndex === 0 ? 'coef-table__term' : ''} key={column}>
                      {formatResultValue(row[column] ?? '', column)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-diagnostic">
          <Table size={18} />
          当前结果没有附加表格。
        </div>
      )}
    </section>
  )
}
