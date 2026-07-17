export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ passed: false, reason: 'Method Not Allowed', category: 'malware' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ passed: false, reason: 'URL IS REQUIRED', category: 'malware' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[AI Scan] WARNING: GEMINI_API_KEY environment variable is not set. Safety scan bypassed.');
      return res.status(200).json({
        passed: true,
        reason: 'API KEY NOT SET',
        category: 'safe'
      });
    }

    console.log(`[AI Scan] Initiating visual screenshot safety scan for: ${url}`);

    // 1. Fetch screenshot of target URL using Microlink API
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true`;
    const microRes = await fetch(microlinkUrl);
    
    if (!microRes.ok) {
      throw new Error(`Microlink crawler responded with status: ${microRes.statusText}`);
    }

    const microData = await microRes.json();
    const screenshotUrl = microData.data?.screenshot?.url;

    if (!screenshotUrl) {
      throw new Error('Screenshot URL not returned by Microlink crawler.');
    }

    console.log(`[AI Scan] Download screenshot from: ${screenshotUrl}`);

    // 2. Fetch the screenshot image bytes and convert to Base64
    const imgRes = await fetch(screenshotUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download screenshot image from proxy: ${imgRes.statusText}`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // 3. Prompt Gemini 1.5 Flash to classify the screenshot for visual threats
    const prompt = `
      You are a cybersecurity safety scanner. Analyze this screenshot of the website at URL: "${url}".
      Check if the website matches any of these threat profiles:
      - Phishing: A portal that mimics a bank login, social media login, or major brand site but is hosted on a foreign/unrelated domain.
      - Malware: A site offering browser hacks, virus programs, or suspicious executable downloads.
      - NSFW/Adult: Explicit pornographic material or highly sexually suggestive webcam/decoy pages.
      
      You MUST respond strictly in JSON format matching this schema:
      {
        "passed": boolean (true if the site is clean and safe, false if it is phishing, malware, or adult/NSFW),
        "reason": string (if passed is false, explain the detected threat in 1 brief sentence. If passed is true, leave empty),
        "category": string (one of: "safe", "phishing", "malware", "nsfw")
      }
    `;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiRes.ok) {
      throw new Error(`Gemini API error: ${geminiRes.statusText}`);
    }

    const geminiData = await geminiRes.json();
    const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      throw new Error('No classification text returned from Gemini API.');
    }

    const verdict = JSON.parse(resultText.trim());
    console.log(`[AI Scan] Scan complete. Verdict:`, verdict);

    return res.status(200).json(verdict);

  } catch (error) {
    console.error('[AI Scan Error]:', error);
    // Graceful fallback to prevent user submissions from being blocked if the scan fails
    return res.status(200).json({
      passed: true,
      reason: `Scan bypassed due to internal error: ${error.message}`,
      category: 'safe'
    });
  }
}
