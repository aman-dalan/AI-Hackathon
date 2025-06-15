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
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I could not generate a response."
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    return "I apologize, but I encountered an error. Please try again."
  }
}

function getSkillContext(skillLevel) {
  const contexts = {
    beginner:
      "Be very encouraging and provide clear, simple explanations. Focus on basic concepts and don't assume advanced knowledge. Use simple language and break down complex ideas. Address the student directly without using placeholder names.",
    intermediate:
      "Provide balanced feedback. You can reference common algorithms and data structures. Guide them toward optimal solutions. Challenge them to think about efficiency. Address the student directly without using placeholder names.",
    advanced:
      "Act more like an interviewer. Challenge their thinking and ask about complexity analysis. Expect them to know advanced concepts. Be more direct and less hand-holding. Address the student directly without using placeholder names.",
  }
  return contexts[skillLevel] || contexts.beginner
}

function shouldUnlockEditor(response, approach) {
  return (
    response.includes("UNLOCK_EDITOR") ||
    approach.length > 30 ||
    response.toLowerCase().includes("good approach") ||
    response.toLowerCase().includes("correct") ||
    response.toLowerCase().includes("ready to code") ||
    response.toLowerCase().includes("start coding") ||
    response.toLowerCase().includes("implement")
  )
}

export async function POST(request) {
  try {
    const { message, problem, skillLevel, sessionState, code, language, hintsUsed, userApproach } = await request.json()

    if (!message || !problem) {
      return Response.json(
        {
          success: false,
          error: "Message and problem are required",
        },
        { status: 400 },
      )
    }

    let prompt = ""

    if (sessionState === "approach") {
      const skillContext = getSkillContext(skillLevel)
      prompt = `You are an AI coding mentor helping a ${skillLevel} level programmer. DO NOT use placeholder names like [Student Name] - address them directly.

Problem: ${problem?.title || "Coding Problem"}
${problem?.description || ""}

Student's Approach: ${message}

${skillContext}

Evaluate the student's approach and provide feedback. If the approach shows understanding of the problem and has a reasonable direction (even if not optimal), encourage them and unlock the code editor by including "UNLOCK_EDITOR" in your response.

Provide constructive feedback that matches their skill level. Be encouraging but also guide them toward better solutions if needed. Address the student directly without using placeholder names.`
    } else if (sessionState === "coding") {
      const skillContext = getSkillContext(skillLevel)
      prompt = `You are an AI coding mentor. The student is now in the coding phase. DO NOT use placeholder names like [Student Name] - address them directly.

Problem: ${problem?.title}
${problem?.description || ""}

Student's message: ${message}
Current code (${language}):
${code || "No code yet"}

Student's skill level: ${skillLevel}
${skillContext}

The student is asking for help with their code. Analyze their current code and provide helpful guidance. Don't give away the complete solution, but help them debug issues, improve their approach, or understand concepts they're struggling with.

If they're stuck, provide specific hints about what to fix or what to consider next. Address the student directly without using placeholder names.`
    } else {
      prompt = `You are an AI coding mentor providing evaluation feedback. DO NOT use placeholder names like [Student Name] - address them directly.

Student's message: ${message}
Problem: ${problem?.title}
Skill level: ${skillLevel}

Provide thoughtful feedback and suggestions for improvement. Help them reflect on their learning experience. Address the student directly without using placeholder names.`
    }

    const response = await callGeminiAPI(prompt)

    const shouldUnlock = sessionState === "approach" && shouldUnlockEditor(response, message)

    return Response.json({
      success: true,
      response: response.replace("UNLOCK_EDITOR", "").trim(),
      unlockEditor: shouldUnlock,
      newState: shouldUnlock ? "coding" : sessionState,
    })
  } catch (error) {
    console.error("Mentor API Error:", error)
    return Response.json(
      {
        success: false,
        error: "Failed to get mentor response",
      },
      { status: 500 },
    )
  }
}
