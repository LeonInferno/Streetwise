const FREE_SEARCH_KEY = "sw.freeSearchUsed";

/** Whether this browser has already spent its one login-free report. */
export function hasUsedFreeSearch(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FREE_SEARCH_KEY) === "1";
}

export function markFreeSearchUsed() {
  if (typeof window === "undefined") return;
  localStorage.setItem(FREE_SEARCH_KEY, "1");
}
