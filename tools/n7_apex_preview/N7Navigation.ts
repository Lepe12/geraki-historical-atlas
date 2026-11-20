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

// Explicit retrieval commands go to the owner-only corpus route.
export function privateReportRun(text: string): string | null {
  const request = plain(text);
  const run = request.match(/^(?:(?:n7|ν7) )?(?:ανοιξε|δειξε(?: μου)?|φερε(?: μου)?|ανακτησε) (?:την )?(?:ιδιωτικη )?(?:αναφορα|εργασια|ερευνα) (?:του )?(?:run )?([0-9]{8,20})$/);
  if (run) return run[1];
  if (/^(?:(?:n7|ν7) )?(?:ανοιξε|δειξε(?: μου)?|φερε(?: μου)?|ανακτησε) (?:την )?(?:ολοκληρωμενη |ιδιωτικη )?(?:αναφορα|εργασια|ερευνα) (?:για |του )?(?:creveliers|crevellier|κρεβελιερ|κρεβελιε)(?: ιεραπετρα)?$/.test(request)) return "44486434472";
  return null;
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

type AgentObservation = {last_run_at?: string; last_status?: string; last_success_at?: string; last_error?: string; last_error_at?: string};
type AgentRow = { greek?: string; id?: string; ready?: boolean; reason?: string; observed?: AgentObservation | null };
export type AgentsReport = { agents?: AgentRow[]; summary?: { total?: number; ready?: number; observed?: number } };

const OUTCOMES: Record<string,string> = {ok:"επιτυχία", no_results:"καμία εγγραφή", provider_unavailable:"η πηγή δεν απάντησε", unavailable:"εργαλείο μη διαθέσιμο", needs_place:"χρειάζεται τοποθεσία", place_not_found:"άγνωστη τοποθεσία", invalid_input:"μη έγκυρη είσοδος"};
export const agentRunDate = (value?: string) => {
  const time=value?Date.parse(value):NaN;
  return Number.isFinite(time)?new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens"}).format(time):"";
};
export const agentOutcome=(status?: string)=>OUTCOMES[status||""]||"άγνωστο αποτέλεσμα";

export function describeAgents(report: AgentsReport): string {
  const agents = Array.isArray(report?.agents) ? report.agents : [];
  const total = Number.isInteger(report?.summary?.total) ? Number(report.summary!.total) : agents.length;
  const ready = Number.isInteger(report?.summary?.ready) ? Number(report.summary!.ready) : agents.filter(a => a.ready).length;
  if (!total) return "Δεν έλαβα κατάσταση των Agents από τον server.";
  const waiting = agents.filter(a => a.ready === false);
  let text = `Από τους ${total} Agents, οι ${ready} έχουν τις απαραίτητες ρυθμίσεις.`;
  if (waiting.length) {
    text += " Εκκρεμούν ρυθμίσεις: " + waiting.map(a => `${a.greek || a.id}${a.reason ? " (" + String(a.reason).replace(/\.$/, "") + ")" : ""}`).join(" · ") + ".";
  } else text += " Δεν λείπει καμία απαίτηση.";
  const observations=agents.flatMap(agent=>{
    const run=agent.observed;
    if(!run)return [];
    const latest=[agentOutcome(run.last_status),agentRunDate(run.last_run_at)].filter(Boolean).join(" · ");
    const success=agentRunDate(run.last_success_at),error=agentRunDate(run.last_error_at);
    return [`${agent.greek||agent.id}: ${latest}${success?`. Τελευταία επιτυχία ${success}`:""}${error?`. Τελευταίο σφάλμα ${error}`:""}.`];
  });
  if(observations.length)return text+" Καταγεγραμμένες εκτελέσεις από την τελευταία εκκίνηση. "+observations.join(" ");
  return text+(Number.isInteger(report.summary?.observed)?" Δεν έχουν καταγραφεί εκτελέσεις από την τελευταία εκκίνηση.":" Αυτή η έκδοση του server αναφέρει μόνο ρυθμίσεις.");
}
