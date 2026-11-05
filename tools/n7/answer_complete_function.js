// N7_COMPLETE_OUTPUT_V1 — replace only the existing answer(messages) function.
async function answer(messages) {
  if (!API_KEY || !MODEL) throw new Error('Model is not configured. Set LLM_API_KEY and LLM_MODEL.');
  const u = new URL(BASE + '/chat/completions');
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Invalid LLM endpoint protocol');
  const isGroqQwen = BASE === 'https://api.groq.com/openai/v1' && MODEL === 'qwen/qwen3.8-27b';
  const initialMessages = promptMessages(messages);
  let complete = '';
  const attempts = isGroqQwen ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const conversation = attempt === 0 ? initialMessages : [...initialMessages,
      {role: 'assistant', content: complete.slice(-4000)},
      {role: 'user', content: 'Συνέχισε ακριβώς από το σημείο διακοπής, χωρίς επανάληψη. Ολοκλήρωσε τις υπόλοιπες ενότητες.'}
    ];
    const request = {model: MODEL, messages: conversation, temperature: 0.3};
    if (isGroqQwen) {
      request.max_completion_tokens = 4096;
      request.reasoning_effort = 'none';
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let choice;
    try {
      const response = await fetch(u, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY},
        body: JSON.stringify(request), signal: controller.signal
      });
      if (!response.ok) throw new Error('Model API error: HTTP ' + response.status);
      const data = await response.json();
      choice = data?.choices?.[0];
      if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim())
        throw new Error('Model returned no text');
    } catch (error) {
      if (complete) return complete + '\n\n[Δεν κατέστη δυνατή η αυτόματη συνέχεια. Γράψε «συνέχισε» για το υπόλοιπο.]';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    let chunk = choice.message.content;
    if (complete && chunk) {
      const maxOverlap = Math.min(400, complete.length, chunk.length);
      for (let n = maxOverlap; n >= 30; n--) {
        if (complete.endsWith(chunk.slice(0, n))) {
          chunk = chunk.slice(n); break;
        }
      }
    }
    complete += chunk;
    if (choice.finish_reason !== 'length') return complete;
    if (!isGroqQwen) return complete + '\n\n[Η απάντηση διακόπηκε λόγω ορίου εξόδου. Γράψε «συνέχισε».]';
    console.warn('N7_COMPLETION_LIMIT_REACHED pass=' + (attempt + 1));
  }
  return complete + '\n\n[Η απάντηση διακόπηκε λόγω συνολικού ορίου. Γράψε «συνέχισε» για το υπόλοιπο.]';
}
