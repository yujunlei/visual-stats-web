#!/usr/bin/env python3
"""Optional professional modeling backend for Visual Stats Lab.

The desktop app calls this script through Electron IPC.  It prefers established
Python estimators when they are installed, and otherwise returns a clear error
so the renderer can fall back to the browser implementation.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter, defaultdict
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

Row = dict[str, str | float | int | None]


def number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def compact(value: Any) -> str:
    return str(value if value is not None else "").strip()


def summary_metric(label: str, value: str | int | float) -> dict[str, str | int | float]:
    return {"label": label, "value": value}


def output(result: dict[str, Any], logs: list[dict[str, str]]) -> None:
    print(json.dumps({"result": result, "logs": logs, "backend": "python"}, ensure_ascii=False))


def error(message: str) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(1)


def tokenize(text: str) -> list[str]:
    normalized = text.lower()
    tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_-]{2,}", normalized)
    expanded: list[str] = []
    stop_words = {"the", "and", "for", "with", "this", "that", "from", "数据", "进行", "通过", "一个", "可以"}
    for token in tokens:
        if token in stop_words:
            continue
        if re.fullmatch(r"[\u4e00-\u9fff]+", token) and len(token) > 4:
            expanded.extend(token[index : index + 2] for index in range(len(token) - 1))
        else:
            expanded.append(token)
    return [token for token in expanded if token not in stop_words]


def summarize_text(text: str, limit: int = 100) -> str:
    return text if len(text) <= limit else f"{text[:limit]}..."


def cosine_counter(left: Counter[str], right: Counter[str]) -> float:
    dot = sum(value * right.get(token, 0) for token, value in left.items())
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0
    return dot / (left_norm * right_norm)


def average_counters(vectors: list[Counter[str]]) -> Counter[str]:
    averaged: Counter[str] = Counter()
    if not vectors:
        return averaged
    for vector in vectors:
        for token, value in vector.items():
            averaged[token] += value / len(vectors)
    return averaged


def run_stdlib_topics(documents: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    tokenized = [tokenize(entry["text"]) for entry in documents]
    document_frequency: Counter[str] = Counter()
    for tokens in tokenized:
        document_frequency.update(set(tokens))
    vectors: list[Counter[str]] = []
    for tokens in tokenized:
        counts: Counter[str] = Counter(tokens)
        vector: Counter[str] = Counter()
        for token, count in counts.items():
            idf = math.log((len(documents) + 1) / (document_frequency[token] + 1)) + 1
            vector[token] = (count / max(len(tokens), 1)) * idf
        vectors.append(vector)

    topic_count = min(8, max(2, round(math.sqrt(len(documents)))))
    centroids = [
        vector.copy()
        for vector in sorted(vectors, key=lambda item: sum(item.values()), reverse=True)[:topic_count]
    ]
    assignments = [index % topic_count for index in range(len(vectors))]
    for _iteration in range(8):
        assignments = [
            max(range(topic_count), key=lambda topic: cosine_counter(vector, centroids[topic]))
            for vector in vectors
        ]
        centroids = [
            average_counters([vector for index, vector in enumerate(vectors) if assignments[index] == topic]) or centroids[topic]
            for topic in range(topic_count)
        ]

    topic_rows = []
    for topic in sorted(set(assignments)):
        indexes = [index for index, value in enumerate(assignments) if value == topic]
        term_scores: Counter[str] = Counter()
        for index in indexes:
            term_scores.update(vectors[index])
        representative_index = max(indexes, key=lambda index: cosine_counter(vectors[index], centroids[topic]))
        topic_rows.append(
            {
                "topic": topic + 1,
                "documents": len(indexes),
                "share": len(indexes) / len(documents),
                "keywords": ", ".join(token for token, _score in term_scores.most_common(10)),
                "representative": summarize_text(documents[representative_index]["text"]),
            }
        )
    document_rows = [
        {
            "document": documents[index]["document"],
            "topic": assignments[index] + 1,
            "score": cosine_counter(vectors[index], centroids[assignments[index]]),
            "text": summarize_text(documents[index]["text"]),
        }
        for index in range(min(len(documents), 200))
    ]
    return topic_rows, document_rows


def run_bertopic(payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    rows: list[Row] = payload["rows"]
    config = payload["config"]
    text_column = (config.get("features") or [""])[0]
    if not text_column:
        error("BERTopic 专业后端需要选择文本字段。")

    documents = [
        {"document": index + 1, "text": compact(row.get(text_column))}
        for index, row in enumerate(rows)
        if compact(row.get(text_column))
    ]
    if len(documents) < 3:
        error("BERTopic 至少需要 3 条非空文本。")

    try:
        from bertopic import BERTopic  # type: ignore

        model = BERTopic(language="multilingual", calculate_probabilities=False, verbose=False)
        topics, _ = model.fit_transform([entry["text"] for entry in documents])
        topic_ids = [topic_id for topic_id in sorted(set(topics)) if topic_id != -1]
        topic_rows = []
        for topic_id in topic_ids:
            doc_indexes = [index for index, topic in enumerate(topics) if topic == topic_id]
            words = model.get_topic(topic_id) or []
            keywords = ", ".join(str(word) for word, _score in words[:10])
            representative = documents[doc_indexes[0]]["text"] if doc_indexes else ""
            topic_rows.append(
                {
                    "topic": topic_id,
                    "documents": len(doc_indexes),
                    "share": len(doc_indexes) / len(documents),
                    "keywords": keywords,
                    "representative": summarize_text(representative),
                }
            )
        document_rows = [
            {
                "document": documents[index]["document"],
                "topic": topics[index],
                "score": 1,
                "text": summarize_text(documents[index]["text"]),
            }
            for index in range(min(len(documents), 200))
        ]
        estimator = "BERTopic Python"
        logs = [{"level": "info", "message": "已使用 Python BERTopic / sentence-transformers 专业后端。"}]
    except Exception as bertopic_error:
        try:
            from sklearn.cluster import MiniBatchKMeans  # type: ignore
            from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore

            corpus = [entry["text"] for entry in documents]
            has_cjk = any(re.search(r"[\u4e00-\u9fff]", text) for text in corpus)
            vectorizer = TfidfVectorizer(
                analyzer="char_wb" if has_cjk else "word",
                ngram_range=(2, 4) if has_cjk else (1, 2),
                max_features=6000,
                min_df=1,
            )
            matrix = vectorizer.fit_transform(corpus)
            topic_count = min(12, max(2, round(math.sqrt(len(documents)))))
            kmeans = MiniBatchKMeans(n_clusters=topic_count, random_state=42, n_init=10)
            assignments = kmeans.fit_predict(matrix)
            terms = vectorizer.get_feature_names_out()
            topic_rows = []
            for topic in sorted(set(int(value) for value in assignments)):
                doc_indexes = [index for index, value in enumerate(assignments) if int(value) == topic]
                center = kmeans.cluster_centers_[topic]
                top_terms = [terms[index] for index in center.argsort()[-10:][::-1]]
                representative_index = doc_indexes[0]
                topic_rows.append(
                    {
                        "topic": topic + 1,
                        "documents": len(doc_indexes),
                        "share": len(doc_indexes) / len(documents),
                        "keywords": ", ".join(top_terms),
                        "representative": summarize_text(documents[representative_index]["text"]),
                    }
                )
            document_rows = [
                {
                    "document": documents[index]["document"],
                    "topic": int(assignments[index]) + 1,
                    "score": 1,
                    "text": summarize_text(documents[index]["text"]),
                }
                for index in range(min(len(documents), 200))
            ]
            estimator = "scikit-learn TF-IDF + MiniBatchKMeans"
            logs = [
                {"level": "warning", "message": f"未能加载 BERTopic，已使用 scikit-learn 后端：{bertopic_error}"},
            ]
        except Exception as sklearn_error:
            topic_rows, document_rows = run_stdlib_topics(documents)
            estimator = "Python stdlib c-TF-IDF fallback"
            logs = [
                {"level": "warning", "message": f"未能加载 BERTopic / scikit-learn，已使用纯 Python 主题 fallback：{sklearn_error}"},
            ]

    result = {
        "id": "bertopic",
        "summary": [
            summary_metric("documents", len(documents)),
            summary_metric("topics", len(topic_rows)),
            summary_metric("text field", text_column),
            summary_metric("Estimator", estimator),
        ],
        "tables": [
            {"id": "topics", "title": "专业主题摘要", "columns": ["topic", "documents", "share", "keywords", "representative"], "rows": topic_rows},
            {"id": "documents", "title": "文档主题分配", "columns": ["document", "topic", "score", "text"], "rows": document_rows},
            {
                "id": "backend-provenance",
                "title": "后端能力说明",
                "columns": ["metric", "value"],
                "rows": [
                    {"metric": "backend", "value": estimator},
                    {"metric": "fallback", "value": "BERTopic -> scikit-learn"},
                ],
            },
        ],
        "diagnostics": [],
        "message": f"已通过 {estimator} 生成主题、关键词和文档主题分配。",
    }
    return result, logs


def get_param(config: dict[str, Any], key: str, default: Any = "") -> Any:
    return (config.get("params") or {}).get(key, default)


def row_standardize(matrix: list[list[float]]) -> list[list[float]]:
    standardized = []
    for row in matrix:
        total = sum(abs(value) for value in row)
        standardized.append([value / total if total else 0 for value in row])
    return standardized


def build_weights(rows: list[Row], config: dict[str, Any], clean_indexes: list[int]) -> tuple[list[list[float]], str]:
    spatial_key = compact(get_param(config, "spatialKey", (config.get("features") or [""])[0]))
    neighbor_key = compact(get_param(config, "neighborKey"))
    weight_field = compact(get_param(config, "weightField"))
    weights_param = get_param(config, "spatialWeights")
    active_rows = [rows[index] for index in clean_indexes]
    keys = [compact(row.get(spatial_key)) for row in active_rows]
    key_index = {key: index for index, key in enumerate(keys)}
    size = len(active_rows)
    matrix = [[0.0 for _ in range(size)] for _ in range(size)]

    if isinstance(weights_param, dict) and weights_param.get("matrix") and weights_param.get("nodes"):
        nodes = [compact(node) for node in weights_param["nodes"]]
        node_index = {node: index for index, node in enumerate(nodes)}
        source_matrix = weights_param["matrix"]
        for from_key, row_index in key_index.items():
            source_row = node_index.get(from_key)
            if source_row is None:
                continue
            for to_key, col_index in key_index.items():
                source_col = node_index.get(to_key)
                if source_col is not None:
                    matrix[row_index][col_index] = float(source_matrix[source_row][source_col] or 0)
        return row_standardize(matrix), f"独立空间权重矩阵 {weights_param.get('fileName', '')}"

    edges = weights_param.get("edges") if isinstance(weights_param, dict) else None
    if edges:
        for edge in edges:
            from_index = key_index.get(compact(edge.get("from")))
            to_index = key_index.get(compact(edge.get("to")))
            if from_index is not None and to_index is not None and from_index != to_index:
                matrix[from_index][to_index] += float(edge.get("weight") or 1)
        return row_standardize(matrix), f"独立空间权重边表 {weights_param.get('fileName', '')}"

    if neighbor_key and weight_field:
        for row in rows:
            from_index = key_index.get(compact(row.get(spatial_key)))
            to_index = key_index.get(compact(row.get(neighbor_key)))
            weight = number(row.get(weight_field)) or 0
            if from_index is not None and to_index is not None and from_index != to_index:
                matrix[from_index][to_index] += weight
        return row_standardize(matrix), f"数据表边表权重 {spatial_key}->{neighbor_key}"

    sortable = [(index, number(row.get(spatial_key))) for index, row in enumerate(active_rows)]
    sortable = [(index, value) for index, value in sortable if value is not None]
    if len(sortable) < 4:
        error("专业空间后端需要独立 W 文件、边表权重，或至少 4 个可排序空间键。")
    ordered = [index for index, _value in sorted(sortable, key=lambda item: item[1])]
    for position, row_index in enumerate(ordered):
        if position > 0:
            matrix[row_index][ordered[position - 1]] = 1
        if position < len(ordered) - 1:
            matrix[row_index][ordered[position + 1]] = 1
    return row_standardize(matrix), f"按 {spatial_key} 排序的邻近权重"


def clean_design(rows: list[Row], config: dict[str, Any]) -> tuple[list[int], list[float], list[list[float]], list[str]]:
    target = config.get("target") or ""
    params = config.get("params") or {}
    excluded = {
        target,
        compact(params.get("spatialKey")),
        compact(params.get("neighborKey")),
        compact(params.get("weightField")),
        compact(params.get("panelId")),
        compact(params.get("timeField")),
    }
    controls = [feature for feature in params.get("controls", []) if feature not in excluded]
    if not controls:
        controls = [feature for feature in config.get("features", []) if feature not in excluded]
    clean_indexes: list[int] = []
    y: list[float] = []
    x: list[list[float]] = []
    for index, row in enumerate(rows):
        target_value = number(row.get(target))
        values = [number(row.get(feature)) for feature in controls]
        if target_value is None or any(value is None for value in values):
            continue
        clean_indexes.append(index)
        y.append(target_value)
        x.append([float(value) for value in values if value is not None])
    if len(y) <= len(controls) + 2:
        error("专业空间后端可用观测不足，无法估计。")
    return clean_indexes, y, x, controls


def numpy_ols(y: list[float], x: list[list[float]]) -> tuple[list[float], list[float], list[float], float, float]:
    import numpy as np  # type: ignore

    y_arr = np.asarray(y, dtype=float).reshape(-1, 1)
    x_arr = np.asarray([[1.0, *row] for row in x], dtype=float)
    beta = np.linalg.pinv(x_arr.T @ x_arr) @ x_arr.T @ y_arr
    fitted = (x_arr @ beta).flatten()
    residuals = y_arr.flatten() - fitted
    sse = float((residuals**2).sum())
    sst = float(((y_arr.flatten() - y_arr.mean()) ** 2).sum())
    r2 = 0 if sst == 0 else 1 - sse / sst
    return beta.flatten().tolist(), fitted.tolist(), residuals.tolist(), sse, r2


def coefficient_rows(names: list[str], beta: list[float]) -> list[dict[str, float | str]]:
    return [
        {
            "term": name,
            "coefficient": value,
            "stdError": 0,
            "tValue": 0,
            "pValue": 0,
            "ciLow": value,
            "ciHigh": value,
        }
        for name, value in zip(names, beta)
    ]


def run_spatial(payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    model_id: str = payload["modelId"]
    rows: list[Row] = payload["rows"]
    config = payload["config"]
    clean_indexes, y, x, controls = clean_design(rows, config)
    weights, weight_label = build_weights(rows, config, clean_indexes)
    kind = model_id.replace("spatial-", "")
    estimator = "PySAL spreg"
    logs = [{"level": "info", "message": "已进入 Python 空间计量专业后端。"}]

    try:
        import numpy as np  # type: ignore
        from libpysal.weights import W  # type: ignore
        from spreg import ML_Error, ML_Lag, OLS  # type: ignore

        neighbors = {index: [col for col, value in enumerate(row) if value] for index, row in enumerate(weights)}
        w_values = {index: [value for value in row if value] for index, row in enumerate(weights)}
        w = W(neighbors, w_values)
        w.transform = "r"
        y_arr = np.asarray(y, dtype=float).reshape(-1, 1)
        x_arr = np.asarray(x, dtype=float)
        if kind in {"sar", "sdm"}:
            model = ML_Lag(y_arr, x_arr, w=w, name_y=config.get("target"), name_x=controls)
        elif kind in {"sem", "sdem"}:
            model = ML_Error(y_arr, x_arr, w=w, name_y=config.get("target"), name_x=controls)
        else:
            model = OLS(y_arr, x_arr, w=w, name_y=config.get("target"), name_x=controls)

        beta = [float(value) for value in np.asarray(model.betas).flatten()]
        names = list(getattr(model, "name_x", ["_cons", *controls]))
        if len(names) < len(beta):
            names = [*names, *[f"spatial_{index}" for index in range(len(beta) - len(names))]]
        rows_out = []
        z_stats = list(getattr(model, "z_stat", []))
        for index, value in enumerate(beta):
            stat = z_stats[index] if index < len(z_stats) else (0, 0)
            rows_out.append(
                {
                    "term": names[index] if index < len(names) else f"x{index}",
                    "coefficient": value,
                    "stdError": 0,
                    "tValue": float(stat[0] or 0),
                    "pValue": float(stat[1] or 0),
                    "ciLow": value,
                    "ciHigh": value,
                }
            )
        fitted = [float(value) for value in np.asarray(getattr(model, "predy", np.zeros_like(y_arr))).flatten()]
        residuals = [float(value) for value in np.asarray(getattr(model, "u", y_arr.flatten() - fitted)).flatten()]
        r2 = float(getattr(model, "pr2", getattr(model, "r2", 0)) or 0)
        log_likelihood = float(getattr(model, "logll", 0) or 0)
    except Exception as spreg_error:
        try:
            import numpy as np  # type: ignore

            wy = (np.asarray(weights) @ np.asarray(y).reshape(-1, 1)).flatten().tolist()
            has_wy = kind in {"sar", "sdm", "sac", "gns", "panel-sdm", "logit"}
            augmented = [[wy[index], *row] if has_wy else row for index, row in enumerate(x)]
            beta, fitted, residuals, _sse, r2 = numpy_ols(y, augmented)
            names = ["_cons", *(["rho_Wy", *controls] if has_wy else controls)]
            rows_out = coefficient_rows(names, beta)
            log_likelihood = 0
            estimator = "NumPy spatial fallback"
            logs.append({"level": "warning", "message": f"PySAL spreg 不可用，已降级为 NumPy 空间滞后近似：{spreg_error}"})
        except Exception as numpy_error:
            error(f"专业空间计量依赖不可用。请安装 numpy、libpysal、spreg。详细信息：{numpy_error}")

    result = {
        "id": model_id,
        "summary": [
            summary_metric("Number of obs", len(y)),
            summary_metric("Estimator", estimator),
            summary_metric("Weight matrix", weight_label),
            summary_metric("R-squared", r2),
            summary_metric("Log likelihood", log_likelihood),
        ],
        "tables": [
            {
                "id": "backend-provenance",
                "title": "专业后端与空间权重",
                "columns": ["metric", "value"],
                "rows": [
                    {"metric": "backend", "value": estimator},
                    {"metric": "weights", "value": weight_label},
                    {"metric": "controls", "value": ", ".join(controls)},
                ],
            },
            {
                "id": "coefficients",
                "title": "专业空间计量系数估计",
                "columns": ["term", "coefficient", "stdError", "tValue", "pValue", "ciLow", "ciHigh"],
                "rows": rows_out,
            },
        ],
        "diagnostics": [
            {
                "id": f"{model_id}-actual-vs-fitted",
                "title": "专业空间模型拟合诊断",
                "kind": "actual-vs-fitted",
                "actual": y,
                "fitted": fitted,
            }
        ],
        "warnings": [entry["message"] for entry in logs if entry["level"] == "warning"],
        "message": f"已通过 {estimator} 完成空间计量估计；权重来源：{weight_label}。",
    }
    return result, logs


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
        model_id = payload.get("modelId", "")
        if model_id == "bertopic":
            result, logs = run_bertopic(payload)
        elif model_id.startswith("spatial-"):
            result, logs = run_spatial(payload)
        else:
            error(f"专业后端暂不支持模型：{model_id}")
        output(result, logs)
    except SystemExit:
        raise
    except Exception as exc:
        error(str(exc))


if __name__ == "__main__":
    main()
