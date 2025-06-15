const Problem = require("../models/Problem");

class ProblemController {
  // Create a new problem
  async createProblem(req, res) {
    try {
      const problem = new Problem(req.body);
      await problem.save();
      res.status(201).json(problem);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  // Get all problems
  async getProblems(req, res) {
    try {
      const problems = await Problem.find();
      res.json(problems);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  // Get a single problem
  async getProblem(req, res) {
    try {
      const problem = await Problem.findById(req.params.id);
      if (!problem) {
        return res.status(404).json({ message: "Problem not found" });
      }
      res.json(problem);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}

module.exports = new ProblemController();
