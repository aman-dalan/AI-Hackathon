import { MentorAgent } from "./mentor"
import { CodeAgent } from "./code"
import { EvaluationAgent } from "./evaluation"
import { PersonaManager } from "./persona"

export class AgentOrchestrator {
  constructor(config) {
    this.config = config
    this.mentorAgent = new MentorAgent(config.skillLevel)
    this.codeAgent = new CodeAgent()
    this.evaluationAgent = new EvaluationAgent()
    this.personaManager = new PersonaManager(config.skillLevel)

    this.callbacks = {
      onStateChange: config.onStateChange,
      onEditorUnlock: config.onEditorUnlock,
      onEditorLock: config.onEditorLock,
      onTestResults: config.onTestResults,
      onToast: config.onToast,
      onHintUsed: config.onHintUsed,
    }
  }

  async processUserMessage(message, context) {
    const { sessionState, code, problem, userApproach } = context

    switch (sessionState) {
      case "approach":
        return await this.handleApproachPhase(message, problem)
      case "coding":
        return await this.handleCodingPhase(message, { code, problem })
      case "evaluation":
        return await this.handleEvaluationPhase(message, context)
      default:
        return await this.mentorAgent.generateResponse(message, context)
    }
  }

  async handleApproachPhase(approach, problem) {
    const response = await this.mentorAgent.evaluateApproach(approach, problem)

    // Check if approach is good enough to unlock editor
    if (response.shouldUnlockEditor) {
      this.callbacks.onEditorUnlock()
      this.callbacks.onStateChange("coding")
      return (
        response.message + "\n\n🎉 Great! The code editor is now unlocked. You can start implementing your solution."
      )
    }

    return response.message
  }

  async handleCodingPhase(message, context) {
    return await this.mentorAgent.provideCodingGuidance(message, context)
  }

  async handleEvaluationPhase(message, context) {
    return await this.evaluationAgent.generateFeedback(message, context)
  }

  async provideHint(code, problem) {
    this.callbacks.onHintUsed()
    return await this.mentorAgent.generateHint(code, problem)
  }

  async runCode(code, problem, language) {
    return await this.codeAgent.runTests(code, problem, language)
  }

  async evaluateSubmission(code, problem, metadata) {
    const evaluation = await this.evaluationAgent.evaluateSubmission(code, problem, metadata)
    this.callbacks.onStateChange("evaluation")
    return evaluation
  }

  async handleInactivity(code) {
    const encouragement = await this.mentorAgent.generateEncouragement(code)
    this.callbacks.onToast(encouragement, "info")
  }
}


