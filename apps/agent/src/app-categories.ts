import { Category } from "@flow/shared";

/**
 * Static category map for common apps.
 * Matches against lowercase window title substrings.
 */
const CATEGORY_RULES: Array<{ match: string; category: Category }> = [
  // Study
  { match: "pdf", category: Category.Study },
  { match: "arxiv", category: Category.Study },
  { match: "overleaf", category: Category.Study },
  { match: "notion", category: Category.Study },
  { match: "anki", category: Category.Study },
  { match: "textbook", category: Category.Study },
  { match: "coursera", category: Category.Study },
  { match: "khan academy", category: Category.Study },
  { match: "canvas", category: Category.Study },

  // Productivity / IDE
  { match: "visual studio code", category: Category.Productivity },
  { match: "code -", category: Category.Productivity },
  { match: "intellij", category: Category.Productivity },
  { match: "pycharm", category: Category.Productivity },
  { match: "webstorm", category: Category.Productivity },
  { match: "sublime text", category: Category.Productivity },
  { match: "vim", category: Category.Productivity },
  { match: "neovim", category: Category.Productivity },
  { match: "terminal", category: Category.Productivity },
  { match: "powershell", category: Category.Productivity },
  { match: "cmd.exe", category: Category.Productivity },
  { match: "windows terminal", category: Category.Productivity },
  { match: "word", category: Category.Productivity },
  { match: "excel", category: Category.Productivity },
  { match: "powerpoint", category: Category.Productivity },
  { match: "google docs", category: Category.Productivity },
  { match: "google sheets", category: Category.Productivity },
  { match: "figma", category: Category.Productivity },

  // Communication
  { match: "slack", category: Category.Communication },
  { match: "discord", category: Category.Communication },
  { match: "teams", category: Category.Communication },
  { match: "zoom", category: Category.Communication },
  { match: "gmail", category: Category.Communication },
  { match: "outlook", category: Category.Communication },
  { match: "messages", category: Category.Communication },
  { match: "whatsapp", category: Category.Communication },

  // Social
  { match: "twitter", category: Category.Social },
  { match: "x.com", category: Category.Social },
  { match: "instagram", category: Category.Social },
  { match: "facebook", category: Category.Social },
  { match: "reddit", category: Category.Social },
  { match: "tiktok", category: Category.Social },
  { match: "linkedin", category: Category.Social },

  // Entertainment
  { match: "youtube", category: Category.Entertainment },
  { match: "netflix", category: Category.Entertainment },
  { match: "spotify", category: Category.Entertainment },
  { match: "twitch", category: Category.Entertainment },
  { match: "steam", category: Category.Entertainment },
  { match: "hulu", category: Category.Entertainment },
  { match: "disney+", category: Category.Entertainment },

  // System
  { match: "task manager", category: Category.System },
  { match: "settings", category: Category.System },
  { match: "file explorer", category: Category.System },
  { match: "control panel", category: Category.System },
];

/** Categorize a window title using the static rule map */
export function categorizeApp(title: string): Category {
  const lower = title.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (lower.includes(rule.match)) {
      return rule.category;
    }
  }
  return Category.Unknown;
}
