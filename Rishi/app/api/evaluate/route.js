const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBxyItG1mGXYg89uiCaGGl1mQSfSGxkJ60"
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Great job completing the solution!"
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    return "Great job completing the solution! Keep practicing to improve your skills."
  }
}

export async function POST(request) {
  try {
    const { code, language, problem, skillLevel, hintsUsed, userApproach, timeComplexity, spaceComplexity } =
      await request.json()

    if (!code || !problem || !timeComplexity || !spaceComplexity) {
      return Response.json(
        {
          success: false,
          error: "Code, problem, and complexity analysis are required",
        },
        { status: 400 },
      )
    }

    const prompt = `You are an AI coding mentor providing a comprehensive evaluation of a student's solution. DO NOT use placeholder names like [Student Name] - address them directly.

Problem: ${problem.title}
${problem.description}

Student's Solution (${language}):
${code}

Student's Complexity Analysis (their guess - may be wrong):
- Time Complexity: ${timeComplexity}
- Space Complexity: ${spaceComplexity}

Student Details:
- Skill Level: ${skillLevel}
- Hints Used: ${hintsUsed}
- Initial Approach: ${userApproach || "Not provided"}

IMPORTANT: The student may have provided incorrect complexity analysis. Your job is to:
1. Analyze the actual complexity of their code
2. If their analysis is wrong, gently correct it and explain why
3. If their analysis is right, praise their understanding

Provide a detailed evaluation covering:

1. **Solution Correctness**: Does the solution solve the problem correctly?
2. **Complexity Analysis**: 
   - What is the ACTUAL time and space complexity of their code?
   - Is their provided analysis correct? If not, explain the correct complexity and why
   - Teach them how to analyze complexity step by step
3. **Code Quality**: Is the code clean, readable, and well-structured?
4. **Optimization Opportunities**: What specific optimizations could improve this solution?
5. **Alternative Approaches**: Mention other ways to solve this problem with different complexities
6. **Learning Progress**: How well did they perform for their skill level?

Structure your response as a friendly but thorough code review. Be encouraging while pointing out areas for improvement. Adjust your feedback tone based on the skill level:
- Beginner: Very encouraging, focus on what they did well, gentle corrections for complexity
- Intermediate: Balanced feedback, push for better practices and optimization
- Advanced: More critical analysis, expect high standards, discuss advanced concepts

After the evaluation, provide specific optimization hints and suggestions for improvement.

Address the student directly without using placeholder names. If their complexity analysis was wrong, make sure to teach them the correct way to analyze it.`

    const evaluation = await callGeminiAPI(prompt)

    return Response.json({
      success: true,
      evaluation,
    })
  } catch (error) {
    console.error("Evaluate API Error:", error)
    return Response.json(
      {
        success: false,
        error: "Failed to evaluate solution",
      },
      { status: 500 },
    )
  }
}
