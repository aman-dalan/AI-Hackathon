"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ComplexityModal({ isOpen, onClose, onSubmit, problem }) {
  const [timeComplexity, setTimeComplexity] = useState("")
  const [spaceComplexity, setSpaceComplexity] = useState("")
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const newErrors = {}

    // Only check if fields are filled, not if they're correct
    if (!timeComplexity.trim()) {
      newErrors.time = "Time complexity is required"
    }

    if (!spaceComplexity.trim()) {
      newErrors.space = "Space complexity is required"
    }

    setErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true)
      try {
        await onSubmit(timeComplexity.trim(), spaceComplexity.trim())
        // Reset form after successful submission
        setTimeComplexity("")
        setSpaceComplexity("")
        setErrors({})
      } catch (error) {
        console.error("Submission error:", error)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setTimeComplexity("")
      setSpaceComplexity("")
      setErrors({})
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="w-full max-w-md mx-4">
        <Card className="bg-white">
          <CardHeader className="bg-white">
            <CardTitle className="text-lg font-semibold">Complexity Analysis Required</CardTitle>
            <p className="text-sm text-gray-600">
              Before submitting your solution for "{problem?.title}", please analyze its complexity.
            </p>
          </CardHeader>

          <CardContent className="space-y-4 bg-white">
            <div>
              <Label htmlFor="timeComplexity" className="text-sm font-medium">
                Time Complexity *
              </Label>
              <Input
                id="timeComplexity"
                value={timeComplexity}
                onChange={(e) => setTimeComplexity(e.target.value)}
                placeholder="e.g., O(n), O(log n), O(n²)"
                className={`mt-1 bg-white ${errors.time ? "border-red-500" : ""}`}
                disabled={isSubmitting}
              />
              {errors.time && <p className="text-red-500 text-xs mt-1">{errors.time}</p>}
              <p className="text-xs text-gray-500 mt-1">
                What is the time complexity of your algorithm? (Don't worry if you're unsure - I'll help correct it!)
              </p>
            </div>

            <div>
              <Label htmlFor="spaceComplexity" className="text-sm font-medium">
                Space Complexity *
              </Label>
              <Input
                id="spaceComplexity"
                value={spaceComplexity}
                onChange={(e) => setSpaceComplexity(e.target.value)}
                placeholder="e.g., O(1), O(n), O(log n)"
                className={`mt-1 bg-white ${errors.space ? "border-red-500" : ""}`}
                disabled={isSubmitting}
              />
              {errors.space && <p className="text-red-500 text-xs mt-1">{errors.space}</p>}
              <p className="text-xs text-gray-500 mt-1">
                How much extra space does your algorithm use? (I'll provide feedback if needed!)
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-1">💡 Quick Reference:</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• O(1) - Constant time/space</li>
                <li>• O(log n) - Logarithmic</li>
                <li>• O(n) - Linear</li>
                <li>• O(n log n) - Linearithmic</li>
                <li>• O(n²) - Quadratic</li>
              </ul>
              <p className="text-xs text-blue-600 mt-2 italic">
                Don't worry about being perfect - submit your best guess and I'll help you learn!
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Solution"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
