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
  // Define tailored messaging for each category and level
  const messageTemplates = {
    'Why change': {
      None: {
        why: 'Your answer is missing or expresses uncertainty about the buyer or their pain. Without identifying who you serve and what problem they face, there is no foundation for explaining why a change is needed. This dimension remains unaddressed because there is nothing to evaluate.',
        how: 'Start by researching your ideal buyer and documenting their top pain points. Talk to customers to uncover the emotional drivers behind the problem and quantify its impact. Use those insights to craft a clear statement about why the status quo is unacceptable and change is necessary.'
      },
      Emerging: {
        why: 'You hint at a buyer or problem, but the connection is shallow. You don’t describe the person, the context or the consequences of the pain. As a result, readers cannot understand why this issue matters or why your buyer should pay attention.',
        how: 'Clarify who your buyer is and describe their pain in vivid detail. Explain how the problem affects their goals and well‑being. Use anecdotes or data to show the scale of the pain and why it cannot be ignored. This will strengthen your case for change.'
      },
      Basic: {
        why: 'You identify the buyer and state a clear pain, but the description is surface‑level. It lacks depth about the emotional stakes or the quantifiable cost of the problem. Without deeper insight, it fails to inspire action or convey urgency.',
        how: 'Deepen your explanation by highlighting the emotions driving the buyer’s pain and quantifying the cost of inaction. Add customer stories or industry statistics. Show empathy for the buyer’s struggle and connect the pain to concrete business outcomes to motivate change.'
      },
      Advanced: {
        why: 'You articulate the buyer and their pain with a good balance of storytelling and data. However, the answer could benefit from unique insights or broader industry context that underscores the problem’s significance. Without fresh perspectives, it might still feel generic.',
        how: 'Enrich your narrative with proprietary research or market trends that show why the pain persists. Connect the buyer’s frustration to larger industry shifts and emphasise why existing solutions fall short. Position your insight as uniquely suited to address these deeper challenges.'
      },
      Leading: {
        why: 'Your description of the buyer’s pain is comprehensive and compelling. It seamlessly blends empathy with quantifiable evidence, making a persuasive case for change. You demonstrate deep understanding of the buyer’s world and why the current situation cannot stand.',
        how: 'Continue to refine your insights by gathering ongoing feedback from buyers. Share new stories and data to keep your narrative fresh. Ensure all internal teams align on this message and adapt it as your market evolves, reinforcing your leadership position.'
      }
    },
    'Why now': {
      None: {
        why: 'You did not identify any trigger or sense of urgency. Without specifying what makes this issue critical in the next months, there is no reason to prioritise it. The urgency dimension cannot be scored without context.',
        how: 'Look for specific triggers that make acting in the next three to six months essential. These could be competitive threats, regulatory deadlines, market trends or budget cycles. Explain how waiting would hurt the buyer and quantify the implications of delay.'
      },
      Emerging: {
        why: 'You suggest a reason to act now, but the explanation lacks depth and connection to the buyer’s business. The urgency feels generic and does not convey why action within the next months is critical.',
        how: 'Describe the catalyst that makes this issue urgent and tie it to tangible consequences. Use stories or data showing the impact of recent market changes or upcoming deadlines. Highlight what happens if action is delayed beyond a three‑to‑six‑month window.'
      },
      Basic: {
        why: 'You provide a reason to act now, but it lacks evidence or emotional resonance. The trigger is stated but not fully explored or linked to the buyer’s pain. As a result, the sense of urgency remains moderate.',
        how: 'Strengthen the urgency by quantifying the costs of delay and linking the trigger to milestones in the buyer’s world—such as budget cycles, strategic reviews or industry shifts. Show how acting now will provide a competitive advantage while procrastination leads to risk.'
      },
      Advanced: {
        why: 'You clearly explain the triggers and urgency, combining emotional and logical elements. However, the narrative may still rely on common examples. Adding proprietary data or visionary insights could make the urgency more distinctive.',
        how: 'Provide specific statistics or case studies showing the benefits of acting promptly and the risks of waiting. Connect the urgency to broader industry shifts and illustrate your foresight in anticipating these changes. Make the argument for immediate action feel inevitable.'
      },
      Leading: {
        why: 'Your urgency narrative is compelling and credible. It integrates internal pressures and external market forces, backed by data and emotional resonance. The reader clearly understands the cost of inaction and the need to move quickly.',
        how: 'Keep your urgency story current by monitoring new market signals and buyer priorities. Update your narrative with fresh insights and align stakeholders around the timeline. Use your foresight to predict emerging trends and maintain urgency at the forefront of discussions.'
      }
    },
    'Why your company': {
      None: {
        why: 'You provide no explanation of why your company is uniquely qualified. Without differentiators or proof, there is nothing to evaluate. This dimension is left unanswered.',
        how: 'Identify two or three qualities that set your company apart, such as expertise, technology or methodology. Provide a proof point—like a customer testimonial or performance statistic—that validates each differentiator. This will begin to establish credibility.'
      },
      Emerging: {
        why: 'You mention a differentiator but fail to show how it connects to the buyer’s problem. There is no evidence or context, making the claim feel generic. Your credibility remains unestablished.',
        how: 'Relate your differentiators to the buyer’s pain. Explain why they matter and how they uniquely address the problem. Support your claims with proof, such as case studies, awards or metrics. Focus on the buyer’s perspective rather than internal achievements.'
      },
      Basic: {
        why: 'You list differentiators and a proof point, but you don’t explain why they matter to the buyer. The narrative feels like a checklist rather than a tailored argument. The buyer may still question your relevance.',
        how: 'Translate each differentiator into a buyer benefit. Describe how your track record with similar customers demonstrates your ability to solve their problem. Highlight your purpose or mission and why it aligns with the buyer’s values or ambitions.'
      },
      Advanced: {
        why: 'You explain why your company is the right partner with a balance of differentiators and evidence. However, the narrative could include more unique insights or emotional appeal to stand out from competitors.',
        how: 'Deepen your story by sharing your company’s origin, mission and vision, and showing how they resonate with the buyer’s ambitions. Introduce thought leadership or innovative practices that prove your commitment to solving the problem in a unique way.'
      },
      Leading: {
        why: 'You deliver a compelling and inspiring explanation of why your company is uniquely suited to help. Differentiators are clear, proof is strong and the story resonates emotionally. You establish trust and excitement.',
        how: 'Maintain your edge by continuously innovating and refining your differentiators. Gather new customer success stories and third‑party validation. Stay true to your mission and show how your culture and values empower the buyer’s success.'
      }
    },
    'Emotion–Logic': {
      None: {
        why: 'You provided no emotional hook or logical statement. Without a headline, there is no demonstration of your ability to lead with emotion and support with logic. This leaves us unable to assess this dimension.',
        how: 'Develop a concise headline that evokes an emotion (fear, ambition, relief) while hinting at the change you enable. Follow it with a logical benefit or fact. Keep it short, inspiring and aligned with your buyer’s pain.'
      },
      Emerging: {
        why: 'Your headline is extremely brief or generic. It lacks emotional resonance and fails to connect to a logical benefit. As a result, it does not capture attention or convey your value proposition.',
        how: 'Rewrite the headline to focus on the buyer’s emotions. Use vivid language that paints a picture of the desired change. Then add a logical element, such as a quantifiable outcome, to show the benefit of acting.'
      },
      Basic: {
        why: 'You produce a headline that hints at either emotion or logic, but not both. It shows some understanding of the need to hook and justify, yet the message feels unbalanced or uninspiring.',
        how: 'Balance your headline by combining an emotional driver with a logical payoff. For example, start with a phrase that stirs fear or ambition and end with a measurable result. Test different versions and refine based on feedback.'
      },
      Advanced: {
        why: 'Your headline effectively blends emotion and logic, but it may rely on standard phrasing or lack unique flair. It is good but not yet memorable or distinctive.',
        how: 'Add a distinctive element such as a surprising statistic, a play on words, or a narrative twist that makes your headline stand out. Ensure it aligns with your brand and resonates with your specific buyer segment.'
      },
      Leading: {
        why: 'Your headline is exceptional. It is short, memorable and conveys both the emotional journey and the logical benefit. It instantly communicates the transformation you offer and inspires immediate attention.',
        how: 'Keep experimenting with creative expressions as your offerings evolve. Use A/B testing to optimise the phrasing for different contexts. Train your team to use this headline consistently and adapt it for various channels and audiences.'
      }
    },
    'Buyer‑as‑hero': {
      None: {
        why: 'You did not quantify any outcomes or articulate assumptions, leaving no story about the buyer’s journey or success. Without numbers or context, the buyer’s hero’s journey is absent.',
        how: 'Quantify at least two outcomes your solution delivers—such as time saved, revenue gained, or risks avoided. State the assumptions behind your numbers, like team size or baseline metrics. Frame your buyer as the hero whose success grows through these results.'
      },
      Emerging: {
        why: 'You mention outcomes but fail to provide numbers or tie them to the buyer’s story. The benefits feel abstract and the buyer does not see themselves in the narrative.',
        how: 'Provide specific metrics that illustrate the impact of your solution. Explain how these improvements elevate the buyer’s status, performance or well‑being. Use transparent assumptions and show the before‑and‑after transformation.'
      },
      Basic: {
        why: 'You share some metrics but they are generic or disconnected from the buyer’s goals. The story does not clearly position the buyer as the hero achieving these results. It feels like a list of benefits rather than a personal journey.',
        how: 'Relate each metric to the buyer’s objectives and responsibilities. Show how improved time, revenue or risk reduction makes the buyer more effective or respected. Provide context—such as current benchmarks—to demonstrate the significance of the gains.'
      },
      Advanced: {
        why: 'You present credible metrics and assumptions and begin to tell a story. However, the narrative could be more inspiring and specific. It may rely on general statistics rather than an evocative hero journey.',
        how: 'Frame the buyer’s journey as overcoming a challenge with your solution. Use case studies or anecdotes to illustrate real customers achieving these outcomes. Make sure the story highlights personal growth and professional impact.'
      },
      Leading: {
        why: 'You create a powerful, data‑driven story that clearly shows the buyer as the hero. The metrics are meaningful and the narrative inspires confidence and pride. This sets a high bar for storytelling.',
        how: 'Continue collecting success stories and updating your metrics. Tailor your narrative for different buyer personas so they can envision their own victory. Use multimedia assets like quotes or short videos to deepen the emotional connection.'
      }
    },
    'Clarity': {
      None: {
        why: 'You did not provide a one‑sentence value proposition or indicated you do not have one. Without a concise statement of who you serve, the problem and the benefit, we cannot assess clarity. This dimension is unaddressed.',
        how: 'Compose a clear, single sentence that names your buyer, states the problem you solve and describes the impact you deliver. Eliminate jargon and aim for simplicity. This sentence should be easy to remember and form the core of your messaging.'
      },
      Emerging: {
        why: 'Your value proposition is vague or incomplete. It may lack one or more of the essential elements: the buyer, the problem or the impact. It reads like a tagline and does not provide clarity.',
        how: 'Rewrite your sentence to explicitly mention the audience, the pain and the benefit in plain language. Avoid buzzwords. Provide context or numbers to make the proposition feel real. This will sharpen the clarity and focus of your message.'
      },
      Basic: {
        why: 'You provide a value proposition that covers the basics but it is generic and fails to highlight what makes you unique. The wording may be formulaic or reliant on common phrases.',
        how: 'Refine the sentence to emphasise your unique approach or differentiator. Use active voice and incorporate a hint of emotion. Ensure that it flows naturally and stands out from typical statements. Test it with customers to ensure it resonates.'
      },
      Advanced: {
        why: 'You craft a concise and distinctive value proposition that clearly states the buyer, problem and impact. It is strong but could include a bit more specificity or creativity to be truly outstanding.',
        how: 'Add a unique detail like a metric, proprietary method or compelling adjective that makes your value proposition unforgettable. Align the tone with your brand personality and ensure it resonates across multiple buyer personas.'
      },
      Leading: {
        why: 'Your value proposition is succinct, unique and magnetic. It clearly communicates who you serve, what you solve and how you transform the buyer’s world. It stands out and stays in the mind.',
        how: 'Continue to iterate as your offering evolves and your market changes. Use the one‑sentence value proposition as a north star for all messaging. Encourage team members to internalise and deliver it consistently.'
      }
    }
  };

  categories.forEach((cat) => {
    const ans = (answers[cat.key] || '').trim();
    const wordCount = ans ? ans.split(/\s+/).length : 0;
    let score = 0;
    let level = '';
    const ansLower = ans.toLowerCase();
    const unknownPatterns = [
      "i don't know", 'i don’t know', 'dont know', 'do not know', 'unknown', 'none', 'n/a', 'na',
      'inexistent', 'no idea', 'not sure', 'don’t have', "don't have", 'dont have', 'missing', 'not available',
      'unavailable', 'not provided', 'not existing', 'not exist', 'no data', 'no information', 'not applicable',
      'not present', 'not disposable'
    ];
    // Consider a response unknown only if it is empty or matches one of the patterns exactly.
    // We trim and normalise the answer to lowercase and remove trailing punctuation for comparison.
    const normalised = ansLower.replace(/[^a-z0-9\s]/g, '').trim();
    const isUnknown = normalised.length === 0 || unknownPatterns.includes(normalised);
    if (isUnknown) {
      score = 1;
      level = 'None';
    } else if (wordCount < 15) {
      score = 2;
      level = 'Emerging';
    } else if (wordCount < 40) {
      score = 3;
      level = 'Basic';
    } else if (wordCount < 80) {
      score = 4;
      level = 'Advanced';
    } else {
      score = 5;
      level = 'Leading';
    }
    const catMessages = messageTemplates[cat.name] || {};
    const msg = catMessages[level] || { why: '', how: '' };
    const why = msg.why;
    const how = msg.how;
    totalScore += score;
    dims.push({ name: cat.name, score, level, why, how });
  });
  const avgScore = (totalScore / categories.length).toFixed(1);
  const avgNumeric = parseFloat(avgScore);
  let band = '';
  /*
   * Determine the band using updated thresholds:
   *  1.0–1.9 → None
   *  2.0–2.9 → Emerging
   *  3.0–3.9 → Basic
   *  4.0–4.9 → Advanced
   *  5.0     → Leading
   */
  if (avgNumeric < 2.0) {
    band = 'None';
  } else if (avgNumeric < 3.0) {
    band = 'Emerging';
  } else if (avgNumeric < 4.0) {
    band = 'Basic';
  } else if (avgNumeric < 5.0) {
    band = 'Advanced';
  } else {
    band = 'Leading';
  }
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
  if (roleLower.includes('ceo') || roleLower.includes('chief executive')) {
    coachingText = 'As a CEO your primary responsibility is to champion a unified value proposition across the organisation. Drive alignment between product, marketing and sales around a shared narrative and ensure resources support timely execution. Link the value story to strategic goals, emphasise organisational urgency and model the behaviour you expect from your teams in every interaction.';
  } else if (roleLower.includes('cfo') || roleLower.includes('chief financial')) {
    coachingText = 'As a CFO focus on aligning investment with your value proposition. Use financial metrics to quantify the cost of inaction and the ROI of acting now. Collaborate with revenue and product leaders to ensure budgets support key initiatives and incorporate value calculators into planning. Demonstrate fiscal discipline while enabling growth.';
  } else if (roleLower.includes('cro') || roleLower.includes('chief revenue')) {
    coachingText = 'As a Chief Revenue Officer, you must unify sales, marketing and customer success around a clear value narrative. Tie revenue goals to the Three Whys, drive accountability for consistent messaging and coach teams to balance emotion with logic. Leverage pipeline data to show urgency and guide resource allocation.';
  } else if (roleLower.includes('cso') || roleLower.includes('chief strategy')) {
    coachingText = 'As a Chief Strategy Officer, ensure your value proposition is embedded into strategic planning. Analyse market trends and competitive moves to anticipate why change and why now. Translate insights into actionable initiatives and communicate them clearly so the entire organisation understands its role in delivering on the strategy.';
  } else if (roleLower.includes('cpo') || roleLower.includes('chief product')) {
    coachingText = 'As a Chief Product Officer you must translate product capabilities into business outcomes. Ensure your roadmap tells a cohesive story that reflects real buyer pains and ambitions. Partner with marketing and sales to validate that new features map to customer problems, using interviews and data to uncover emotional drivers and adjust priorities accordingly.';
  } else if (roleLower.includes('cio') || roleLower.includes('chief information')) {
    coachingText = 'As a CIO your role is to enable the technology and data infrastructure that supports your value proposition. Provide analytics to quantify urgency and outcomes, and ensure systems capture customer feedback to refine messaging. Collaborate with product and revenue leaders to prioritise digital investments that reinforce the narrative.';
  } else if (roleLower.includes('cto') || roleLower.includes('chief technology')) {
    coachingText = 'As a CTO focus on the technical innovation that differentiates your company. Communicate how your architecture and product roadmap uniquely address buyer pain points and enable rapid change. Work with product and marketing teams to translate complex features into business value and inspire confidence in your technical vision.';
  } else if (roleLower.includes('chro') || roleLower.includes('chief human')) {
    coachingText = 'As a CHRO align your people strategy with the value proposition. Ensure recruitment, training and performance management emphasise the Three Whys so employees can articulate the message. Foster a culture where teams collaborate across functions to deliver on the promise and recognise behaviours that reinforce the narrative.';
  } else if (roleLower.includes('product')) {
    coachingText = 'As a product leader you should translate product capabilities into business outcomes and ensure your roadmap tells a cohesive story. Partner closely with marketing and sales to validate that new features map to real customer problems. Use interviews and data to uncover emotional drivers and align messaging with market needs, then adapt plans accordingly.';
  } else if (roleLower.includes('marketing')) {
    coachingText = 'As a marketing leader focus on articulating a clear narrative that resonates with your buyer’s fears and ambitions across all channels. Build campaigns around quantified proof and nurture leads through education on the Three Whys. Align closely with sales and product so messaging and assets reinforce one another and refine them based on market feedback.';
  } else if (roleLower.includes('sales') || roleLower.includes('seller')) {
    coachingText = 'As a sales leader ensure your team understands the Three Whys and can articulate them in conversations of varying lengths. Coach reps to lead with emotion, back it with logic and tailor differentiation based on buyer persona. Regularly gather feedback from prospects and customers to refine your message and improve win rates.';
  } else if (roleLower.includes('director')) {
    coachingText = 'As a director you play a critical role in translating high‑level strategy into day‑to‑day execution. Ensure your team understands the value narrative and how their work supports it. Provide feedback from the front lines to refine messaging and coordinate cross‑functional initiatives that reinforce the Three Whys.';
  } else {
    coachingText = 'As a business leader align with cross‑functional teams to build a unified value story. Ensure your objectives support the broader go‑to‑market strategy and contribute feedback to improve the value proposition. Encourage collaboration and continuous learning to help the organisation advance its message.';
  }
  // Provide short explanations for each coaching subsection
  const headlineExplain = 'Craft a short, emotional hook that captures your buyer’s attention and summarises the change you enable. Make it memorable and aspirational.';
  const urgencyExplain = 'Explain why acting now matters. Link the buyer’s pain to near‑term risks or opportunities and demonstrate the cost of delay.';
  const differentiatorsExplain = 'List two to three unique capabilities and include at least one proof point, such as a case study or metric, to show how you stand out.';
  const valueOutlineExplain = 'Break down the quantitative value: baseline metrics, expected lift and payback period. Use real data or reasonable assumptions for credibility.';
  // Generic SalesSparx pitch
  const salesSparxText = 'SalesSparx can partner with you to unify your go‑to‑market messaging, build a bespoke value calculator and coach your team on delivering a consistent, compelling narrative that drives adoption and revenue.';
  // Determine next actions based on overall band to provide more relevant guidance
  const actionsMap = {
    None: [
      'Identify your target buyer personas and conduct research to understand their pain points.',
      'Determine key triggers that make addressing the problem urgent and document them.',
      'List differentiators and gather at least one proof point (testimonial, statistic) for each.',
      'Draft an emotional headline paired with a logical benefit and refine it through feedback.',
      'Write a concise one‑sentence value proposition stating buyer, pain and outcome.'
    ],
    Emerging: [
      'Interview customers to validate emotional drivers, pain points and urgency triggers.',
      'Collect data to quantify the costs of inaction and refine your urgency narrative.',
      'Document unique differentiators and gather case studies to support each claim.',
      'Experiment with emotional headlines that blend feeling with facts; test internally.',
      'Build a simple value calculator outlining assumptions and expected benefits.'
    ],
    Basic: [
      'Deepen research on buyer emotions and triggers using surveys and analytics.',
      'Strengthen differentiators by adding unique proof points or proprietary insights.',
      'Gather more specific metrics to quantify the outcomes you promise.',
      'Align messaging across product, marketing and sales teams for consistency.',
      'Expand your value calculator to model various buyer scenarios.'
    ],
    Advanced: [
      'Integrate new customer stories and industry trends to keep your narrative fresh.',
      'Add proprietary research or thought leadership to make your urgency story distinctive.',
      'Refine differentiators based on customer feedback and competitive analysis.',
      'Test advanced emotional hooks or storytelling techniques for your headline.',
      'Segment your value calculator by persona to tailor benefits more precisely.'
    ],
    Leading: [
      'Continue innovating and evolving your message to stay ahead of market shifts.',
      'Regularly benchmark your value proposition against industry leaders for inspiration.',
      'Document and share insights internally and externally to reinforce thought leadership.',
      'Collect new success stories and update your metrics to maintain credibility.',
      'Train and coach your team to deliver your value proposition consistently across channels.'
    ]
  };
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
      // Omit the SalesSparx promotional text for a cleaner report
      salesSparxText: '',
      finalValue: answers.q6 ? answers.q6.trim() : 'Craft your value proposition here by clearly stating who you serve, the problem you solve, and the impact you deliver.',
      nextActions: actionsMap[band] || actionsMap['Basic']
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
         * “unknown”, “none”, “n/a”, “inexistent”, “missing”, “not available”,
         * “unavailable”, “not provided”, “not exist”, “no data”, “no information”,
         * or similar, treat it as unknown and assign the lowest maturity score (1 = None). Provide an
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
