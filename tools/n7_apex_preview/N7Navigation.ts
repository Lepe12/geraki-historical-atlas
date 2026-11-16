// N7_APEX_HOME_V1: one N7. The Humanoid (this app) is the home screen after login; the written Chat and
// NABOU are the existing screens of the N7 page on the same origin. Moving between them never creates a
// conversation: the active conversation ID is kept in the shared N7 state that both pages already use.
export type N7Target = "chat" | "nabou" | "humanoid" | "library" | "agents";

export const SHARED_STATE_KEY = "n7-shared-state-v1";
export const GREETED_KEY = "n7-apex-greeted-v1";
export const GREETING = "Καλώς ήρθες. Είμαι η N7. Πώς μπορώ να σε βοηθήσω σήμερα;";
const ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function targetUrl(target: N7Target): string {
  return target === "humanoid" ? "/n7-apex/" : "/?view=" + target;
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[.,!;:·…«»"'()?]/g, " ").replace(/\s+/g, " ").trim();
}

// A navigation request is recognised only when the whole phrase is a command ("N7, άνοιξε το Chat"),
// never when the words appear inside a longer question or research request.
const NAME = "(?:n7|ν7|ενεπτα|εν 7|η n7|n 7)";
const OPEN = "(?:ανοιξε|ανοιξε μου|πηγαινε|παμε|παω|μεταβαση|μεταφερε με|δειξε μου|δειξε|επεστρεψε|γυρνα|γυρισε|επιστροφη)";
const ARTICLE = "(?:(?:στο|στον|στην|στη|στους|στα|στις|σε|το|τον|την|τη|τα|τις|τους)\\s+)?";
const CHAT = "(?:γραπτο\\s+)?(?:chat|τσατ|τσατ|συνομιλια|συνομιλιες|γραπτη συνομιλια|γραπτο περιβαλλον)";
const MAP = "(?:nabou|ναμπου|ναμπου|ναμπο|ιστορικο\\s+χαρτη|ιστορικο\\s+χαρτη\\s+nabou|χαρτη|χαρτη nabou|ιστορικους\\s+χαρτες|χαρτες nabou)";
const LIBRARY = "(?:ιστορικη\\s+)?(?:βιβλιοθηκη|βιβλιοθηκη πηγων|βιβλιοθηκη n7)";
const AGENTS = "(?:agents|agent|αγεντς|αγεντ|ατζεντς|ατζεντ|εργασιες)";
const HUMANOID = "(?:ολογραμμα|ολογραμμα n7|humanoid|χιουμανοιντ|ουμανοιντ|αρχικη|αρχικη οθονη|γυναικεια μορφη)";
const wrap = (what: string) => new RegExp(`^(?:${NAME}\\s+)?(?:παρακαλω\\s+)?${OPEN}\\s+${ARTICLE}${what}(?:\\s+παρακαλω)?$`);
const RULES: Array<[N7Target, RegExp]> = [
  ["chat", wrap(CHAT)],
  ["nabou", wrap(MAP)],
  ["humanoid", wrap(HUMANOID)],
  ["library", wrap(LIBRARY)],
  ["agents", wrap(AGENTS)],
];

export function navCommand(text: string): N7Target | null {
  const clean = plain(text);
  if (!clean || clean.length > 80) return null;
  for (const [target, rule] of RULES) if (rule.test(clean)) return target;
  return null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }

export function readConversationId(store: Store | null = safe(() => window.localStorage, null)): string | null {
  if (!store) return null;
  return safe(() => {
    const value = JSON.parse(store.getItem(SHARED_STATE_KEY) || "null");
    const id = value && value.schema === "n7-shared-state/v1" ? value.conversationId : null;
    return typeof id === "string" && ID.test(id) ? id : null;
  }, null);
}

// Only conversationId is written; every other field of the shared state is preserved as found.
export function writeConversationId(id: string, store: Store | null = safe(() => window.localStorage, null)): void {
  if (!store || !ID.test(id)) return;
  safe(() => {
    let value: Record<string, unknown> = {};
    try { const old = JSON.parse(store.getItem(SHARED_STATE_KEY) || "null"); if (old && old.schema === "n7-shared-state/v1") value = old; } catch { /* start clean */ }
    value.schema = "n7-shared-state/v1";
    value.conversationId = id;
    value.updated = new Date().toISOString();
    store.setItem(SHARED_STATE_KEY, JSON.stringify(value));
  }, undefined);
}

export function wasGreeted(store: Store | null = safe(() => window.sessionStorage, null)): boolean {
  return !!store && safe(() => store.getItem(GREETED_KEY) === "1", false);
}
export function markGreeted(store: Store | null = safe(() => window.sessionStorage, null)): void {
  if (store) safe(() => store.setItem(GREETED_KEY, "1"), undefined);
}

export function go(target: N7Target, conversationId?: string): void {
  if (conversationId) writeConversationId(conversationId);
  window.location.assign(targetUrl(target));
}

// «Δείξε μου την κατάσταση των Agents»: answered from the real /api/agents report, never from the model.
const STATUS = new RegExp(`^(?:${NAME}\\s+)?(?:παρακαλω\\s+)?(?:(?:δειξε μου|δειξε|πες μου|ποια ειναι)\\s+)?(?:την\\s+)?(?:κατασταση|καταστασης)\\s+(?:των\\s+)?${AGENTS}(?:\\s+παρακαλω)?$`);
export function isAgentsStatus(text: string): boolean {
  const clean = plain(text);
  return !!clean && clean.length <= 80 && STATUS.test(clean);
}

type AgentRow = { greek?: string; id?: string; ready?: boolean; reason?: string };
type AgentsReport = { agents?: AgentRow[]; summary?: { total?: number; ready?: number; notReady?: string[] } };

export function describeAgents(report: AgentsReport): string {
  const agents = Array.isArray(report?.agents) ? report.agents : [];
  const total = Number.isInteger(report?.summary?.total) ? Number(report.summary!.total) : agents.length;
  const ready = Number.isInteger(report?.summary?.ready) ? Number(report.summary!.ready) : agents.filter(a => a.ready).length;
  if (!total) return "Δεν έλαβα κατάσταση των Agents από τον server.";
  const waiting = agents.filter(a => a.ready === false);
  let text = `Από τους ${total} Agents, οι ${ready} είναι έτοιμοι.`;
  if (waiting.length) {
    text += " Δεν είναι έτοιμοι: " + waiting.map(a => `${a.greek || a.id}${a.reason ? " (" + String(a.reason).replace(/\.$/, "") + ")" : ""}`).join("· ") + ".";
  } else text += " Δεν λείπει καμία απαίτηση.";
  return text + " «Έτοιμος» σημαίνει ότι υπάρχουν οι απαιτήσεις του, όχι ότι η έξοδός του έχει επαληθευτεί.";
}
