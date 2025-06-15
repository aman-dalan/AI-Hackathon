// src/models/Problem.js
const mongoose = require("mongoose");

const problemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    examples: [
      {
        input: String,
        output: String,
        explanation: String,
      },
    ],
    testCases: [
      {
        input: String,
        output: String,
      },
    ],
    constraints: [String],
    topics: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Problem", problemSchema);
