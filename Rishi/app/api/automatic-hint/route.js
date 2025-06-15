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
          temperature: 0.6,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 200, // Keep hints short
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    return ""
  }
}

function analyzeCodeProgress(code, problem) {
  const codeLines = code.split("\n").filter((line) => line.trim().length > 0)
  const codeLength = code.trim().length

  // Analyze what the user has written
  const analysis = {
    hasFunction: /function\s+\w+|def\s+\w+|public\s+\w+/.test(code),
    hasLoop: /for\s*\(|while\s*\(|for\s+\w+\s+in/.test(code),
    hasConditional: /if\s*\(/.test(code),
    hasReturn: /return\s+/.test(code),
    hasVariables: /let\s+\w+|const\s+\w+|var\s+\w+|\w+\s*=/.test(code),
    hasComments: /\/\/|\/\*|#/.test(code),
    linesOfCode: codeLines.length,
    totalLength: codeLength,
    isEmpty: codeLength < 20,
    isJustStarting: codeLength < 50,
    hasBasicStructure: codeLength > 50 && codeLength < 200,
    isWellDeveloped: codeLength > 200,
  }

  return analysis
}

function getContextualHints(analysis, problem, skillLevel) {
  const hints = []

  // Stage-based hints
  if (analysis.isEmpty) {
    return [] // Don't give hints for empty code
  }

  if (analysis.isJustStarting) {
    hints.push("Start by understanding the input and expected output format")
    hints.push("Think about what data structure would be most helpful here")
    hints.push("Consider writing the function signature first")
  } else if (analysis.hasBasicStructure) {
    if (!analysis.hasLoop && problem.description.toLowerCase().includes("array")) {
      hints.push("You might need to iterate through the array")
    }
    if (!analysis.hasConditional) {
      hints.push("Consider what conditions you need to check")
    }
    if (!analysis.hasReturn) {
      hints.push("Don't forget to return the result")
    }
  } else if (analysis.isWellDeveloped) {
    hints.push("Test your logic with the given examples")
    hints.push("Consider edge cases like empty inputs")
    hints.push("Think about the time complexity of your approach")
  }

  // Problem-specific hints
  if (problem.title.toLowerCase().includes("two sum")) {
    if (!code.includes("Map") && !code.includes("{}") && !code.includes("dict")) {
      hints.push("A hash map could help you find pairs efficiently")
    }
  }

  // Skill-level specific hints
  if (skillLevel === "beginner") {
    hints.push("Take it step by step - you're doing great!")
  } else if (skillLevel === "advanced") {
    hints.push("Can you optimize this further?")
  }

  return hints
}

export async function POST(request) {
  try {
    const { code, problem, skillLevel, language, sessionState } = await request.json()

    if (!code || !problem || sessionState !== "coding") {
      return Response.json({ success: false, hint: "" })
    }

    // Analyze the current code
    const analysis = analyzeCodeProgress(code, problem)

    // Get contextual hints based on analysis
    const contextualHints = getContextualHints(analysis, problem, skillLevel)

    if (contextualHints.length === 0) {
      return Response.json({ success: false, hint: "" })
    }

    // Use AI to generate a more specific hint
    const prompt = `You are an AI coding mentor providing a brief, contextual hint. Analyze the student's current code progress and give ONE specific, actionable hint.

Problem: ${problem.title}
${problem.description}

Student's Current Code (${language}):
${code}

Code Analysis:
- Has function: ${analysis.hasFunction}
- Has loop: ${analysis.hasLoop}
- Has conditional: ${analysis.hasConditional}
- Has return: ${analysis.hasReturn}
- Lines of code: ${analysis.linesOfCode}
- Development stage: ${analysis.isJustStarting ? "Just starting" : analysis.hasBasicStructure ? "Basic structure" : "Well developed"}

Student skill level: ${skillLevel}

Contextual suggestions: ${contextualHints.join(", ")}

Provide ONE brief, specific hint (max 15 words) that helps them with their next step. Focus on what they should do next based on their current progress. Don't give away the solution.

Examples of good hints:
- "Try using a hash map to store values you've seen"
- "Add a loop to iterate through the array"
- "Check if your indices are within bounds"
- "Consider what happens with duplicate values"

Return ONLY the hint text, nothing else.`

    const hint = await callGeminiAPI(prompt)

    // Clean and validate the hint
    const cleanHint = hint.trim().replace(/^["']|["']$/g, "") // Remove quotes

    // Don't show hint if it's too generic or empty
    if (!cleanHint || cleanHint.length < 10 || cleanHint.toLowerCase().includes("hint:")) {
      // Fallback to contextual hints
      const randomHint = contextualHints[Math.floor(Math.random() * contextualHints.length)]
      return Response.json({ success: true, hint: randomHint })
    }

    return Response.json({ success: true, hint: cleanHint })
  } catch (error) {
    console.error("Automatic Hint API Error:", error)
    return Response.json({ success: false, hint: "" })
  }
}
