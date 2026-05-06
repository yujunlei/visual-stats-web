#!/usr/bin/env python3
"""Install optional professional backend dependencies on demand."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
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


def model_family(model_id: str) -> str:
    if model_id == "bertopic":
        return "bertopic"
    if model_id.startswith("spatial-"):
        return "spatial"
    return "generic"


def has_package(package: str) -> bool:
    return importlib.util.find_spec(PACKAGE_MODULES[package]) is not None


def install_packages(packages: list[str]) -> dict[str, Any]:
    if not packages:
        return {
            "success": True,
            "message": "依赖已经满足，无需安装。",
            "installed": [],
            "stdout": "",
            "stderr": "",
        }

    command = [sys.executable, "-m", "pip", "install", "--prefer-binary", *packages]
    env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
        "PIP_DISABLE_PIP_VERSION_CHECK": "1",
    }
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=900,
        check=False,
        env=env,
    )
    missing_after = [package for package in packages if not has_package(package)]
    success = completed.returncode == 0 and not missing_after
    return {
        "success": success,
        "message": "依赖安装完成，并已通过 import 验证。" if success else "安装流程结束，但仍有依赖不可用。请查看缺失项和安装日志。",
        "installed": [package for package in packages if package not in missing_after],
        "missingAfterInstall": missing_after,
        "stdout": completed.stdout[-6000:],
        "stderr": completed.stderr[-6000:],
        "command": " ".join(command),
        "returnCode": completed.returncode,
    }


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    model_id = str(payload.get("modelId") or "")
    scope = str(payload.get("scope") or "professional")
    if sys.version_info < (3, 10):
        print(
            json.dumps(
                {
                    "success": False,
                    "message": f"当前 Python {sys.version.split()[0]} 版本不足。请先安装或修复 Python 3.10+，再安装专业依赖。",
                    "installed": [],
                    "stdout": "",
                    "stderr": "",
                    "missingAfterInstall": [],
                    "python": sys.executable,
                },
                ensure_ascii=False,
            )
        )
        return

    family = model_family(model_id)
    requirements = MODEL_REQUIREMENTS.get(family)
    if not requirements:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": f"暂不支持为模型 {model_id} 安装专业依赖。",
                    "installed": [],
                    "stdout": "",
                    "stderr": "",
                },
                ensure_ascii=False,
            )
        )
        return

    requested = requirements["professional" if scope == "professional" else "lightweight"]
    missing = [package for package in requested if not has_package(package)]
    result = install_packages(missing)
    result.update(
        {
            "modelId": model_id,
            "family": family,
            "scope": scope,
            "requested": requested,
            "missingBeforeInstall": missing,
            "python": sys.executable,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
