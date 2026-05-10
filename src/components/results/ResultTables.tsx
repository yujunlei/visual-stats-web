import type { ModelResult, ModelResultTable } from '../../models/types'
import { Table } from 'lucide-react'
import { columnLabels, formatResultValue } from './resultFormat'

type ResultTablesProps = {
  result: ModelResult | null
  mainResultTable: ModelResultTable | null
  secondaryResultTables: ModelResultTable[]
}

export function ResultTables({ result, mainResultTable, secondaryResultTables }: ResultTablesProps) {
  return (
    <section className="result-tables">
      {result ? <div className="result-tables__label">统计表格</div> : null}
      {result ? (
        <div className="paper-section-heading paper-section-heading--compact">
          <span className="paper-section-heading__index">三</span>
          <div>
            <strong>系数估计</strong>
            <small>Coefficient estimates</small>
          </div>
        </div>
      ) : null}
      {mainResultTable ? (
        <div className="coef-table is-primary" key={mainResultTable.id}>
          <div className="table-caption">{mainResultTable.title}</div>
          <div
            className="coef-table__head"
            style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
          >
            {mainResultTable.columns.map((column) => (
              <span key={column}>{columnLabels[column] ?? column}</span>
            ))}
          </div>
          {mainResultTable.rows.map((row, rowIndex) => (
            <div
              className="coef-table__row"
              key={`${row.term ?? row.variable ?? row.source ?? rowIndex}`}
              style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
            >
              {mainResultTable.columns.map((column, columnIndex) => (
                <span className={columnIndex === 0 ? 'coef-table__term' : ''} key={column}>
                  {formatResultValue(row[column] ?? '', column)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {mainResultTable ? (
        <blockquote className="paper-quote-note paper-quote-note--compact">
          <p>"本表优先用于判断变量方向、显著性和区间范围；若用于正式写作，请同步报告模型摘要与估计设定。"</p>
          <cite>表注说明</cite>
        </blockquote>
      ) : null}
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
      ) : null}
      {!result ? (
        <div className="empty-diagnostic">
          <Table size={18} />
          运行模型后展示回归结果。
        </div>
      ) : null}
    </section>
  )
}
