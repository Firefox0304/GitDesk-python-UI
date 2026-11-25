"""Git 指令封裝（透過 subprocess 呼叫系統 git）"""
import os
import re
import subprocess
from pathlib import Path

NO_WINDOW = 0x08000000 if os.name == "nt" else 0


class GitError(Exception):
    pass


def run(path, *args, env=None):
    if not Path(path).is_dir():
        raise GitError("資料夾不存在")
    return subprocess.run(
        ["git", "-c", "core.quotepath=false", *args],
        cwd=path, capture_output=True, text=True, stdin=subprocess.DEVNULL,
        encoding="utf-8", errors="replace", creationflags=NO_WINDOW, env=env,
    )


def git(path, *args, env=None):
    p = run(path, *args, env=env)
    if p.returncode != 0:
        raise GitError((p.stderr or p.stdout).strip() or "git 指令失敗")
    return p.stdout.strip()


def is_repo(path):
    return run(path, "rev-parse", "--is-inside-work-tree").returncode == 0


def init(path):
    git(path, "init", "-b", "main")


def status(path):
    lines = git(path, "status", "--porcelain=v1", "-b", "-uall").splitlines()
    head = lines[0][3:] if lines else ""
    m = re.match(r"No commits yet on (\S+)", head)
    branch = m.group(1) if m else re.split(r"\.\.\.| \[", head)[0]
    ahead = re.search(r"ahead (\d+)", head)
    behind = re.search(r"behind (\d+)", head)
    files = []
    for line in lines[1:]:
        xy, p = line[:2], line[3:]
        if " -> " in p:
            p = p.split(" -> ")[-1]
        code = "?" if xy == "??" else (xy[0] if xy[0] != " " else xy[1])
        files.append({"path": p.strip('"'), "code": code})
    return {
        "branch": branch,
        "ahead": int(ahead.group(1)) if ahead else 0,
        "behind": int(behind.group(1)) if behind else 0,
        "upstream": "..." in head,
        "files": files,
    }


def branches(path):
    return [b for b in git(path, "branch", "--format=%(refname:short)").splitlines() if b]


def switch(path, name, create=False):
    git(path, "switch", *(["-c"] if create else []), name)


def commit(path, files, message):
    if not files:
        raise GitError("請至少勾選一個檔案")
    if not message.strip():
        raise GitError("請輸入 commit 訊息")
    git(path, "add", "-A", "--", *files)
    git(path, "commit", "-m", message.strip())
    return git(path, "rev-parse", "--short", "HEAD")


def push(path, force=False):
    branch = git(path, "branch", "--show-current")
    if not branch:
        raise GitError("目前不在任何分支上（detached HEAD），無法推送")
    if force:
        args = ["push", "-f", "origin", branch]
    elif run(path, "rev-parse", "--abbrev-ref", "@{u}").returncode == 0:
        args = ["push"]
    else:
        args = ["push", "-u", "origin", branch]
    p = run(path, *args)
    if p.returncode != 0:
        raise GitError(p.stderr.strip() or p.stdout.strip())
    out = (p.stderr or p.stdout).strip()
    return out.splitlines()[-1] if out else "推送完成"


def pull(path):
    p = run(path, "pull", "--ff-only")
    if p.returncode != 0:
        raise GitError(p.stderr.strip() or p.stdout.strip())
    out = p.stdout.strip()
    return out.splitlines()[-1] if out else "已是最新"


def log(path):
    if run(path, "rev-parse", "HEAD").returncode != 0:
        return []
    out = git(path, "log", "-n", "40", "--pretty=format:%h%x1f%an%x1f%ar%x1f%s")
    return [dict(zip(("hash", "author", "when", "subject"), l.split("\x1f"))) for l in out.splitlines()]


# ----- 修改尚未推送的 commit 訊息 -----
def _unpushed_range(path):
    # 有 upstream：看 @{u}..HEAD；沒有（還沒推過）：HEAD 裡不在任何遠端分支上的提交
    if run(path, "rev-parse", "--abbrev-ref", "@{u}").returncode == 0:
        return ["@{u}..HEAD"]
    return ["HEAD", "--not", "--remotes"]


def unpushed(path):
    """尚未推送的提交（新到舊），含完整訊息。"""
    if run(path, "rev-parse", "HEAD").returncode != 0:
        return []
    out = git(path, "log", *_unpushed_range(path), "--pretty=format:%H%x1f%h%x1f%s%x1f%B%x1e")
    items = []
    for rec in out.split("\x1e"):
        parts = rec.lstrip("\n").split("\x1f", 3)
        if len(parts) == 4:
            items.append({"hash": parts[0], "short": parts[1], "subject": parts[2], "message": parts[3].strip()})
    return items


def _clone(path, c, parents, message):
    """用相同的檔案內容（tree）與作者資訊重建一筆提交，只換父提交／訊息。"""
    tree, ps, an, ae, ad, msg = git(
        path, "log", "-1", "--date=raw",
        "--pretty=format:%T%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%B", c).split("\x1f", 5)
    if parents is None:
        parents = ps.split()
    args = ["commit-tree", tree]
    for p in parents:
        args += ["-p", p]
    args += ["-m", msg.strip() if message is None else message]
    env = {**os.environ, "GIT_AUTHOR_NAME": an, "GIT_AUTHOR_EMAIL": ae, "GIT_AUTHOR_DATE": ad}
    return git(path, *args, env=env)


def reword(path, commit, message):
    """修改一筆「尚未推送」的提交訊息。回傳 True＝已修改，False＝訊息沒變。

    不動工作目錄與暫存區：重建該筆（以及它之後的）提交，檔案內容完全相同，
    最後用 update-ref 把目前分支指過去；若途中 HEAD 被別處改動則整個失敗、不寫入。
    """
    message = message.strip()
    if not message:
        raise GitError("請輸入 commit 訊息")
    target = next((c for c in unpushed(path) if c["hash"] == commit), None)
    if not target:
        raise GitError("這筆提交已推送或不存在，無法修改")
    if target["message"].strip() == message:
        return False
    old_head = git(path, "rev-parse", "HEAD")
    new = {commit: _clone(path, commit, None, message)}
    for c in git(path, "rev-list", "--reverse", "--topo-order", f"{commit}..HEAD").splitlines():
        parents = git(path, "log", "-1", "--pretty=format:%P", c).split()
        if any(p in new for p in parents):
            new[c] = _clone(path, c, [new.get(p, p) for p in parents], None)
    git(path, "update-ref", "-m", "GitDesk: 修改 commit 訊息", "HEAD", new[old_head], old_head)
    return True
