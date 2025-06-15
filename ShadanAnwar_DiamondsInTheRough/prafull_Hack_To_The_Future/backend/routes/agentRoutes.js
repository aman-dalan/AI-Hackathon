// src/routes/agentRoutes.js
const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agentController");

router.post("/chat", agentController.chatWithMentor);
router.post("/analyze-code", agentController.analyzeCode);

module.exports = router;
