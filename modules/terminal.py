"""終端機：以 pywinpty（Windows ConPTY）啟動持續執行的 PowerShell，輸出即時送到前端 xterm.js"""
import json
import os
import shutil
import subprocess
import threading
import time

import webview

try:
    from winpty import PtyProcess
except ImportError:  # 尚未安裝 pywinpty
    PtyProcess = None


def _js(code):
    try:
        webview.windows[0].evaluate_js(code)
    except Exception:
        pass


class Terminal:
    def __init__(self):
        self.proc = None
        self.cwd = None

    def start(self, cwd, cols, rows):
        if PtyProcess is None:
            raise RuntimeError("尚未安裝 pywinpty，請執行：pip install pywinpty")
        if not os.path.isdir(cwd):
            raise RuntimeError("資料夾不存在")
        self.stop()
        shell = shutil.which("pwsh") or shutil.which("powershell") or "powershell.exe"
        proc = PtyProcess.spawn([shell, "-NoLogo"], cwd=cwd, dimensions=(max(int(rows), 2), max(int(cols), 10)))
        self.proc, self.cwd = proc, cwd
        threading.Thread(target=self._pump, args=(proc,), daemon=True).start()

    def _pump(self, proc):
        try:
            while True:
                data = proc.read(4096)
                if data:
                    _js(f"window.term.write({json.dumps(data)})")
                elif not proc.isalive():
                    break
                else:
                    time.sleep(0.01)
        except Exception:
            pass
        if self.proc is proc:  # 被 stop() 主動結束時不通知前端
            _js("window.term.exited()")

    def write(self, data):
        if self.proc and self.proc.isalive():
            self.proc.write(data)

    def resize(self, cols, rows):
        if self.proc and self.proc.isalive():
            self.proc.setwinsize(max(int(rows), 2), max(int(cols), 10))

    def stop(self):
        proc, self.proc, self.cwd = self.proc, None, None
        if proc:
            try:
                if os.name == "nt" and getattr(proc, "pid", None):  # 連同終端機裡執行的程式一起結束
                    subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True,
                                   stdin=subprocess.DEVNULL, creationflags=0x08000000)
                if proc.isalive():
                    proc.terminate(force=True)
            except Exception:
                pass
