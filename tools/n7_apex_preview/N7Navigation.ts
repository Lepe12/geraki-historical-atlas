// N7_APEX_HOME_V1: one N7. The Humanoid (this app) is the home screen after login; the written Chat and
// NABOU are the existing screens of the N7 page on the same origin. Moving between them never creates a
// conversation: the active conversation ID is kept in the shared N7 state that both pages already use.
export type N7Target = "chat" | "nabou" | "humanoid" | "library" | "agents";

export const SHARED_STATE_KEY = "n7-shared-state-v1";
export const GREETED_KEY = "n7-apex-greeted-v1";
// First visit (kept in this browser and confirmed by the server having no conversation yet) and every later login.
export const GREETING_FIRST = "Καλώς ήρθες. Είμαι η N7. Μπορούμε να συζητήσουμε, να συνεχίσουμε τη συγγραφή σου, να αναζητήσουμε ιστορικές πηγές ή να ανοίξουμε τον ιστορικό χάρτη NABOU. Μπορώ επίσης να αναλάβω εργασίες μέσω των διαθέσιμων Agents σου. Πες μου τι χρειάζεσαι. Αν προτιμάς να γράψεις, πάτησε το μικρό πληκτρολόγιο στο κάτω μέρος της οθόνης.";
export const GREETING_AGAIN = "Καλώς ήρθες ξανά. Πώς μπορώ να σε βοηθήσω;";
export const WELCOMED_KEY = "n7-apex-welcomed-v1";
export function isFirstVisit(hasConversations: boolean, store: Pick<Storage, "getItem"> | null = safeStore()): boolean {
  if (hasConversations) return false; // the server already knows this owner, whatever this browser remembers
  return !store || safe(() => store.getItem(WELCOMED_KEY) !== "1", true);
}
export function markWelcomed(store: Pick<Storage, "setItem"> | null = safeStore()): void {
  if (store) safe(() => store.setItem(WELCOMED_KEY, "1"), undefined);
}
function safeStore(): Storage | null { try { return window.localStorage; } catch { return null; } }
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

// «N7, θέλω να γράψω»: opens the small typing field. Whole-phrase commands only.
const WRITE = new RegExp(`^(?:${NAME}\\s+)?(?:παρακαλω\\s+)?(?:θελω να γραψω|θα ηθελα να γραψω|θα γραψω|ανοιξε το πληκτρολογιο|ανοιξε μου το πληκτρολογιο|θελω να πληκτρολογησω|ας γραψω)(?:\\s+παρακαλω)?$`);
export function isWriteCommand(text: string): boolean {
  const clean = plain(text);
  return !!clean && clean.length <= 60 && WRITE.test(clean);
}

// «Ποιες εργασίες εκτελούν οι Agents;» is answered from the real /api/tasks list.
const TASKS = new RegExp(`^(?:${NAME}\\s+)?(?:παρακαλω\\s+)?(?:ποιες|τι|ποια)\\s+(?:εργασιες|εργασια|δουλειες)\\s+(?:εκτελουν|εκτελει|εκτελουνται|εκτελειται|τρεχουν|τρεχει|κανουν)(?:\\s+(?:οι|τωρα|αυτη τη στιγμη))*(?:\\s+${AGENTS})?(?:\\s+(?:οι|τωρα|αυτη τη στιγμη))*$`);
export function isTasksQuery(text: string): boolean {
  const clean = plain(text);
  return !!clean && clean.length <= 80 && TASKS.test(clean);
}
type TaskRow = { kind?: string; prompt?: string; status?: string };
export function describeTasks(report: { tasks?: TaskRow[] }): string {
  const tasks = Array.isArray(report?.tasks) ? report.tasks : [];
  const active = tasks.filter(x => x.status === "running" || x.status === "queued");
  const short = (x: TaskRow) => String(x.prompt || "χωρίς περιγραφή").replace(/\s+/g, " ").slice(0, 90);
  if (!active.length) {
    const last = tasks.filter(x => x.status === "completed").length;
    return "Αυτή τη στιγμή δεν εκτελείται καμία εργασία." + (tasks.length ? ` Έχουν καταγραφεί ${tasks.length} εργασίες συνολικά, ${last} ολοκληρωμένες.` : " Δεν υπάρχουν καταγεγραμμένες εργασίες.");
  }
  const running = active.filter(x => x.status === "running"), queued = active.filter(x => x.status === "queued");
  const parts = [];
  if (running.length) parts.push(`Εκτελούνται ${running.length}: ` + running.slice(0, 3).map(short).join("· "));
  if (queued.length) parts.push(`Σε αναμονή ${queued.length}: ` + queued.slice(0, 3).map(short).join("· "));
  return parts.join(". ") + ".";
}

// «Τι μπορείς να κάνεις;» is answered from the real readiness report, never from a fixed promise.
const CAPS = new RegExp(`^(?:${NAME}\\s+)?(?:παρακαλω\\s+)?(?:τι|τι αλλο)\\s+μπορεις\\s+να\\s+κανεις(?:\\s+παρακαλω)?$`);
export function isCapabilitiesQuery(text: string): boolean {
  const clean = plain(text);
  return !!clean && clean.length <= 60 && CAPS.test(clean);
}
export function describeCapabilities(report: AgentsReport): string {
  const agents = Array.isArray(report?.agents) ? report.agents : [];
  const ready = (id: string) => agents.some(a => a.id === id && a.ready);
  const can: string[] = ["να συζητώ μαζί σου, φωνητικά ή γραπτά"];
  if (ready("news_geopolitics")) can.push("να φέρνω ειδήσεις και γεωπολιτική με διασταύρωση πηγών");
  if (ready("weather")) can.push("να λέω τον καιρό");
  if (ready("historian") || ready("source_library")) can.push("να αναζητώ ιστορικές πηγές στη βιβλιοθήκη σου");
  if (ready("task_runner")) can.push("να αναλαμβάνω εργασίες");
  can.push("να ανοίγω τον ιστορικό χάρτη NABOU και τη βιβλιοθήκη");
  const waiting = agents.filter(a => a.ready === false).map(a => a.greek || a.id);
  const total = Number.isInteger(report?.summary?.total) ? Number(report.summary!.total) : agents.length;
  const count = Number.isInteger(report?.summary?.ready) ? Number(report.summary!.ready) : agents.filter(a => a.ready).length;
  let text = "Μπορώ " + can.join(", ") + ".";
  if (total) text += ` Από τους ${total} Agents, οι ${count} είναι έτοιμοι.`;
  if (waiting.length) text += " Δεν είναι διαθέσιμοι τώρα: " + waiting.join(", ") + ".";
  return text;
}
