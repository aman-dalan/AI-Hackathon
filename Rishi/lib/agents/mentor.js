export class MentorAgent {
  constructor(skillLevel) {
    this.skillLevel = skillLevel
  }

  async evaluateApproach(approach, problem) {
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: approach,
          problem,
          skillLevel: this.skillLevel,
          sessionState: "approach",
        }),
      })

      const data = await response.json()
      return {
        message: data.response,
        shouldUnlockEditor: data.unlockEditor,
      }
    } catch (error) {
      console.error("Error evaluating approach:", error)
      return {
        message: "I'm having trouble processing your approach. Please try again.",
        shouldUnlockEditor: false,
      }
    }
  }

  async provideCodingGuidance(message, context) {
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          problem: context.problem,
          skillLevel: this.skillLevel,
          sessionState: "coding",
          code: context.code,
        }),
      })

      const data = await response.json()
      return data.response
    } catch (error) {
      console.error("Error getting coding guidance:", error)
      return "I'm having trouble providing guidance right now. Keep working on your solution!"
    }
  }

  async generateHint(code, problem) {
    try {
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          problem,
          skillLevel: this.skillLevel,
          sessionState: "coding",
        }),
      })

      const data = await response.json()
      return data.hint
    } catch (error) {
      console.error("Error generating hint:", error)
      return "Try breaking down the problem into smaller steps."
    }
  }

  async generateEncouragement(code) {
    const encouragements = [
      "You're doing great! Keep going! 💪",
      "Take your time to think through the logic 🤔",
      "Remember to consider edge cases 🎯",
      "You're on the right track! 🚀",
      "Break down the problem into smaller steps 📝",
    ]

    return encouragements[Math.floor(Math.random() * encouragements.length)]
  }
}
