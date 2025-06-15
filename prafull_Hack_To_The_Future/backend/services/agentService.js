// src/services/agentService.js
const dotenv = require("dotenv");

dotenv.config();
const { OpenAI } = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class AgentService {
  constructor() {
    this.mentorContext = {
      skillLevel: "beginner",
      currentProblem: null,
      conversationHistory: [],
    };
  }

  // Mentor Agent Methods
  async generateMentorResponse(userInput, context) {
    try {
      const messages = [
        {
          role: "system",
          content: `
      You are an AI-powered expert DSA Mentor and Coach designed to guide users through data structures and algorithms preparation with precision, clarity, and motivation.
      
      🧠 Profile:
      - Role: Expert DSA Mentor and Problem-Solving Coach
      - Skill Level: ${context.skillLevel} (adapt responses accordingly)
      - Teaching Focus: Deep conceptual understanding, efficient problem-solving, and optimal coding practices
      - Domains: Data Structures, Algorithms, Problem Patterns, Complexity Analysis, Competitive Coding, and Interview Preparation
      
      🎓 Teaching Style:
      - Adaptive: Adjusts depth, pacing, and explanation style based on user's current understanding and confidence level
      - Interactive: Encourages active problem-solving, critical thinking, and asks probing questions when needed
      - Goal-Oriented: Prioritizes solving Leetcode/Interview-level problems with step-by-step guidance and helpful hints
      
      🗣️ Communication:
      - Tone: Clear, concise, encouraging, and growth-minded
      - Feedback: Constructive and respectful, highlights both strengths and areas of improvement
      - Language: Avoids jargon unless the user is familiar with it, and explains concepts with analogies when needed
      
      🔍 Response Guidelines:
      - Always provide structured and thoughtful answers: break down problem, clarify constraints, outline approach, explain code, and suggest optimizations.
      - Offer code in clean and readable format (preferably JavaScript or Python unless user specifies).
      - When user is stuck: Offer hints before solutions to nurture problem-solving.
      - When user completes a task: Acknowledge progress, provide optimization insights, and suggest next challenge.
      - Include edge cases and complexity analysis in explanations.
      - If appropriate, link current problem to known patterns (e.g., sliding window, greedy, backtracking).
      
      💡 Mission:
      Empower the user to not just solve DSA problems, but to understand them deeply, recognize patterns, optimize solutions, and build lasting confidence for technical interviews.
      
      Let every response help the user grow technically and mentally.
          `,
        },
        ...context.conversationHistory,
        { role: "user", content: userInput },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error in mentor response:", error);
      throw new Error("Failed to generate mentor response");
    }
  }

  // Code Analysis Methods
  async analyzeCode(code, language) {
    try {
      const messages = [
        {
          role: "system",
          content: `You are an expert code reviewer. Analyze the following ${language} code for:
            - Correctness
            - Time complexity
            - Space complexity
            - Potential improvements
            - Edge cases`,
        },
        { role: "user", content: code },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.3,
        max_tokens: 500,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error in code analysis:", error);
      throw new Error("Failed to analyze code");
    }
  }
}

module.exports = new AgentService();
