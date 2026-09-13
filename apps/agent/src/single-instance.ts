import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface LockInfo {
  pid: number;
  startedAt: string;
  cwd: string;
}

export interface InstanceLock {
  path: string;
  release: () => void;
}

function readLock(path: string): LockInfo | null {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockInfo>;
    return typeof parsed.pid === "number" ? (parsed as LockInfo) : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  if (pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === "EPERM";
  }
}

function removeStaleLock(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Another process may have cleaned it up first.
  }
}

export function acquireSingleInstance(lockPath: string): InstanceLock {
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx");
      const info: LockInfo = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        cwd: process.cwd(),
      };
      writeFileSync(fd, JSON.stringify(info, null, 2));
      closeSync(fd);

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const current = readLock(lockPath);
        if (current?.pid !== process.pid) return;
        removeStaleLock(lockPath);
      };

      process.once("exit", release);
      return { path: lockPath, release };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;

      const existing = readLock(lockPath);
      if (!existing || !processIsAlive(existing.pid)) {
        removeStaleLock(lockPath);
        continue;
      }

      throw new Error(
        `another Flow agent is already running (pid ${existing.pid}, started ${existing.startedAt})`
      );
    }
  }

  throw new Error(`could not acquire Flow agent lock at ${lockPath}`);
}
