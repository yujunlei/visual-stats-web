# Professional Backend

Visual Stats Lab desktop can call this optional Python backend for models that
benefit from specialist estimators.

## Supported models

- BERTopic: prefers `bertopic` with sentence-transformers / UMAP / HDBSCAN.
- Spatial econometrics: prefers PySAL `libpysal` + `spreg`.

If the Python dependencies are unavailable, the app falls back to browser
estimators and writes the reason into the model run log.

## Install dependencies

```bash
python -m pip install -r backend/requirements.txt
```

For Windows packaging, either require users to install Python dependencies
separately, or bundle a managed Python runtime in a later release.
