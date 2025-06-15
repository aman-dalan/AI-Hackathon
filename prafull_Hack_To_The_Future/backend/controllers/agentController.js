// src/controllers/agentController.js
const agentService = require("../services/agentService");

const agentController = {
  // Handle chat with mentor
  async chatWithMentor(req, res) {
    try {
      const { message, context } = req.body;
      const response = await agentService.generateMentorResponse(
        message,
        context
      );
      res.json({ response });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Handle code analysis
  async analyzeCode(req, res) {
    try {
      const { code, language } = req.body;
      const analysis = await agentService.analyzeCode(code, language);
      res.json({ analysis });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = agentController;
