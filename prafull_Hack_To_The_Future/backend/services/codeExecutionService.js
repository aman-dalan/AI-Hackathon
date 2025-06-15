const axios = require("axios");

const PISTON_API_URL = "https://emkc.org/api/v2/piston/execute";

const languageVersions = {
  python: "3.10.0",
  javascript: "18.15.0",
  java: "15.0.2",
  cpp: "10.2.0",
  c: "10.2.0",
};

const languageFileExtensions = {
  python: "py",
  javascript: "js",
  java: "java",
  cpp: "cpp",
  c: "c",
};

class CodeExecutionService {
  async executeCode(code, language, testCases) {
    try {
      const results = [];

      for (const testCase of testCases) {
        const result = await this.runTestCase(code, language, testCase);
        results.push(result);
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error("Code execution error:", error);
      return {
        success: false,
        error: error.message || "Failed to execute code",
      };
    }
  }

  async runTestCase(code, language, testCase) {
    try {
      const response = await axios.post(PISTON_API_URL, {
        language: language,
        version: languageVersions[language],
        files: [
          {
            name: `main.${languageFileExtensions[language]}`,
            content: code,
          },
        ],
        stdin: testCase.input,
        args: [],
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1,
      });

      const { stdout, stderr, exitCode } = response.data.run;

      // Clean up stdout and expected output for comparison
      const cleanStdout = stdout.trim();
      const cleanExpected = testCase.expectedOutput.trim();

      const passed = cleanStdout === cleanExpected;

      return {
        testCase,
        passed,
        output: cleanStdout,
        expectedOutput: cleanExpected,
        error: stderr || null,
        exitCode,
      };
    } catch (error) {
      console.error("Test case execution error:", error);
      return {
        testCase,
        passed: false,
        error: error.message || "Failed to execute test case",
        output: null,
        expectedOutput: testCase.expectedOutput,
        exitCode: -1,
      };
    }
  }
}

module.exports = new CodeExecutionService();
