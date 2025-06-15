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
          temperature: 0.8,
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Let's work on this problem together!"
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    return "Great! Let's tackle this problem step by step."
  }
}

function getSkillGreeting(skillLevel) {
  const greetings = {
    beginner:
      "I'm excited to help you learn! Don't worry if this seems challenging - we'll break it down together step by step.",
    intermediate: "Great choice! This is a good problem to strengthen your algorithmic thinking. Let's dive in!",
    advanced: "Excellent! This problem has some interesting optimization opportunities. Let's see how you approach it.",
  }
  return greetings[skillLevel] || greetings.beginner
}

export async function POST(request) {
  try {
    const { problem, skillLevel } = await request.json()

    if (!problem) {
      return Response.json(
        {
          success: false,
          error: "Problem is required",
        },
        { status: 400 },
      )
    }

    const skillGreeting = getSkillGreeting(skillLevel)

    const prompt = `You are an AI coding mentor greeting a ${skillLevel} level student who just loaded a new problem. Generate a warm, encouraging initial message.

Problem: ${problem.title}
${problem.description}

Student skill level: ${skillLevel}

Create a personalized greeting that:
1. Welcomes them to the problem
2. Briefly acknowledges the problem type/difficulty 
3. Encourages them to share their initial approach
4. Matches the tone for their skill level (${skillLevel})
5. Is enthusiastic but not overwhelming

Keep it concise (2-3 sentences) and end by asking them to share their approach. Address them directly without placeholder names.

Skill-specific tone: ${skillGreeting}`

    const message = await callGeminiAPI(prompt)

    return Response.json({
      success: true,
      message,
    })
  } catch (error) {
    console.error("Initial Greeting API Error:", error)
    return Response.json(
      {
        success: false,
        error: "Failed to generate initial greeting",
      },
      { status: 500 },
    )
  }
}
