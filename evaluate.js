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
    // Check for unknown or empty responses indicating no information
    const ansLower = ans.toLowerCase();
    const unknownPatterns = ['i don\'t know', 'i don’t know', 'dont know', 'do not know', 'unknown', 'none', 'n/a', 'na', 'inexistent', 'no idea', 'not sure', 'don’t have', 'don\'t have'];
    const isUnknown = wordCount === 0 || unknownPatterns.some((p) => ansLower.includes(p));
    if (isUnknown) {
      // Treat unknown or no answers as none
      score = 1;
      level = 'None';
      why = 'You left this question unanswered or indicated that you don’t know, which provides no insight into your buyer’s context, the urgency of their pain or how your company might address it. Without this information there is nothing to evaluate, so this dimension scores the lowest.';
      how = 'Start by writing at least one detailed paragraph describing the buyer, their situation and how your product or service could change it. Provide facts, examples and emotions to help us understand the context. Use past experiences or research to enrich your description and set a foundation for evaluation. If you truly lack this information, prioritise gathering it before progressing.';
    } else if (wordCount < 15) {
      // Assign score 2 for emerging responses.
      score = 2;
      level = 'Emerging';
      why = 'Your answer is very brief and lacks context, leaving key questions unanswered. At an emerging level you might mention the buyer or the problem but you don’t provide the background, emotion or data to build confidence. This makes it hard to see why a change would matter or why you are credible.';
      how = 'Add specific details about who the buyer is and the scale of their pain. Include an example or metric to quantify urgency. Describe how your product or service uniquely helps them and why now is the right time. A fuller paragraph will elevate you to the next level.';
    } else if (wordCount < 40) {
      // Assign score 3 for basic responses.
      score = 3;
      level = 'Basic';
      why = 'You have captured the core idea by articulating the buyer, pain, urgency or differentiation, but the response remains surface level. At a basic level there is some structure, yet it lacks depth, evidence and emotional pull. Buyers may understand the problem but still wonder why they should trust your solution.';
      how = 'Strengthen your answer by elaborating on the problem with anecdotes or statistics, connecting the emotional drivers to logical data. Provide proof points like case study results or testimonials and highlight what truly distinguishes your company. This added depth will move you towards the advanced band.';
    } else if (wordCount < 80) {
      // Assign score 4 for advanced responses.
      score = 4;
      level = 'Advanced';
      why = 'Your answer is well developed, balancing emotional storytelling with logical proof. It clearly identifies the buyer’s pain, establishes urgency and explains why your company is uniquely suited to help. However there may still be opportunities to weave in unique insights or more tangible evidence to demonstrate market leadership.';
      how = 'To reach a leading level, enrich your narrative with proprietary data, customer success metrics and thought leadership. Illustrate how your solution delivers measurable outcomes and share unique perspectives or innovations that competitors lack. Continually refine your messaging based on feedback to maintain authenticity and differentiation.';
    } else {
      // Assign score 5 for leading responses.
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
  // Determine the band based on the average of a 1–5 scale.
  if (avgNumeric < 1.5) band = 'None';
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
  // Build a role‑tailored coaching paragraph and additional descriptions
  let coachingText = '';
  if (roleLower.includes('product')) {
    coachingText = 'As a product leader you should translate product capabilities into business outcomes and ensure your roadmap tells a cohesive story. Partner closely with marketing and sales to validate that new features map to real customer problems. Use interviews and data to uncover emotional drivers and align messaging with market needs, then adapt plans accordingly.';
  } else if (roleLower.includes('marketing')) {
    coachingText = 'As a marketing leader focus on articulating a clear narrative that resonates with your buyer’s fears and ambitions across all channels. Build campaigns around quantified proof and nurture leads through education on the Three Whys. Align closely with sales and product so messaging and assets reinforce one another and refine them based on market feedback.';
  } else if (roleLower.includes('sales')) {
    coachingText = 'As a sales leader ensure your team understands the Three Whys and can articulate them in conversations of varying lengths. Coach reps to lead with emotion, back it with logic and tailor differentiation based on buyer persona. Regularly gather feedback from prospects and customers to refine your message and improve win rates.';
  } else if (roleLower.includes('ceo') || roleLower.includes('chief executive')) {
    coachingText = 'As a CEO your role is to champion a unified value proposition across the organisation. Align product, marketing and sales around a shared narrative and ensure resources support timely execution. Emphasise the organisational urgency, link the value story to strategic goals and model the behaviour you expect from your teams in every customer interaction.';
  } else {
    coachingText = 'As a business leader align with cross‑functional teams to build a unified value story. Ensure your personal objectives support the broader go‑to‑market strategy and contribute feedback to improve the value proposition. Encourage collaboration and continuous learning to help the organisation advance its message.';
  }
  // Provide short explanations for each coaching subsection
  const headlineExplain = 'Craft a short, emotional hook that captures your buyer’s attention and summarises the change you enable. Make it memorable and aspirational.';
  const urgencyExplain = 'Explain why acting now matters. Link the buyer’s pain to near‑term risks or opportunities and demonstrate the cost of delay.';
  const differentiatorsExplain = 'List two to three unique capabilities and include at least one proof point, such as a case study or metric, to show how you stand out.';
  const valueOutlineExplain = 'Break down the quantitative value: baseline metrics, expected lift and payback period. Use real data or reasonable assumptions for credibility.';
  // Generic SalesSparx pitch
  const salesSparxText = 'SalesSparx can partner with you to unify your go‑to‑market messaging, build a bespoke value calculator and coach your team on delivering a consistent, compelling narrative that drives adoption and revenue.';
  const result = {
    profile,
    averageScore: avgScore,
    band,
    executiveSummary,
    dimensions: dims,
    coaching: {
      headline: 'Elevate your value proposition',
      headlineExplain,
      urgency: 'Clarify the stakes and link your roadmap to near‑term outcomes.',
      urgencyExplain,
      differentiators: 'Highlight unique capabilities and proof points that set you apart.',
      differentiatorsExplain,
      valueOutline: 'Define baseline metrics, lift assumptions and payback timeframe.',
      valueOutlineExplain,
      coachingText,
      salesSparxText,
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
      const { profile, answers, attachments } = JSON.parse(body || '{}');
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
        /*
         * Instruct the model to act as a seasoned sales, marketing and product strategist.
         * The goal is to evaluate the user’s value proposition using the Three Whys
         * framework and deliver a structured report. Incorporate key principles
         * from the SalesSparx FUSE methodology: a value proposition must answer
         * Why change?, Why now? and Why your company? Always make the buyer the
         * hero of the story, not your organisation. Lead with emotion (fear and
         * ambition are common drivers) and reinforce with quantitative facts.
         * Follow the sequence: establish the need to change, create urgency to
         * act now and then explain why your company uniquely solves the problem.
         * If a response is empty or contains phrases like “I don’t know”,
         * “unknown”, “none”, “n/a”, “inexistent”, or similar, treat it as
         * unknown and assign the lowest maturity score (1 = None). Provide an
         * explanation that encourages the user to gather information before
         * progressing. Utilise any attached documents and the provided
         * answers to form your analysis and grounding. Use a maturity scale
         * where 1 = None, 2 = Emerging, 3 = Basic, 4 = Advanced and 5 = Leading.
         * For each dimension assign an integer score, compute the average and
         * determine the corresponding band (None, Emerging, Basic, Advanced,
         * Leading). Write an executive summary (~75 words) that explains why
         * the band was assigned. Then produce a table that includes a “why
         * this level” (~45 words) and a “how to reach next level” (~45 words)
         * column for every dimension. After the table, craft a role‑tailored
         * coaching paragraph beginning with “As a …” (at least 40 words) that
         * provides personalised guidance. Follow this with four subsections
         * labelled Headline, Urgency, Differentiators and Value Calculation
         * Outline, each with a short explanatory description (20–30 words).
         * Next, include a suggested final value proposition and at least
         * three next actions to improve the value proposition. Also include a
         * salesSparxText field describing how SalesSparx can support the client.
         * Return the final report as a JSON object matching the expected
         * schema. Do not include any additional commentary or formatting.
         */
        content: 'You are an expert consultant specialising in sales, marketing and product messaging. You evaluate value propositions using the Three Whys framework. Follow the SalesSparx guidance: answer Why change, Why now and Why your company; make the buyer the hero; lead with emotion (fear and ambition) and back with data; and observe the sequence of the Three Whys. Treat empty or unknown answers (e.g., “I don’t know”, “unknown”, “none”, “inexistent”, “n/a”) as None (score 1) and explain that the user needs to gather more information. Use the user’s responses and any attached documents to assess each dimension. Assign integer scores from 1 to 5 corresponding to None, Emerging, Basic, Advanced or Leading. Compute the average and band. Write a ~75‑word executive summary. Build a table per dimension with ~45‑word explanations for why this level was assigned and ~45‑word suggestions for how to reach the next level. Provide a role‑tailored coaching paragraph (≥40 words) starting with “As a …” followed by four subsections (Headline, Urgency, Differentiators, Value Calculation Outline) with 20–30‑word instructions. Include a suggested final value proposition, at least three next actions and a salesSparxText field. Respond solely with JSON in the specified schema.'
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
        // If attachments are provided for this question include their names and a
        // truncated content sample to help the model understand the context.
        if (attachments && attachments[key] && attachments[key].content) {
          const fileName = attachments[key].name;
          const contentSample = attachments[key].content.slice(0, 200);
          promptContent += `Attached file (${fileName}) sample: ${contentSample}\n`;
        }
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
