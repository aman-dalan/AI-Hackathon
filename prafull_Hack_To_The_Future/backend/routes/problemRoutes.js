// src/routes/problemRoutes.js
const express = require("express");
const router = express.Router();
const problemController = require("../controllers/problemController");
const auth = require("../middleware/auth");

router.post("/", problemController.createProblem);
router.get("/", problemController.getProblems);
router.get("/:id", problemController.getProblem);

module.exports = router;
