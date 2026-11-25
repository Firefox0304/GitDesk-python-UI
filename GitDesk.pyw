"""GitDesk - 簡易 GitHub 管理兼推送工具（Python + pywebview）"""
from pathlib import Path

import webview

from modules.api import Api

ROOT = Path(__file__).resolve().parent


def main():
    api = Api()
    webview.create_window(
        "GitDesk",
        str(ROOT / "web" / "index.html"),
        js_api=api,
        width=1100, height=720, min_size=(820, 560),
        background_color="#121826",
    )
    webview.start()
    api._term.stop()  # 關閉視窗時一併結束終端機程序


if __name__ == "__main__":
    main()
