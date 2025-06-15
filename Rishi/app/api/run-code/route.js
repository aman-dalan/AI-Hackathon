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
          temperature: 0.3,
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  } catch (error) {
    console.error("Error calling Gemini API:", error)
    throw error
  }
}

async function executeCode(code, testCases, language) {
  const prompt = `You are a code execution simulator. Analyze the following code and test cases, then simulate execution.

Programming Language: ${language}
Code:
${code}

Test Cases:
${testCases.map((tc) => `Input: ${tc.input}\nExpected Output: ${tc.expectedOutput}`).join("\n\n")}

For each test case, determine:
1. What the actual output would be from this code
2. Whether it matches the expected output
3. Any runtime errors that would occur

Return ONLY a JSON object in this exact format:
{
  "results": [
    {
      "input": "test input",
      "expected": "expected output",
      "actual": "actual output from code",
      "passed": true/false,
      "error": "error message if any, null otherwise"
    }
  ],
  "allPassed": true/false
}

Be precise in your simulation. If the code has syntax errors, logical errors, or would crash, reflect that accurately.`

  try {
    const response = await callGeminiAPI(prompt)

    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])
      return result
    }

    // Fallback if JSON parsing fails
    return {
      results: testCases.map((tc, index) => ({
        input: tc.input,
        expected: tc.expectedOutput,
        actual: "Simulation failed",
        passed: false,
        error: "Could not simulate code execution",
      })),
      allPassed: false,
    }
  } catch (error) {
    console.error("Code execution simulation error:", error)
    return {
      results: testCases.map((tc, index) => ({
        input: tc.input,
        expected: tc.expectedOutput,
        actual: "Error",
        passed: false,
        error: `Execution failed: ${error.message}`,
      })),
      allPassed: false,
    }
  }
}

export async function POST(request) {
  try {
    const { code, language, problem, skillLevel } = await request.json()

    if (!code || !language || !problem) {
      return Response.json(
        {
          success: false,
          error: "Code, language, and problem are required",
        },
        { status: 400 },
      )
    }

    const testCases = problem.testCases || []

    if (testCases.length === 0) {
      return Response.json(
        {
          success: false,
          error: "No test cases available for this problem",
        },
        { status: 400 },
      )
    }

    // Execute the code against test cases
    const executionResult = await executeCode(code, testCases, language)

    return Response.json({
      success: true,
      results: executionResult.results,
      allPassed: executionResult.allPassed,
    })
  } catch (error) {
    console.error("Run Code API Error:", error)
    return Response.json(
      {
        success: false,
        error: "Failed to run code",
      },
      { status: 500 },
    )
  }
}
