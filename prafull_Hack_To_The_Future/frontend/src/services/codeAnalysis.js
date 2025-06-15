import { baseUrl } from "../URL";
const analyzeCode = async (code, language, problemId) => {
  try {
    // Sanitize the code by removing control characters and properly escaping special characters
    const sanitizedCode = code
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
      .replace(/\n/g, "\\n") // Properly escape newlines
      .replace(/\r/g, "\\r") // Properly escape carriage returns
      .replace(/\t/g, "\\t"); // Properly escape tabs

    console.log("Sending code for analysis:", {
      language,
      problemId,
      codeLength: code.length,
    });

    const response = await fetch(`${baseUrl}/api/agent/analyze-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: sanitizedCode,
        language,
        problemId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to analyze code: ${response.status}`
      );
    }

    const data = await response.json();
    console.log("Analysis response:", data);
    return data;
  } catch (error) {
    console.error("Error analyzing code:", error);
    throw error;
  }
};

export { analyzeCode };
