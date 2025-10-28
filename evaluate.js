// A simple serverless API endpoint for the Three Whys assessment.
//
// When deployed on Vercel or another serverless platform this file
// receives POST requests from the front end with the user’s profile
// and answers. If an OpenAI API key is present in the environment the
// endpoint will invoke the Chat Completions API to score the
// responses using the Three Whys framework and return a structured
// JSON report. If no key is provided (e.g. during local development
// without external network access) a deterministic fallback scoring
// routine is used to generate reasonable output.

const https = require('https');

/**
 * Perform a request to the OpenAI Chat Completions API. This helper
 * encapsulates the API call so that it can be conditionally invoked
 * when a key is available. It returns a promise that resolves to
 * parsed JSON on success or rejects on failure.
 *
 * @param {string} apiKey
 * @param {Object} payload
 */
function callOpenAI(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${apiKey}`,
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

/**
 * Deterministic fallback scoring using simple heuristics on answer
 * length. Mirrors the front‑end fallback logic to ensure similar
 * results when no external API is available.
 *
 * @param {Object} profile
 * @param {Object} answers
 */
function fallbackEvaluate(profile, answers) {
  const categories = [
    { name: 'Why change', key: 'q1' },
    { name: 'Why now', key: 'q2' },
    { name: 'Why your company', key: 'q3' },
    { name: 'Emotion–Logic', key: 'q4' },
    { name: 'Buyer‑as‑hero', key: 'q5' },
    { name: 'Clarity', key: 'q6' },
  ];
  let totalScore = 0;
  const dims = [];
  categories.forEach((cat) => {
    const ans = (answers[cat.key] || '').trim();
    const wordCount = ans ? ans.split(/\s+/).length : 0;
    let score = 0;
    let level = '';
    let why = '';
    let how = '';
    if (wordCount === 0) {
      score = 0;
      level = 'None';
      why = 'You left this question unanswered, which provides no insight into your buyer’s context, the urgency of their pain or how your company might address it. Without this information there is nothing to evaluate, so this dimension scores a zero.';
      how = 'Start by writing at least one detailed paragraph describing the buyer, their situation and how your product or service could change it. Provide facts, examples and emotions to help us understand the context. Use past experiences or research to enrich your description and set a foundation for evaluation.';
    } else if (wordCount < 15) {
      score = 2;
      level = 'Emerging';
      why = 'Your answer is very brief and lacks context, leaving key questions unanswered. At an emerging level you might mention the buyer or the problem but you don’t provide the background, emotion or data to build confidence. This makes it hard to see why a change would matter or why you are credible.';
      how = 'Add specific details about who the buyer is and the scale of their pain. Include an example or metric to quantify urgency. Describe how your product or service uniquely helps them and why now is the right time. A fuller paragraph will elevate you to the next level.';
    } else if (wordCount < 40) {
      score = 3;
      level = 'Basic';
      why = 'You have captured the core idea by articulating the buyer, pain, urgency or differentiation, but the response remains surface level. At a basic level there is some structure, yet it lacks depth, evidence and emotional pull. Buyers may understand the problem but still wonder why they should trust your solution.';
      how = 'Strengthen your answer by elaborating on the problem with anecdotes or statistics, connecting the emotional drivers to logical data. Provide proof points like case study results or testimonials and highlight what truly distinguishes your company. This added depth will move you towards the advanced band.';
    } else if (wordCount < 80) {
      score = 4;
      level = 'Advanced';
      why = 'Your answer is well developed, balancing emotional storytelling with logical proof. It clearly identifies the buyer’s pain, establishes urgency and explains why your company is uniquely suited to help. However there may still be opportunities to weave in unique insights or more tangible evidence to demonstrate market leadership.';
      how = 'To reach a leading level, enrich your narrative with proprietary data, customer success metrics and thought leadership. Illustrate how your solution delivers measurable outcomes and share unique perspectives or innovations that competitors lack. Continually refine your messaging based on feedback to maintain authenticity and differentiation.';
    } else {
      score = 5;
      level = 'Leading';
      why = 'This answer is comprehensive and demonstrates mastery of the framework. It seamlessly integrates emotional hooks, quantifiable results and clear differentiation, making a compelling case for change now and for your company. The narrative flows logically and builds trust through concrete evidence and unique insights.';
      how = 'The next step is to keep sharpening your story through continuous market research and customer conversations. Look for ways to personalise your message further and ensure it resonates across different stakeholder groups. Maintain your leadership by adapting to market shifts and sharing fresh success stories to inspire confidence.';
    }
    totalScore += score;
    dims.push({ name: cat.name, score, level, why, how });
  });
  const avgScore = (totalScore / categories.length).toFixed(1);
  const avgNumeric = parseFloat(avgScore);
  let band = '';
  if (avgNumeric < 1) band = 'None';
  else if (avgNumeric < 2.5) band = 'Emerging';
  else if (avgNumeric < 3.5) band = 'Basic';
  else if (avgNumeric < 4.5) band = 'Advanced';
  else band = 'Leading';
  const summaryMap = {
    None: 'Your assessment indicates there is currently no structured value proposition. Without a clear understanding of your buyer, urgency or differentiation, it will be difficult to craft a message that resonates. Start by articulating each of the Three Whys in detail and gather proof points to build credibility. Identify who your ideal customer is, what pain they experience, why addressing that pain now matters, and why your approach uniquely solves it. Write down your narrative and refine it through customer conversations. Doing so will lay the foundation for a clear, compelling value proposition.',
    Emerging: 'Your value proposition is still forming. You’ve identified key elements but the answers lack sufficient context and proof. At this stage it’s important to research your buyer’s motivations and gather data to support your claims. Spend time interviewing customers, mapping their pain points, and quantifying the costs of inaction. Use those insights to enrich your messaging. Document differentiators and proof points like case studies or benchmarks. This groundwork will help you move from an emerging story to a convincing narrative.',
    Basic: 'You have a foundational value proposition. You identify the buyer, their pain and why now, but there’s room to add more specificity and differentiation. Strengthen your message by connecting emotional hooks to quantitative evidence and tailoring your story to the buyer’s needs. Include specific examples of how your solution has addressed similar challenges, data that underscores urgency, and unique capabilities that competitors lack. The more you tie emotion to logic and show measurable outcomes, the more persuasive your message will become.',
    Advanced: 'Your value proposition is strong and well crafted. You balance emotional hooks with logical proof and clearly articulate why change is needed now and why you are the right partner. To elevate further, incorporate more unique proof points and refine your differentiation based on customer feedback. Continue refining your narrative by integrating fresh customer stories and industry trends, and make sure your messaging remains consistent across all channels and stakeholders. Frequent iteration ensures you maintain relevance and stay ahead of competitors.',
    Leading: 'Congratulations! Your value proposition is industry leading. You demonstrate mastery of the Three Whys, weave emotion and logic seamlessly, and provide compelling evidence. Continue to innovate and adapt your message as markets evolve to maintain leadership. Regularly benchmark against the best in class and solicit feedback from customers and partners to keep your narrative sharp. Share your insights internally to empower teams and externally to position yourself as a thought leader. This proactive approach will keep your value proposition ahead of the curve.',
  };
  const executiveSummary = summaryMap[band];
  // Role coaching determination
  const roleLower = (profile.role || '').toLowerCase();
  let coachingText = '';
  if (roleLower.includes('product')) {
    coachingText = 'As a product leader you should translate product capabilities into business outcomes. Collaborate with marketing and sales to ensure your feature roadmap supports the customer’s story. Use customer interviews to discover emotional drivers and align messaging with market needs.';
  } else if (roleLower.includes('marketing')) {
    coachingText = 'As a marketing leader focus on articulating a clear narrative that resonates with your buyer’s fears and ambitions. Build campaigns around quantified proof and nurture leads through education on the Three Whys. Align closely with sales to ensure consistent messaging across the funnel.';
  } else if (roleLower.includes('sales')) {
    coachingText = 'As a sales leader ensure your team understands the Three Whys and can articulate them in conversations. Coach reps to lead with emotion, back it with logic and tailor differentiation based on buyer persona. Regularly gather feedback from prospects to refine your message.';
  } else if (roleLower.includes('ceo') || roleLower.includes('chief executive')) {
    coachingText = 'As a CEO your role is to champion a unified value proposition across the organisation. Align product, marketing and sales around a shared narrative and ensure resources support timely execution. Emphasise the organisational urgency and link the value story to strategic goals.';
  } else {
    coachingText = 'Align with cross‑functional teams to build a unified value story. Ensure your personal objectives support the broader go‑to‑market strategy and contribute feedback to improve the value proposition.';
  }
  const result = {
    profile,
    averageScore: avgScore,
    band,
    executiveSummary,
    dimensions: dims,
    coaching: {
      headline: 'Elevate your value proposition',
      urgency: 'Clarify the stakes and link your roadmap to near‑term outcomes.',
      differentiators: 'Highlight unique capabilities and proof points that set you apart.',
      valueOutline: 'Define baseline metrics, lift assumptions and payback timeframe.',
      coachingText,
      finalValue: answers.q6 ? answers.q6.trim() : 'Craft your value proposition here by clearly stating who you serve, the problem you solve, and the impact you deliver.',
      nextActions: [
        'Interview at least three customers to validate emotional drivers and pain points.',
        'Document a one‑liner value proposition for each key buyer persona.',
        'Gather data and proof points to quantify your outcomes and support your claims.'
      ]
    }
  };
  return result;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const { profile, answers } = JSON.parse(body || '{}');
      // Basic validation
      if (!profile || !answers) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid request payload.' }));
        return;
      }
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const result = fallbackEvaluate(profile, answers);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
        return;
      }
      // Build prompt for OpenAI
      const userMessages = [];
      userMessages.push({
        role: 'system',
        content: 'You are an expert consultant specialising in sales, marketing and product messaging. You evaluate value propositions using the Three Whys framework (Why change, Why now, Why your company) and provide constructive feedback. Your task is to score each dimension (0 for None, 2 Emerging, 3 Basic, 4 Advanced, 5 Leading), calculate an average, determine a maturity band, deliver an executive summary (~75 words) explaining why the band was given, and then produce a table with “why this level” (~45 words) and “how to reach next level” (~45 words) for each dimension. Additionally provide role‑tailored coaching and suggested final value proposition with next actions. Return your response as JSON in the specified schema without any additional text.'
      });
      // Compose user content with profile and answers
      const qList = [
        { name: 'Why change', key: 'q1', question: 'Who is the buyer and what is their top pain today? Why change?' },
        { name: 'Why now', key: 'q2', question: 'What trigger makes this a priority in the next 3–6 months? Why now?' },
        { name: 'Why your company', key: 'q3', question: 'Why are you the right partner? Add 2–3 differentiators and one proof point. Why your company?' },
        { name: 'Emotion–Logic', key: 'q4', question: 'Write a 1–2 line emotional hook headline.' },
        { name: 'Buyer‑as‑hero', key: 'q5', question: 'Quantify expected outcomes (time saved, revenue lift, risk avoided) and assumptions.' },
        { name: 'Clarity', key: 'q6', question: 'Draft a one‑sentence value proposition.' },
      ];
      let promptContent = `Profile:\nName: ${profile.name}\nRole: ${profile.role}\nEmail: ${profile.email}\nOrganization: ${profile.organization}\n`;
      qList.forEach(({ name, key, question }) => {
        promptContent += `\n${name}: ${question}\nAnswer: ${answers[key] || ''}\n`;
      });
      userMessages.push({ role: 'user', content: promptContent });
      const payload = {
        model: 'gpt-4o',
        temperature: 0.3,
        messages: userMessages,
        response_format: { type: 'json_object' },
      };
      try {
        const apiResponse = await callOpenAI(apiKey, payload);
        // Extract JSON from response
        const content = apiResponse.choices?.[0]?.message?.content;
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(parsed));
      } catch (err) {
        // If API call fails, fall back to heuristic evaluation
        const result = fallbackEvaluate(profile, answers);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      }
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Failed to process request' }));
    }
  });
};
