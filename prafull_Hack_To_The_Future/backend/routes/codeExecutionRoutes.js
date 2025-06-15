const express = require("express");
const router = express.Router();
const codeExecutionService = require("../services/codeExecutionService");

router.post("/execute", async (req, res) => {
  try {
    const { code, language, testCases } = req.body;

    if (!code || !language || !testCases) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: code, language, or testCases",
      });
    }

    const result = await codeExecutionService.executeCode(
      code,
      language,
      testCases
    );
    res.json(result);
  } catch (error) {
    console.error("Code execution route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during code execution",
    });
  }
});

module.exports = router;
