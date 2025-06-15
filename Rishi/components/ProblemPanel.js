"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ProblemPanel({ problem, onProblemLoad, skillLevel, onInitialMessage }) {
  const [inputMode, setInputMode] = useState("paste") // paste or leetcode
  const [problemText, setProblemText] = useState("")
  const [leetcodeNumber, setLeetcodeNumber] = useState("")
  const [loading, setLoading] = useState(false)

  const handlePasteProblem = () => {
    if (!problemText.trim()) return

    // Parse the pasted problem
    const lines = problemText.split("\n")
    const title = lines[0] || "Custom Problem"
    const description = problemText

    // Generate basic test cases from the problem text
    const testCases = generateTestCases(problemText)

    const parsedProblem = {
      id: "custom",
      title,
      description,
      difficulty: skillLevel,
      testCases,
      constraints: extractConstraints(problemText),
    }

    onProblemLoad(parsedProblem)

    // Send initial AI message after problem is loaded
    setTimeout(() => {
      onInitialMessage(parsedProblem, skillLevel)
    }, 500)
  }

  const handleLeetcodeFetch = async () => {
    if (!leetcodeNumber.trim()) return

    setLoading(true)
    try {
      const response = await fetch("/api/leetcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemNumber: leetcodeNumber }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          onProblemLoad(data.problem)

          // Send initial AI message after problem is loaded
          setTimeout(() => {
            onInitialMessage(data.problem, skillLevel)
          }, 500)
        } else {
          // Fallback to sample problem for demo
          const sampleProblem = getSampleProblem(leetcodeNumber)
          onProblemLoad(sampleProblem)

          setTimeout(() => {
            onInitialMessage(sampleProblem, skillLevel)
          }, 500)
        }
      } else {
        // Fallback to sample problem
        const sampleProblem = getSampleProblem(leetcodeNumber)
        onProblemLoad(sampleProblem)

        setTimeout(() => {
          onInitialMessage(sampleProblem, skillLevel)
        }, 500)
      }
    } catch (error) {
      console.error("Error fetching LeetCode problem:", error)
      // Fallback to sample problem
      const sampleProblem = getSampleProblem(leetcodeNumber)
      onProblemLoad(sampleProblem)

      setTimeout(() => {
        onInitialMessage(sampleProblem, skillLevel)
      }, 500)
    } finally {
      setLoading(false)
    }
  }

  const generateTestCases = (text) => {
    // Simple test case generation logic
    const examples = text.match(/Example \d+:[\s\S]*?(?=Example \d+:|$)/g) || []
    return examples.map((example, index) => {
      const inputMatch = example.match(/Input:\s*(.+)/i)
      const outputMatch = example.match(/Output:\s*(.+)/i)

      return {
        id: index + 1,
        input: inputMatch ? inputMatch[1].trim() : "",
        expectedOutput: outputMatch ? outputMatch[1].trim() : "",
        explanation: example.includes("Explanation:") ? example.split("Explanation:")[1]?.trim() : "",
      }
    })
  }

  const extractConstraints = (text) => {
    const constraintMatch = text.match(/Constraints?:([\s\S]*?)(?=\n\n|$)/i)
    return constraintMatch ? constraintMatch[1].trim() : ""
  }

  const getSampleProblem = (number) => {
    // Sample problems for demo
    const sampleProblems = {
      1: {
        id: "1",
        title: "Two Sum",
        description: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.

Example 1:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].

Example 2:
Input: nums = [3,2,4], target = 6
Output: [1,2]

Example 3:
Input: nums = [3,3], target = 6
Output: [0,1]

Constraints:
2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.`,
        difficulty: "Easy",
        testCases: [
          { id: 1, input: "nums = [2,7,11,15], target = 9", expectedOutput: "[0,1]" },
          { id: 2, input: "nums = [3,2,4], target = 6", expectedOutput: "[1,2]" },
          { id: 3, input: "nums = [3,3], target = 6", expectedOutput: "[0,1]" },
        ],
      },
    }

    return sampleProblems[number] || sampleProblems["1"]
  }

  return (
    <div className="h-1/2 p-4 overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle>Problem Input</CardTitle>
          <Tabs value={inputMode} onValueChange={setInputMode}>
            <TabsList>
              <TabsTrigger value="paste">Copy-Paste</TabsTrigger>
              <TabsTrigger value="leetcode">LeetCode</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="space-y-4">
              <Textarea
                placeholder="Paste your problem statement here..."
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                rows={6}
              />
              <Button onClick={handlePasteProblem} disabled={!problemText.trim()}>
                Load Problem
              </Button>
            </TabsContent>

            <TabsContent value="leetcode" className="space-y-4">
              <Input
                placeholder="Enter LeetCode problem number (e.g., 1)"
                value={leetcodeNumber}
                onChange={(e) => setLeetcodeNumber(e.target.value)}
              />
              <Button onClick={handleLeetcodeFetch} disabled={!leetcodeNumber.trim() || loading}>
                {loading ? "Fetching..." : "Fetch Problem"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardHeader>

        {problem && (
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{problem.title}</h3>
                <span
                  className={`inline-block px-2 py-1 rounded text-xs ${
                    problem.difficulty === "Easy"
                      ? "bg-green-100 text-green-800"
                      : problem.difficulty === "Medium"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {problem.difficulty}
                </span>
              </div>

              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm">{problem.description}</pre>
              </div>

              {problem.testCases && problem.testCases.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Test Cases:</h4>
                  <div className="space-y-2">
                    {problem.testCases.map((testCase) => (
                      <div key={testCase.id} className="bg-gray-50 p-2 rounded text-sm">
                        <div>
                          <strong>Input:</strong> {testCase.input}
                        </div>
                        <div>
                          <strong>Output:</strong> {testCase.expectedOutput}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
