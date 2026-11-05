from __future__ import annotations

import os
import signal
import subprocess
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from threading import Lock, Thread
from typing import BinaryIO


class ProcessCancelledError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    stdout: str
    stderr: str
    output_truncated: bool = False


class _BoundedCapture:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.buffer = bytearray()
        self.truncated = False
        self.lock = Lock()

    def append(self, value: bytes) -> None:
        with self.lock:
            self.buffer.extend(value)
            if len(self.buffer) > self.limit:
                del self.buffer[: len(self.buffer) - self.limit]
                self.truncated = True

    def text(self) -> str:
        with self.lock:
            value = bytes(self.buffer).decode("utf-8", errors="replace")
            return f"[earlier output truncated]\n{value}" if self.truncated else value


def _drain(stream: BinaryIO, capture: _BoundedCapture) -> None:
    try:
        for chunk in iter(lambda: stream.read(64 * 1024), b""):
            capture.append(chunk)
    finally:
        stream.close()


def _terminate_process_group(process: subprocess.Popen[bytes], grace_seconds: float = 3) -> None:
    if process.poll() is not None:
        return
    try:
        group = os.getpgid(process.pid)
        os.killpg(group, signal.SIGTERM)
    except (AttributeError, ProcessLookupError, PermissionError):
        process.terminate()
    try:
        process.wait(timeout=grace_seconds)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        group = os.getpgid(process.pid)
        os.killpg(group, signal.SIGKILL)
    except (AttributeError, ProcessLookupError, PermissionError):
        process.kill()
    process.wait()


def run_cancellable(
    command: Sequence[str],
    *,
    timeout: float,
    cancelled: Callable[[], bool] | None = None,
    max_output_bytes: int = 2 * 1024 * 1024,
) -> ProcessResult:
    """Run an argv without a shell, drain bounded output, and own its process group."""

    if not command or not command[0]:
        raise ValueError("process command is empty")
    if timeout <= 0 or max_output_bytes <= 0:
        raise ValueError("process limits must be positive")
    started = time.monotonic()
    process = subprocess.Popen(
        list(command),
        shell=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
        start_new_session=True,
    )
    assert process.stdout is not None and process.stderr is not None
    stdout = _BoundedCapture(max_output_bytes)
    stderr = _BoundedCapture(max_output_bytes)
    readers = (
        Thread(target=_drain, args=(process.stdout, stdout), daemon=True),
        Thread(target=_drain, args=(process.stderr, stderr), daemon=True),
    )
    for reader in readers:
        reader.start()
    try:
        while process.poll() is None:
            if cancelled and cancelled():
                _terminate_process_group(process)
                raise ProcessCancelledError("external process was cancelled")
            if time.monotonic() - started > timeout:
                _terminate_process_group(process)
                raise TimeoutError("external process timed out")
            time.sleep(0.05)
    finally:
        if process.poll() is None:
            _terminate_process_group(process)
        for reader in readers:
            reader.join(timeout=2)
    return ProcessResult(
        process.returncode,
        stdout.text(),
        stderr.text(),
        stdout.truncated or stderr.truncated,
    )
