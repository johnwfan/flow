import { Category } from "@flow/shared";
import type { AppContextMessage } from "@flow/shared";
import { categorizeApp } from "./app-categories.js";

/**
 * Polls the foreground window title every 2 seconds.
 * Emits AppContextMessage on window change.
 * Uses child_process to call PowerShell for window title on Windows.
 * (ffi-napi is the ideal approach but adds native build complexity;
 *  PowerShell fallback works for hackathon with minimal deps)
 */
export class WindowTracker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTitle = "";
  private lastCategory: Category = Category.Unknown;
  private onContext: (msg: AppContextMessage) => void;
  private onCategoryChange?: (category: Category) => void;

  constructor(opts: {
    onContext: (msg: AppContextMessage) => void;
    onCategoryChange?: (category: Category) => void;
  }) {
    this.onContext = opts.onContext;
    this.onCategoryChange = opts.onCategoryChange;
  }

  start(): void {
    if (this.interval) return;

    // Poll every 2 seconds
    this.interval = setInterval(() => {
      this.poll();
    }, 2000);

    console.log("[window] tracker started (2s poll)");
    // Initial poll
    this.poll();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[window] tracker stopped");
    }
  }

  get currentCategory(): Category {
    return this.lastCategory;
  }

  private async poll(): Promise<void> {
    try {
      const title = await getActiveWindowTitle();
      if (title && title !== this.lastTitle) {
        this.lastTitle = title;
        const category = categorizeApp(title);
        this.lastCategory = category;

        this.onContext({
          kind: "app_context",
          app_title: title,
          category,
          ts: Date.now(),
        });

        if (this.onCategoryChange) {
          this.onCategoryChange(category);
        }
      }
    } catch {
      // Silently ignore poll failures
    }
  }
}

async function getActiveWindowTitle(): Promise<string> {
  if (process.platform !== "win32") {
    return ""; // Only Windows supported for now
  }

  const { execSync } = await import("node:child_process");
  try {
    // Use PowerShell to get the foreground window title
    const result = execSync(
      'powershell -NoProfile -Command "(Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition \'[DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow();\' -Name Win32 -Namespace Win32 -PassThru)::GetForegroundWindow() } | Select-Object -First 1).MainWindowTitle"',
      { encoding: "utf-8", timeout: 2000, windowsHide: true }
    ).trim();
    return result;
  } catch {
    return "";
  }
}
