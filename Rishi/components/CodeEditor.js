"use client"

import { useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function CodeEditor({
  code,
  onChange,
  language,
  onLanguageChange,
  isLocked,
  onHintRequest,
  onRunCode,
  onSubmitCode,
  testResults,
  sessionState,
  isLoading,
}) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)

  useEffect(() => {
    // Load Monaco Editor
    const script = document.createElement("script")
    script.src = "https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js"
    script.onload = () => {
      window.require.config({ paths: { vs: "https://unpkg.com/monaco-editor@0.44.0/min/vs" } })
      window.require(["vs/editor/editor.main"], () => {
        initializeEditor()
      })
    }
    document.head.appendChild(script)

    return () => {
      if (monacoRef.current) {
        monacoRef.current.dispose()
      }
    }
  }, [])

  useEffect(() => {
    if (monacoRef.current && code !== monacoRef.current.getValue()) {
      monacoRef.current.setValue(code)
    }
  }, [code])

  useEffect(() => {
    if (monacoRef.current) {
      const model = monacoRef.current.getModel()
      if (model) {
        window.monaco.editor.setModelLanguage(model, getMonacoLanguage(language))
      }
    }
  }, [language])

  useEffect(() => {
    if (monacoRef.current) {
      onChange(getDefaultCode(language))
    }
  }, [language])

  const initializeEditor = () => {
    if (editorRef.current && window.monaco) {
      monacoRef.current = window.monaco.editor.create(editorRef.current, {
        value: getDefaultCode(language),
        language: getMonacoLanguage(language),
        theme: "vs-dark",
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly: isLocked,
      })

      monacoRef.current.onDidChangeModelContent(() => {
        const value = monacoRef.current.getValue()
        onChange(value)
      })
    }
  }

  const getMonacoLanguage = (lang) => {
    const languageMap = {
      javascript: "javascript",
      python: "python",
      java: "java",
      cpp: "cpp",
    }
    return languageMap[lang] || "javascript"
  }

  const getDefaultCode = (lang) => {
    const templates = {
      javascript: `function twoSum(nums, target) {
    // Your code here
    
}`,
      python: `def twoSum(nums, target):
    # Your code here
    pass`,
      java: `public class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Your code here
        
    }
}`,
      cpp: `#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Your code here
        
    }
};`,
    }
    return templates[lang] || templates.javascript
  }

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.updateOptions({ readOnly: isLocked })
    }
  }, [isLocked])

  return (
    <div className="flex-1 flex flex-col p-4">
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm">Code Editor</CardTitle>
            <div className="flex gap-2 items-center">
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="w-32 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-lg">
                  <SelectItem value="javascript" className="hover:bg-gray-100">
                    JavaScript
                  </SelectItem>
                  <SelectItem value="python" className="hover:bg-gray-100">
                    Python
                  </SelectItem>
                  <SelectItem value="java" className="hover:bg-gray-100">
                    Java
                  </SelectItem>
                  <SelectItem value="cpp" className="hover:bg-gray-100">
                    C++
                  </SelectItem>
                </SelectContent>
              </Select>

              {sessionState === "coding" && !isLocked && (
                <>
                  <Button variant="outline" size="sm" onClick={onHintRequest} disabled={isLoading}>
                    💡 Hint
                  </Button>
                  <Button variant="outline" size="sm" onClick={onRunCode} disabled={isLoading}>
                    {isLoading ? "Running..." : "▶️ Run"}
                  </Button>
                  <Button size="sm" onClick={onSubmitCode} disabled={isLoading}>
                    {isLoading ? "Submitting..." : "Submit"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-4">
          <div className="flex-1 relative">
            <div ref={editorRef} className="w-full h-full" />

            {isLocked && (
              <div className="locked-overlay">
                <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                  <div className="text-4xl mb-2">🔒</div>
                  <h3 className="text-lg font-semibold mb-2">Editor Locked</h3>
                  <p className="text-gray-600">Share your approach with the AI mentor first to unlock the editor</p>
                </div>
              </div>
            )}
          </div>

          {testResults.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <h4 className="font-medium mb-2">Test Results:</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {testResults.map((result, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded text-sm ${
                      result.passed
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Test Case {index + 1}</span>
                      <span className="font-semibold">{result.passed ? "✅ PASSED" : "❌ FAILED"}</span>
                    </div>
                    <div className="mt-1 text-xs">
                      <div>
                        <strong>Input:</strong> {result.input}
                      </div>
                      <div>
                        <strong>Expected:</strong> {result.expected}
                      </div>
                      <div>
                        <strong>Got:</strong> {result.actual}
                      </div>
                      {result.error && (
                        <div className="text-red-600 mt-1">
                          <strong>Error:</strong> {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
