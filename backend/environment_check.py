#!/usr/bin/env python3
"""Environment probe for optional professional model backends."""

from __future__ import annotations

import importlib.util
import json
import platform
import sys
from datetime import datetime, timezone
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


PACKAGE_MODULES: dict[str, str] = {
    "bertopic": "bertopic",
    "sentence-transformers": "sentence_transformers",
    "umap-learn": "umap",
    "hdbscan": "hdbscan",
    "scikit-learn": "sklearn",
    "numpy": "numpy",
    "libpysal": "libpysal",
    "spreg": "spreg",
}

MODEL_REQUIREMENTS: dict[str, dict[str, list[str]]] = {
    "bertopic": {
        "professional": ["bertopic", "sentence-transformers", "umap-learn", "hdbscan"],
        "lightweight": ["scikit-learn"],
    },
    "spatial": {
        "professional": ["numpy", "libpysal", "spreg"],
        "lightweight": ["numpy"],
    },
}


def has_package(package: str) -> bool:
    module = PACKAGE_MODULES[package]
    return importlib.util.find_spec(module) is not None


def model_family(model_id: str) -> str:
    if model_id == "bertopic":
        return "bertopic"
    if model_id.startswith("spatial-"):
        return "spatial"
    return "generic"


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    model_id = str(payload.get("modelId") or "")
    family = model_family(model_id)
    requirements = MODEL_REQUIREMENTS.get(family, {"professional": [], "lightweight": []})
    checked_packages = sorted(set(requirements["professional"] + requirements["lightweight"]))
    packages = {package: has_package(package) for package in checked_packages}
    missing_professional = [package for package in requirements["professional"] if not packages.get(package)]
    missing_lightweight = [package for package in requirements["lightweight"] if not packages.get(package)]
    python_version = platform.python_version()
    python_ok = sys.version_info >= (3, 10)
    professional_ready = python_ok and len(missing_professional) == 0
    lightweight_ready = python_ok and len(missing_lightweight) == 0

    if professional_ready:
        status = "ready"
        active_backend = "professional"
        message = "专业后端已就绪。"
    elif lightweight_ready:
        status = "partial"
        active_backend = "lightweight"
        message = "可使用轻量 Python 后端，完整专业依赖尚未安装。"
    elif python_ok:
        status = "fallback"
        active_backend = "python-fallback"
        message = "Python 可用，但专业依赖缺失；将使用内置降级路径或浏览器估计。"
    else:
        status = "missing"
        active_backend = "browser"
        message = "Python 版本不足，专业后端不可用。"

    result: dict[str, Any] = {
        "modelId": model_id,
        "family": family,
        "status": status,
        "activeBackend": active_backend,
        "message": message,
        "python": {
            "available": True,
            "path": sys.executable,
            "version": python_version,
            "ok": python_ok,
        },
        "packages": packages,
        "missingProfessional": missing_professional,
        "missingLightweight": missing_lightweight,
        "professionalReady": professional_ready,
        "lightweightReady": lightweight_ready,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
