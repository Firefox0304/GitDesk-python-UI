"""GitHub API（列出 repo、建立遠端 repo、clone）"""
import re
from pathlib import Path

import requests

from . import config, git_ops as git
from .git_ops import GitError

API = "https://api.github.com"


def _headers():
    token = config.load()["token"]
    if not token:
        raise GitError("請先到 GitHub 分頁設定 Personal Access Token")
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def repos():
    r = requests.get(f"{API}/user/repos?per_page=100&sort=updated", headers=_headers(), timeout=15)
    if r.status_code == 401:
        raise GitError("Token 無效或已過期")
    r.raise_for_status()
    return [
        {"name": x["full_name"], "private": x["private"], "url": x["clone_url"], "updated": x["updated_at"][:10]}
        for x in r.json()
    ]


def create(path, name, private=True):
    r = requests.post(f"{API}/user/repos", headers=_headers(), json={"name": name, "private": private}, timeout=15)
    if r.status_code >= 400:
        raise GitError(r.json().get("message", "建立失敗"))
    url = r.json()["clone_url"]
    if git.run(path, "remote", "get-url", "origin").returncode == 0:
        git.git(path, "remote", "set-url", "origin", url)
    else:
        git.git(path, "remote", "add", "origin", url)
    return url


def clone(parent, url):
    git.git(parent, "clone", url)
    return str(Path(parent) / re.sub(r"\.git$", "", url.rstrip("/").split("/")[-1]))
