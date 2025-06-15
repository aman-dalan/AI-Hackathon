"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function ChatInterface({ messages, onSendMessage, sessionState, isEditorLocked, isLoading }) {
  const [inputMessage, setInputMessage] = useState("")
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = () => {
    if (!inputMessage.trim() || isLoading) return
    onSendMessage(inputMessage)
    setInputMessage("")
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const getPlaceholderText = () => {
    switch (sessionState) {
      case "approach":
        return "Describe your approach to solve this problem..."
      case "coding":
        return "Ask questions about your code or request help..."
      case "evaluation":
        return "Reflect on your solution or ask questions..."
      default:
        return "Type your message..."
    }
  }

  const getSessionTitle = () => {
    switch (sessionState) {
      case "approach":
        return "AI Mentor - Planning Phase"
      case "coding":
        return "AI Mentor - Coding Phase"
      case "evaluation":
        return "AI Mentor - Evaluation Phase"
      default:
        return "AI Mentor"
    }
  }

  return (
    <div className="h-1/2 flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{getSessionTitle()}</CardTitle>
          {sessionState === "approach" && isEditorLocked && (
            <p className="text-xs text-gray-600">💡 Share your approach first to unlock the code editor</p>
          )}
          {sessionState === "coding" && !isEditorLocked && (
            <p className="text-xs text-green-600">✅ Code editor is unlocked - you can ask about your code</p>
          )}
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-4">
          <ScrollArea className="flex-1 mb-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <p className="mb-2">👋 Hi! I'm your AI mentor.</p>
                  <p className="text-sm">
                    {sessionState === "approach"
                      ? "Let's start by discussing your approach to this problem."
                      : "How can I help you today?"}
                  </p>
                </div>
              )}

              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <div className="text-sm font-semibold mb-1">{message.role === "user" ? "You" : "AI Mentor"}</div>
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 max-w-[80%] p-3 rounded-lg">
                    <div className="text-sm font-semibold mb-1">AI Mentor</div>
                    <div className="text-sm">Thinking... 🤔</div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={getPlaceholderText()}
              className="flex-1"
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={!inputMessage.trim() || isLoading}>
              {isLoading ? "..." : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
