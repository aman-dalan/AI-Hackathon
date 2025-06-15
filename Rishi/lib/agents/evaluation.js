export class EvaluationAgent {
  async evaluateSubmission(code, problem, metadata) {
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          problem,
          language: metadata.language,
          skillLevel: metadata.skillLevel,
          hintsUsed: metadata.hintsUsed,
          userApproach: metadata.userApproach,
        }),
      })

      const data = await response.json()
      return data.evaluation
    } catch (error) {
      console.error("Error evaluating submission:", error)
      return `Great job completing the solution! Here's a quick evaluation:

✅ **Solution Completed**: You successfully implemented a working solution.

🎯 **Approach**: Your approach shows good problem-solving thinking.

📈 **Progress**: You're making excellent progress.

💡 **Next Steps**: 
- Try solving similar problems to reinforce these concepts
- Consider exploring different approaches to the same problem
- Focus on optimizing time and space complexity

Keep up the great work! 🚀`
    }
  }

  async generateFeedback(message, context) {
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          problem: context.problem,
          skillLevel: context.skillLevel,
          sessionState: "evaluation",
        }),
      })

      const data = await response.json()
      return data.response
    } catch (error) {
      console.error("Error generating feedback:", error)
      return "Thank you for sharing your thoughts. Keep practicing and you'll continue to improve!"
    }
  }
}



