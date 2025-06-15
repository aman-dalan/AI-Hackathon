const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent"

async function callGeminiAPI(prompt) {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 512,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Try breaking down the problem into smaller steps."
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    return "Consider what data structure might help you solve this efficiently."
  }
}

const FALLBACK_HINTS = {
  beginner: [
    "Think about what data structure could help you store and retrieve information quickly",
    "Consider if you need to check every possible combination or if there's a smarter way",
    "What information do you need to keep track of as you go through the problem?",
    "Try to break the problem into smaller, simpler steps",
  ],
  intermediate: [
    "What's the time complexity of your current approach? Can you do better?",
    "Consider using a hash map to reduce lookup time",
    "Think about whether sorting the input first might help",
    "Are there any patterns or mathematical properties you can exploit?",
  ],
  advanced: [
    "Can you achieve better than O(n²) time complexity?",
    "Consider if this problem has optimal substructure for dynamic programming",
    "Think about space-time trade-offs in your approach",
    "Are there any advanced data structures that could optimize this?",
  ],
}

export async function POST(request) {
  try {
    const { problem, skillLevel, code, sessionState, hintsUsed } = await request.json()

    if (!problem) {
      return Response.json({ error: "Problem is required" }, { status: 400 })
    }

    const prompt = `Provide a helpful hint for this coding problem. Don't give the complete solution.

Problem: ${problem?.title}
${problem?.description || ""}
Current code: ${code || "No code yet"}
Skill level: ${skillLevel}
Session state: ${sessionState}

Give a specific, actionable hint that helps them move forward without revealing the solution.`

    try {
      const hint = await callGeminiAPI(prompt)
      return Response.json({ success: true, hint })
    } catch (error) {
      // Fallback to predefined hints
      const hints = FALLBACK_HINTS[skillLevel] || FALLBACK_HINTS.beginner
      const hint = hints[hintsUsed % hints.length]
      return Response.json({ success: true, hint })
    }
  } catch (error) {
    console.error("Hint API Error:", error)
    return Response.json({ error: "Failed to generate hint" }, { status: 500 })
  }
}
