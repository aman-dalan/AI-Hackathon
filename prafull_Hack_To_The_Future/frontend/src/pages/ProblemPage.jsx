import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Resizable } from "re-resizable";
import ProblemDetail from "../components/problems/ProblemDetail";
import CodeEditor from "../components/code/CodeEditor";
import AIMentorChat from "../components/coach/AIMentorChat";
import { baseUrl } from "../URL";
// import TestResults from "../components/code/TestResults";

const ResizablePanel = ({
  children,
  size,
  onResizeStop,
  minHeight,
  maxHeight,
  className = "",
  style = {},
}) => {
  return (
    <Resizable
      size={size}
      onResizeStop={onResizeStop}
      enable={{ bottom: true }}
      minHeight={minHeight}
      maxHeight={maxHeight}
      className={`relative bg-white rounded-lg shadow-md ${className}`}
      style={{
        transition: "none",
        ...style,
      }}
    >
      <div className="h-full w-full overflow-auto">{children}</div>
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-200 cursor-row-resize hover:bg-blue-500 z-10 flex items-center justify-center">
        <div className="w-12 h-1 bg-gray-400 rounded-full"></div>
      </div>
    </Resizable>
  );
};

const ScrollablePanel = ({ children, className = "" }) => {
  return (
    <div
      className={`h-full w-full bg-white rounded-lg shadow-md overflow-auto ${className}`}
    >
      {children}
    </div>
  );
};

const ProblemPage = () => {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [leftPanelHeight, setLeftPanelHeight] = useState("60%");
  const [backendStatus, setBackendStatus] = useState(null);

  useEffect(() => {
    fetchProblem();
    checkBackendConnection();
  }, [problemId]);

  const fetchProblem = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/problems/${problemId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch problem");
      }
      const data = await response.json();
      setProblem(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/test`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setBackendStatus(data);
    } catch (error) {
      console.error("Error connecting to backend:", error);
      setBackendStatus({
        status: "error",
        message: `Failed to connect to backend: ${error.message}`,
        error: error.message,
      });
    }
  };

  const handleRunCode = async (code) => {
    try {
      const response = await fetch(`${baseUrl}/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problemId,
          code,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute code");
      }

      const results = await response.json();
      setTestResults(results);
    } catch (error) {
      console.error("Error executing code:", error);
      setTestResults([
        {
          status: "error",
          message: "Failed to execute code: " + error.message,
        },
      ]);
    }
  };

  const handleLeftResize = (e, direction, ref, d) => {
    const containerHeight = window.innerHeight - 32;
    const currentHeight = parseInt(leftPanelHeight);
    const newHeight = currentHeight + (d.height / containerHeight) * 100;
    const constrainedHeight = Math.min(Math.max(newHeight, 30), 80);
    setLeftPanelHeight(`${constrainedHeight}%`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-4">
        Error loading problem: {error}
        <button
          onClick={() => navigate("/problems")}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Problems
        </button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center p-4">
        Problem not found
        <button
          onClick={() => navigate("/problems")}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Problems
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Backend Status Indicator */}
      {/* {backendStatus && (
        <div
          className={`mb-4 p-2 rounded ${
            backendStatus.status === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          Backend Status: {backendStatus.message}
          {backendStatus.timestamp && (
            <span className="text-sm ml-2">
              (Last checked:{" "}
              {new Date(backendStatus.timestamp).toLocaleTimeString()})
            </span>
          )}
        </div>
      )} */}

      {/* Problem Header */}
      <div className="mb-4 flex justify-between items-center">
        <div>
          {/* <h1 className="text-2xl font-bold text-gray-800">{problem.title}</h1> */}
          <div className="flex items-center space-x-2 mt-1">
            {/* <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                problem.difficulty === "easy"
                  ? "bg-green-100 text-green-800"
                  : problem.difficulty === "medium"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {problem.difficulty}
            </span> */}
            {problem.tags?.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate("/problems")}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Back to Problems
        </button>
      </div>

      <div className="h-[calc(100vh-8rem)] flex gap-4">
        {/* Left Column */}
        <div className="w-1/2 flex flex-col gap-4">
          {/* Problem Statement */}
          <ResizablePanel
            size={{ width: "100%", height: leftPanelHeight }}
            onResizeStop={handleLeftResize}
            minHeight="30%"
            maxHeight="80%"
            className="flex-shrink-0"
            style={{ height: leftPanelHeight }}
          >
            <div className="h-full overflow-auto">
              <ProblemDetail problem={problem} />
            </div>
          </ResizablePanel>

          {/* AI Mentor Chat */}
          <ScrollablePanel className="flex-1 min-h-[200px]">
            <AIMentorChat problemId={problemId} />
          </ScrollablePanel>
        </div>

        {/* Right Column - Full Height */}
        <div className="w-1/2 h-full">
          {/* Code Editor and Test Results Container */}
          <div className="h-full bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0">
              <CodeEditor onRun={handleRunCode} />
            </div>
            {/* Test Results will be shown below the editor when available */}
            {testResults && testResults.length > 0 && (
              <div className="border-t">
                <TestResults results={testResults} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemPage;
