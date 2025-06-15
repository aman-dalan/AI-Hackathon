const LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"

const PROBLEM_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      questionFrontendId
      title
      titleSlug
      content
      difficulty
      likes
      dislikes
      exampleTestcases
      sampleTestCase
      metaData
    }
  }
`

const PROBLEM_LIST_QUERY = `
  query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList: questionList(
      categorySlug: $categorySlug
      limit: $limit
      skip: $skip
      filters: $filters
    ) {
      total: totalNum
      questions: data {
        acRate
        difficulty
        freqBar
        frontendQuestionId: questionFrontendId
        isFavor
        paidOnly: isPaidOnly
        status
        title
        titleSlug
        topicTags {
          name
          id
          slug
        }
        hasSolution
        hasVideoSolution
      }
    }
  }
`

async function fetchLeetCodeProblem(problemNumber) {
  try {
    // First, get the problem list to find the title slug
    const listResponse = await fetch(LEETCODE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://leetcode.com/",
      },
      body: JSON.stringify({
        query: PROBLEM_LIST_QUERY,
        variables: {
          categorySlug: "",
          skip: Number.parseInt(problemNumber) - 1,
          limit: 1,
          filters: {},
        },
      }),
    })

    if (!listResponse.ok) {
      throw new Error(`HTTP error! status: ${listResponse.status}`)
    }

    const listData = await listResponse.json()

    if (!listData.data?.problemsetQuestionList?.questions?.length) {
      throw new Error("Problem not found")
    }

    const problemInfo = listData.data.problemsetQuestionList.questions[0]
    const titleSlug = problemInfo.titleSlug

    // Now fetch the detailed problem data
    const detailResponse = await fetch(LEETCODE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://leetcode.com/",
      },
      body: JSON.stringify({
        query: PROBLEM_QUERY,
        variables: {
          titleSlug: titleSlug,
        },
      }),
    })

    if (!detailResponse.ok) {
      throw new Error(`HTTP error! status: ${detailResponse.status}`)
    }

    const detailData = await detailResponse.json()

    if (!detailData.data?.question) {
      throw new Error("Problem details not found")
    }

    const question = detailData.data.question

    // Parse test cases from exampleTestcases
    const testCases = parseTestCases(question.exampleTestcases || question.sampleTestCase || "")

    return {
      id: question.questionFrontendId,
      title: `${question.questionFrontendId}. ${question.title}`,
      description: cleanHtmlContent(question.content || "Content not available"),
      difficulty: problemInfo.difficulty,
      testCases: testCases,
      titleSlug: titleSlug,
    }
  } catch (error) {
    console.error("Error fetching LeetCode problem:", error)
    // Return a fallback problem
    return getSampleProblem(problemNumber)
  }
}

function cleanHtmlContent(html) {
  // Remove HTML tags and decode entities
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim()
}

function parseTestCases(testCaseString) {
  if (!testCaseString) return []

  try {
    const lines = testCaseString.split("\n").filter((line) => line.trim())
    const testCases = []

    // Simple parsing - assumes alternating input/output lines
    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        testCases.push({
          id: Math.floor(i / 2) + 1,
          input: lines[i].trim(),
          expectedOutput: lines[i + 1].trim(),
        })
      }
    }

    return testCases
  } catch (error) {
    console.error("Error parsing test cases:", error)
    return []
  }
}

function getSampleProblem(problemNumber) {
  const sampleProblems = {
    1: {
      id: "1",
      title: "1. Two Sum",
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
    2: {
      id: "2",
      title: "2. Add Two Numbers",
      description: `You are given two non-empty linked lists representing two non-negative integers. The digits are stored in reverse order, and each of their nodes contains a single digit. Add the two numbers and return the sum as a linked list.

You may assume the two numbers do not contain any leading zero, except the number 0 itself.

Example 1:
Input: l1 = [2,4,3], l2 = [5,6,4]
Output: [7,0,8]
Explanation: 342 + 465 = 807.

Example 2:
Input: l1 = [0], l2 = [0]
Output: [0]

Example 3:
Input: l1 = [9,9,9,9,9,9,9], l2 = [9,9,9,9]
Output: [8,9,9,9,0,0,0,1]`,
      difficulty: "Medium",
      testCases: [
        { id: 1, input: "l1 = [2,4,3], l2 = [5,6,4]", expectedOutput: "[7,0,8]" },
        { id: 2, input: "l1 = [0], l2 = [0]", expectedOutput: "[0]" },
        { id: 3, input: "l1 = [9,9,9,9,9,9,9], l2 = [9,9,9,9]", expectedOutput: "[8,9,9,9,0,0,0,1]" },
      ],
    },
  }

  return sampleProblems[problemNumber] || sampleProblems["1"]
}

export async function POST(request) {
  try {
    const { problemNumber } = await request.json()

    if (!problemNumber) {
      return Response.json({ error: "Problem number is required" }, { status: 400 })
    }

    const problem = await fetchLeetCodeProblem(problemNumber)

    return Response.json({
      success: true,
      problem,
    })
  } catch (error) {
    console.error("API Error:", error)
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to fetch problem",
      },
      { status: 500 },
    )
  }
}
