// File: api/evaluate.js
export const config = { runtime: 'edge' };

function safeParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), { status: 405 });
  }
  const { profile = {}, answers = {} } = await req.json();

  const SYSTEM = `You are a strict B2B GTM evaluator. Score six dimensions (Why change, Why now, Why your company, Emotion→Logic, Buyer-as-hero, Clarity).
Use 0=None, 2=Emerging, 3=Basic, 4=Advanced, 5=Leading. Output ONLY valid JSON per schema. Tailor coaching to role. Do not fabricate external facts.`;

  const schemaHint = {
    profile: { name: '', role: '', email: '', organization: '' },
    total: 0,
    band: 'None',
    dimensions: [],
    coaching: { role_adaptive: true },
    risks: [],
    path: 'A'
  };

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ ...schemaHint, band:'None', total:0, demo:true }), { status: 200 });
  }

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-5.1-mini',
      temperature: 0.2,
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ profile, answers }) }
      ]
    })
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return new Response(JSON.stringify({ error: 'OpenAI error', detail }), { status: 500 });
  }

  const data = await resp.json();

  let text = '';
  if (data.output_text) text = data.output_text;
  else if (Array.isArray(data.output)) {
    text = data.output.map(o => {
      if (Array.isArray(o.content) && o.content[0] && o.content[0].type === 'output_text') return o.content[0].text;
      if (o.content && o.content[0] && o.content[0].text) return o.content[0].text;
      return '';
    }).join('\n');
  } else if (data.choices && data.choices[0]?.message?.content) {
    text = data.choices[0].message.content;
  }

  const json = safeParse(text, { ...schemaHint, parse_error: true });
  return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' }, status: 200 });
}
