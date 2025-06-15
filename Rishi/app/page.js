"use client"

import { useState, useEffect, useRef } from "react"
import ProblemPanel from "@/components/ProblemPanel"
import CodeEditor from "@/components/CodeEditor"
import ChatInterface from "@/components/ChatInterface"
import SkillLevelSelector from "@/components/SkillLevelSelector"
import ToastContainer from "@/components/ToastContainer"
import ComplexityModal from "@/components/ComplexityModal"
import { AgentOrchestrator } from "@/lib/agents/orchestrator"

export default function DSACoach() {
  const [skillLevel, setSkillLevel] = useState("beginner")
  const [problem, setProblem] = useState(null)
  const [code, setCode] = useState("")
  const [language, setLanguage] = useState("javascript")
  const [isEditorLocked, setIsEditorLocked] = useState(true)
  const [chatMessages, setChatMessages] = useState([])
  const [testResults, setTestResults] = useState([])
  const [toasts, setToasts] = useState([])
  const [sessionState, setSessionState] = useState("approach")
  const [userApproach, setUserApproach] = useState("")
  const [hintsUsed, setHintsUsed] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [showComplexityModal, setShowComplexityModal] = useState(false)

  const orchestratorRef = useRef(null)
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef(null)
  const lastCodeRef = useRef("")

  useEffect(() => {
    orchestratorRef.current = new AgentOrchestrator({
      skillLevel,
      onStateChange: setSessionState,
      onEditorUnlock: () => setIsEditorLocked(false),
      onEditorLock: () => setIsEditorLocked(true),
      onTestResults: setTestResults,
      onToast: showToast,
      onHintUsed: () => setHintsUsed((prev) => prev + 1),
    })
  }, [skillLevel])

  const showToast = (message, type = "info") => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4000)
  }

  const handleInitialMessage = async (loadedProblem, currentSkillLevel) => {
    try {
      const response = await fetch("/api/initial-greeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: loadedProblem,
          skillLevel: currentSkillLevel,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setChatMessages([
          {
            role: "assistant",
            content: data.message,
          },
        ])
      }
    } catch (error) {
      console.error("Error getting initial message:", error)
      // Fallback message
      setChatMessages([
        {
          role: "assistant",
          content: `Great! I see you've loaded "${loadedProblem.title}". Let's work through this together! 

First, I'd like to understand your approach. Can you tell me how you would tackle this problem? Don't worry about the code yet - just explain your thinking process.`,
        },
      ])
    }
  }

  const handleCodeChange = (newCode) => {
    setCode(newCode)
    lastActivityRef.current = Date.now()

    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }

    // Only set inactivity timer if:
    // 1. Editor is unlocked
    // 2. In coding phase
    // 3. There is some meaningful code content
    if (!isEditorLocked && sessionState === "coding" && newCode.trim().length > 10) {
      lastCodeRef.current = newCode

      inactivityTimerRef.current = setTimeout(() => {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current
        // Only show hint if user has been truly inactive (no typing)
        if (timeSinceLastActivity >= 3000) {
          handleAutomaticHint(newCode)
        }
      }, 3000)
    }
  }

  const handleAutomaticHint = async (currentCode) => {
    // Only show automatic hints if user is actively coding and has meaningful content
    if (currentCode.trim().length < 20 || !problem) return

    try {
      const response = await fetch("/api/automatic-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: currentCode,
          problem,
          skillLevel,
          language,
          sessionState,
        }),
      })

      const data = await response.json()
      if (data.success && data.hint && data.hint.trim()) {
        showToast(`💡 ${data.hint}`, "hint")
      }
    } catch (error) {
      console.error("Error getting automatic hint:", error)
      // Don't show error toast for automatic hints to avoid spam
    }
  }

  const handleInactivity = () => {
    // This function is now replaced by handleAutomaticHint
    // Keep it for backward compatibility but it won't be called
  }

  const handleSendMessage = async (message) => {
    setIsLoading(true)
    setChatMessages((prev) => [...prev, { role: "user", content: message }])

    if (sessionState === "approach") {
      setUserApproach(message)
    }

    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          problem,
          skillLevel,
          sessionState,
          code,
          language,
          hintsUsed,
          userApproach,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.response }])

        if (data.unlockEditor && isEditorLocked) {
          setIsEditorLocked(false)
          setSessionState("coding")
          showToast("🎉 Code editor unlocked! You can start coding now.", "success")
        }

        if (data.newState && data.newState !== sessionState) {
          setSessionState(data.newState)
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I'm having trouble processing your message. Please try again.",
          },
        ])
      }
    } catch (error) {
      console.error("Error sending message:", error)
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm experiencing technical difficulties. Please try again.",
        },
      ])
    }

    setIsLoading(false)
  }

  const handleHintRequest = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          skillLevel,
          code,
          language,
          sessionState,
          hintsUsed,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setHintsUsed((prev) => prev + 1)
        showToast(`💡 Hint: ${data.hint}`, "hint")
      }
    } catch (error) {
      console.error("Error getting hint:", error)
      showToast("Unable to get hint right now. Try again later.", "error")
    }
    setIsLoading(false)
  }

  const handleRunCode = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/run-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          problem,
          skillLevel,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setTestResults(data.results || [])

        if (data.allPassed) {
          showToast("🎉 All tests passed! Great job!", "success")
        } else {
          showToast("Some tests failed. Check the results below.", "error")
        }
      } else {
        showToast("Error running code. Please try again.", "error")
      }
    } catch (error) {
      console.error("Error running code:", error)
      showToast("Failed to run code. Please try again.", "error")
    }
    setIsLoading(false)
  }

  const handleSubmitClick = () => {
    // Show complexity modal before submission
    setShowComplexityModal(true)
  }

  const handleComplexitySubmit = async (timeComplexity, spaceComplexity) => {
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          problem,
          skillLevel,
          hintsUsed,
          userApproach,
          timeComplexity,
          spaceComplexity,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.evaluation,
          },
        ])
        setSessionState("evaluation")
        setShowComplexityModal(false)
        showToast("Solution evaluated! Check the chat for feedback.", "success")
      } else {
        showToast("Failed to evaluate solution. Please try again.", "error")
      }
    } catch (error) {
      console.error("Error submitting code:", error)
      showToast("Failed to evaluate solution. Please try again.", "error")
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">DSA Preparation Coach</h1>
        <SkillLevelSelector value={skillLevel} onChange={setSkillLevel} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel */}
        <div className="w-1/2 flex flex-col border-r">
          <ProblemPanel
            problem={problem}
            onProblemLoad={setProblem}
            skillLevel={skillLevel}
            onInitialMessage={handleInitialMessage}
          />
          <ChatInterface
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            sessionState={sessionState}
            isEditorLocked={isEditorLocked}
            isLoading={isLoading}
          />
        </div>

        {/* Right Panel */}
        <div className="w-1/2 flex flex-col">
          <CodeEditor
            code={code}
            onChange={handleCodeChange}
            language={language}
            onLanguageChange={setLanguage}
            isLocked={isEditorLocked}
            onHintRequest={handleHintRequest}
            onRunCode={handleRunCode}
            onSubmitCode={handleSubmitClick}
            testResults={testResults}
            sessionState={sessionState}
            isLoading={isLoading}
          />
        </div>
      </div>

      <ToastContainer toasts={toasts} />

      <ComplexityModal
        isOpen={showComplexityModal}
        onClose={() => setShowComplexityModal(false)}
        onSubmit={handleComplexitySubmit}
        problem={problem}
      />
    </div>
  )
}
