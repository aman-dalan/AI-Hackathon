import React from "react";

const ProblemDetail = ({ problem }) => {
  if (!problem) {
    return (
      <div className="text-center p-4 text-gray-600">
        Loading problem details...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{problem.title}</h1>
          <div className="flex gap-2 mt-1">
            <span
              className={`px-2 py-1 rounded-full text-sm ${
                problem.difficulty === "easy"
                  ? "bg-green-100 text-green-800"
                  : problem.difficulty === "medium"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {problem.difficulty}
            </span>
            {problem.topics?.map((topic) => (
              <span
                key={topic}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
        <button className="text-gray-500 hover:text-gray-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Description */}
      <div className="prose max-w-none mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Description
        </h2>
        <p className="text-gray-600">{problem.description}</p>
      </div>

      {/* Examples */}
      {problem.examples && problem.examples.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Examples</h2>
          {problem.examples.map((example, index) => (
            <div key={index} className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-gray-600 mb-2">
                <strong>Example {index + 1}:</strong>
              </p>
              <pre className="bg-gray-100 p-3 rounded text-sm">
                Input: {example.input}
                {"\n"}
                Output: {example.output}
                {example.explanation && (
                  <>
                    {"\n"}
                    Explanation: {example.explanation}
                  </>
                )}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Constraints */}
      {problem.constraints && problem.constraints.length > 0 && (
        <div className="mt-auto">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Constraints
          </h2>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            {problem.constraints.map((constraint, index) => (
              <li key={index}>{constraint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ProblemDetail;
