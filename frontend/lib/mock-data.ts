export interface KPI {
  label: string
  value: string
  sub: string
}

export interface TableRow {
  cells: string[]
}

// Existing response contract retained while runtime data is supplied by real sources.
export interface MockResponse {
  summary: string
  kpis: KPI[]
  chartTitle: string
  chartBars: Array<{ label: string; value: number; color?: string }>
  tableHeaders: string[]
  tableRows: TableRow[]
  sql: string
  followUps: string[]
  rowCount: number
  resultType: string
  rows?: any[]
  executionError?: string
  errorType?: string
  generatedSql?: string
  source?: string
  suggestedFixes?: string[]
  result_intent?: any
  rendering?: any
  requestId?: string
}
