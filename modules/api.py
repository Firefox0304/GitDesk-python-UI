"""提供給前端 JS 呼叫的 API（js_api）。所有方法回傳 {ok, data} 或 {ok: False, error}。"""
import os
from functools import wraps
from pathlib import Path

import requests
import webview

from . import config, fs, git_ops as git, github
from .git_ops import GitError
from .terminal import Terminal


def safe(fn):
    @wraps(fn)
    def inner(self, *a, **k):
        try:
            return {"ok": True, "data": fn(self, *a, **k)}
        except GitError as e:
            return {"ok": False, "error": str(e)}
        except requests.RequestException as e:
            return {"ok": False, "error": f"網路錯誤：{e}"}
        except FileNotFoundError:
            return {"ok": False, "error": "找不到 git，請先安裝 Git 並加入 PATH"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}
    return inner


def _folder_dialog():
    kind = webview.FileDialog.FOLDER if hasattr(webview, "FileDialog") else webview.FOLDER_DIALOG
    r = webview.windows[0].create_file_dialog(kind)
    return r[0] if r else None


class Api:
    def __init__(self):
        self._term = Terminal()

    # ----- 資料夾清單 -----
    @safe
    def repos(self):
        cfg = config.load()
        keep = [p for p in cfg["repos"] if not fs.is_desktop(p)]
        if keep != cfg["repos"]:  # 清單中若有桌面本身，自動移除
            cfg["repos"] = keep
            config.save(cfg)
        return {
            "repos": [{"path": p, "name": Path(p).name or p, "exists": Path(p).is_dir()} for p in cfg["repos"]],
            "has_token": bool(cfg["token"]),
        }

    @safe
    def pick_folder(self):
        return _folder_dialog()

    @safe
    def open_repo(self, path):
        path = os.path.normpath(os.path.abspath(path.strip().strip('"')))
        if not Path(path).is_dir():
            raise GitError("資料夾不存在")
        if fs.is_desktop(path):
            raise GitError("不支援加入桌面，請選擇桌面裡的子資料夾")
        cfg = config.load()
        if os.path.normcase(path) not in [os.path.normcase(p) for p in cfg["repos"]]:
            cfg["repos"].append(path)
            config.save(cfg)
        return {"path": path, "name": Path(path).name or path, "is_repo": git.is_repo(path)}

    @safe
    def remove_repo(self, path):
        cfg = config.load()
        cfg["repos"] = [p for p in cfg["repos"] if p != path]
        config.save(cfg)
        return True

    @safe
    def delete_repo(self, path, confirm_name):
        if Path(path).name != confirm_name:
            raise GitError("資料夾名稱不符，已取消")
        if self._term.cwd and fs.inside(self._term.cwd, path):
            self._term.stop()  # 先結束終端機（含它啟動的程式），否則 Windows 會因程序占用而無法刪除
        ended = fs.delete(path)  # 內部會再結束其他占用此資料夾的程序
        self.remove_repo(path)
        return {"ended": ended}

    @safe
    def open_folder(self, path):
        fs.open_folder(path)
        return True

    @safe
    def tree(self, path):
        return fs.tree(path)

    # ----- Git -----
    @safe
    def init_repo(self, path):
        git.init(path)
        return True

    @safe
    def status(self, path):
        return git.status(path)

    @safe
    def branches(self, path):
        return git.branches(path)

    @safe
    def switch(self, path, name, create=False):
        git.switch(path, name, create)
        return True

    @safe
    def commit(self, path, files, message):
        return git.commit(path, files, message)

    @safe
    def unpushed(self, path):
        return git.unpushed(path)

    @safe
    def reword(self, path, commit, message):
        return git.reword(path, commit, message)

    @safe
    def push(self, path):
        return git.push(path)

    @safe
    def force_push(self, path):
        return git.push(path, force=True)

    @safe
    def pull(self, path):
        return git.pull(path)

    @safe
    def log(self, path):
        return git.log(path)

    # ----- 終端機 -----
    @safe
    def term_start(self, path, cols=120, rows=30):
        self._term.start(path, cols, rows)
        return True

    @safe
    def term_input(self, data):
        self._term.write(data)
        return True

    @safe
    def term_resize(self, cols, rows):
        self._term.resize(cols, rows)
        return True

    @safe
    def term_stop(self):
        self._term.stop()
        return True

    # ----- GitHub -----
    @safe
    def set_token(self, token):
        cfg = config.load()
        cfg["token"] = token.strip()
        config.save(cfg)
        return True

    @safe
    def gh_repos(self):
        return github.repos()

    @safe
    def gh_create(self, path, name, private=True):
        return github.create(path, name, private)

    @safe
    def clone(self, url):
        parent = _folder_dialog()
        return github.clone(parent, url) if parent else None
