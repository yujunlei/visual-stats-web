/**
 * ResultLeadConclusion - extracted from ResultReadingPanel
 * Displays the natural-language core conclusion and secondary insights.
 * No business logic; purely presentational.
 */

type ResultLeadConclusionProps = {
  leadInsight: string
  secondaryInsights: string[]
}

export function ResultLeadConclusion(props: ResultLeadConclusionProps) {
  const { leadInsight, secondaryInsights } = props

  return (
    <section className="result-primary-summary">
      <div className="paper-section-heading">
        <span className="paper-section-heading__index">一</span>
        <div>
          <strong>核心结论</strong>
          <small>Natural-language findings</small>
        </div>
      </div>
      <section className="lead-conclusion-card">
        <p className="lead-conclusion-card__lead">{leadInsight || '模型已完成运行，可以开始阅读结果。'}</p>
        {secondaryInsights.length > 0 ? (
          <div className="lead-conclusion-card__notes">
            {secondaryInsights.map((insight) => (
              <p key={insight}>{insight}</p>
            ))}
          </div>
        ) : null}
      </section>
      <div className="result-insights result-insights--quiet">
        <strong>阅读提示</strong>
        <p>先阅读核心结论，再结合下方系数表判断方向、显著性和区间，最后查看附加结果。</p>
      </div>
    </section>
  )
}
