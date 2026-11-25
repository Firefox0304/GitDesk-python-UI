"""資料夾操作：桌面路徑、開啟、樹狀圖、刪除"""
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

from .git_ops import GitError

try:
    import psutil
except ImportError:  # 沒裝 psutil 時只會結束 GitDesk 自己的終端機
    psutil = None

SKIP = {".git", "node_modules", "__pycache__", ".venv", "venv"}
SYSTEM_PROCS = {"explorer.exe", "svchost.exe", "system", "csrss.exe", "winlogon.exe", "services.exe"}


def desktop_path():
    """取得真實桌面路徑（含 OneDrive 重新導向）。"""
    if os.name == "nt":
        try:
            import ctypes

            class GUID(ctypes.Structure):
                _fields_ = [("a", ctypes.c_ulong), ("b", ctypes.c_ushort), ("c", ctypes.c_ushort), ("d", ctypes.c_ubyte * 8)]

            g = GUID(0xB4BFCC3A, 0xDB2C, 0x424C, (ctypes.c_ubyte * 8)(0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41))
            buf = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(buf)) == 0:
                path = buf.value
                ctypes.windll.ole32.CoTaskMemFree(buf)
                return path
        except Exception:
            pass
    return str(Path.home() / "Desktop")


def open_folder(path):
    if not Path(path).is_dir():
        raise GitError("資料夾不存在")
    if os.name == "nt":
        os.startfile(path)  # noqa: S606
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def tree(path, max_depth=6, max_items=800):
    root = Path(path)
    if not root.is_dir():
        raise GitError("資料夾不存在")
    lines, count = [root.name or str(root)], [0]

    def walk(d, prefix, depth):
        try:
            items = sorted(d.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except OSError:
            lines.append(prefix + "└─ (無法讀取)")
            return False
        items = [i for i in items if i.name not in SKIP]
        for n, i in enumerate(items):
            if count[0] >= max_items:
                lines.append(prefix + "… 項目過多，已截斷")
                return True
            last = n == len(items) - 1
            lines.append(f"{prefix}{'└─ ' if last else '├─ '}{i.name}{'/' if i.is_dir() else ''}")
            count[0] += 1
            if i.is_dir() and not i.is_symlink() and depth < max_depth:
                if walk(i, prefix + ("   " if last else "│  "), depth + 1):
                    return True
        return False

    walk(root, "", 1)
    return "\n".join(lines)


def _norm(p):
    return os.path.normcase(os.path.normpath(os.path.abspath(p)))


def is_desktop(path):
    return _norm(path) in {_norm(desktop_path()), _norm(Path.home() / "Desktop")}


def inside(child, root):
    c, r = _norm(child), _norm(root)
    try:
        return os.path.commonpath([c, r]) == r
    except ValueError:  # 不同磁碟
        return False


def find_users(path):
    """工作目錄或執行檔位於 path 內的程序（排除 GitDesk 自己、上層與子程序，以及系統程序）。"""
    if psutil is None:
        return []
    me = psutil.Process()
    protected = {me.pid} | {p.pid for p in me.parents()} | {p.pid for p in me.children(recursive=True)}
    found = []
    for p in psutil.process_iter(["pid", "name", "exe", "cwd"]):
        i = p.info
        if i["pid"] in protected or (i["name"] or "").lower() in SYSTEM_PROCS:
            continue
        if any(v and inside(v, path) for v in (i["cwd"], i["exe"])):
            found.append(p)
    return found


def kill_users(path):
    """強制結束占用 path 的程序（含其子程序），回傳被結束的程式名稱。"""
    procs = find_users(path)
    victims, names = [], []
    for p in procs:
        try:
            victims += p.children(recursive=True)
        except psutil.Error:
            pass
        victims.append(p)
        names.append(p.info["name"] or str(p.pid))
    for v in victims:
        try:
            v.kill()
        except psutil.Error:
            pass
    if victims:
        psutil.wait_procs(victims, timeout=3)
    return list(dict.fromkeys(names))


def delete(path):
    p = Path(path).resolve()
    if not p.is_dir():
        raise GitError("資料夾不存在")
    if p.parent == p or p == Path.home().resolve() or p == Path(desktop_path()).resolve():
        raise GitError("為了安全，不允許刪除磁碟根目錄、使用者資料夾或桌面")
    if inside(__file__, p) or inside(os.getcwd(), p):
        raise GitError("不能刪除 GitDesk 自己所在的資料夾")

    ended = kill_users(p)
    if ended:
        time.sleep(0.5)  # 等系統釋放檔案控制代碼

    def on_error(func, target, _exc):
        os.chmod(target, stat.S_IWRITE)  # 唯讀檔（例如 .git 內的物件）先解除再刪
        func(target)

    err = None
    for _ in range(3):
        try:
            shutil.rmtree(p, onerror=on_error)
            return ended
        except OSError as e:
            if not p.exists():
                return ended
            err = e
            time.sleep(0.6)
    left = list(dict.fromkeys((x.info["name"] or str(x.pid)) for x in find_users(p)))
    if left:
        raise GitError("資料夾仍被這些程序占用，無法刪除：" + "、".join(left))
    raise GitError(f"無法刪除資料夾：{err}")
