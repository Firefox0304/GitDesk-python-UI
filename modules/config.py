"""設定檔：資料夾清單與 GitHub Token，存在 %APPDATA%\\GitDesk\\settings.json"""
import json
import os
from pathlib import Path

CFG_FILE = Path(os.getenv("APPDATA") or Path.home()) / "GitDesk" / "settings.json"
DEFAULTS = {"token": "", "repos": []}


def load():
    try:
        data = json.loads(CFG_FILE.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    return {**DEFAULTS, **data}


def save(cfg):
    CFG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CFG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
