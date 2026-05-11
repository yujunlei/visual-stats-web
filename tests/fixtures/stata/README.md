# Stata parity fixtures

This directory stores golden fixtures for Stata-compatible fixed-effect models.

Each JSON file should contain:

- `stataCommand`: the exact Stata or reghdfe command used as the oracle.
- `rows`: the input data used by both Stata and the TypeScript implementation.
- `config`: the Visual Stats model config.
- `inference`: optional standard-error config.
- `expected`: Stata/reghdfe output values to compare.

Current fixtures are small deterministic parity scaffolds. Replace or extend their
`expected` values with exported Stata/reghdfe log/csv values when available.
