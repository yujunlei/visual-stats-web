import type { ModelResultTable } from '../types'
import type { OlsFit } from './regression'
import { computeMoransI, computeSpatialImpacts, type SpatialMlFit } from './spatialEstimators'
import type { SpatialModelKind } from './spatialContext'

const impactColumns = ['variable', 'directEffect', 'indirectEffect', 'totalEffect', 'spilloverShare']
const moranColumns = ['metric', 'value']

export const isSpatialMlFit = (fit: OlsFit | SpatialMlFit): fit is SpatialMlFit => 'logLikelihood' in fit

export const spatialCoefficientValue = (fit: OlsFit | SpatialMlFit, term: string) =>
  fit.coefficients.find((coefficient) => coefficient.term === term)?.coefficient ?? 0

export const spatialPostEstimationTables = (
  kind: SpatialModelKind,
  fit: OlsFit | SpatialMlFit,
  weights: number[][],
  controls: string[],
  wx: string[],
): ModelResultTable[] => {
  const rho = isSpatialMlFit(fit) ? fit.rho : undefined
  const effects = controls.map((variable, index) => ({
    variable,
    beta: spatialCoefficientValue(fit, variable),
    theta: wx[index] ? spatialCoefficientValue(fit, wx[index]) : 0,
  }))
  const impactRows = effects.length > 0 ? computeSpatialImpacts(weights, rho, effects) : []
  const moran = computeMoransI(weights, fit.residuals)

  return [
    ...(impactRows.length > 0 && ['sar', 'slx', 'sdm', 'sdem', 'sac', 'gns', 'panel-sdm', 'spatial-logit'].includes(kind)
      ? [
          {
            id: 'spatial-impacts',
            title: '空间效应分解',
            columns: impactColumns,
            rows: impactRows,
          },
        ]
      : []),
    ...(moran
      ? [
          {
            id: 'residual-moran',
            title: '残差空间自相关诊断',
            columns: moranColumns,
            rows: [
              { metric: "Moran's I", value: moran.moransI },
              { metric: 'Expected I', value: moran.expectedI },
              { metric: 'Observations', value: moran.observations },
              { metric: 'Weight sum', value: moran.weightSum },
            ],
          },
        ]
      : []),
  ]
}
