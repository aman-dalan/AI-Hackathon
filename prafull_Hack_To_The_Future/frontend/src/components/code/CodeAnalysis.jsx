import React from "react";
import ReactMarkdown from "react-markdown";

const CodeAnalysis = ({ analysis, onBack }) => {
  if (!analysis || !analysis.analysis) return null;

  // Split the analysis into sections
  const sections = analysis.analysis
    .split("\n\n")
    .filter((section) => section.trim());

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Code Analysis</h2>
        <button
          onClick={onBack}
          className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Editor
        </button>
      </div>

      {/* Analysis Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="prose prose-sm max-w-none">
          {sections.map((section, index) => {
            // Check if this is a main section (starts with ###)
            if (section.startsWith("###")) {
              return (
                <div key={index} className="mb-6">
                  <ReactMarkdown>{section}</ReactMarkdown>
                </div>
              );
            }
            // Check if this is a subsection (starts with ####)
            else if (section.startsWith("####")) {
              return (
                <div key={index} className="mb-4 bg-gray-50 rounded-lg p-4">
                  <ReactMarkdown>{section}</ReactMarkdown>
                </div>
              );
            }
            // Regular paragraph
            else {
              return (
                <div key={index} className="mb-3">
                  <ReactMarkdown>{section}</ReactMarkdown>
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
};

export default CodeAnalysis;
