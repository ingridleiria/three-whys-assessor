// File: api/evaluate.js
// Vercel Serverless Function stub for Three Whys Assessor
// Requires env var: OPENAI_API_KEY

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), { status: 405 });
  }
  const { profile = {}, answers = {} } = await req.json();
  const SYSTEM = `You are a strict B2B GTM evaluator. Score six dimensions (Why change, Why now, Why your company, Emotion→Logic, Buyer-as-hero, Clarity). 
Use 0=None, 2=Emerging, 3=Basic, 4=Advanced, 5=Leading. Output the JSON schema exactly. Refuse to fabricate external facts.`;

  const rubric = {
    scale: { none:0, emerging:2, basic:3, advanced:4, leading:5 },
    banding: '0–9 None/Emerging, 10–15 Basic, 16–22 Advanced, 23–30 Leading'
  };

  const userPayload = { profile, answers, rubric };

  // Use OpenAI Responses API
  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
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
        { role: 'user', content: JSON.stringify(userPayload) }
      ]
    })
  });

  if (!openaiRes.ok) {
    const msg = await openaiRes.text();
    return new Response(JSON.stringify({ error: 'OpenAI error', detail: msg }), { status: 500 });
  }

  const data = await openaiRes.json();

  // Extract text. Adjust if API response shape changes.
  const text = data.output_text || (Array.isArray(data.output) ? data.output.map(o=>o.content?.[0]?.text).join('') : '');
  let json;
  try { json = JSON.parse(text); } catch { 
    // Fallback minimal response to avoid blank UI
    json = { profile, total: 0, band: 'None', dimensions: [], coaching: { role_adaptive: true }, risks: [], path: 'A' };
  }
  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}
