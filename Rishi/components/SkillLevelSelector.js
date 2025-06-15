"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SkillLevelSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Skill Level:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-32 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-white border border-gray-200 shadow-lg">
          <SelectItem value="beginner" className="hover:bg-gray-100">
            Beginner
          </SelectItem>
          <SelectItem value="intermediate" className="hover:bg-gray-100">
            Intermediate
          </SelectItem>
          <SelectItem value="advanced" className="hover:bg-gray-100">
            Advanced
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
