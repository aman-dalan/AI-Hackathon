const express = require("express");
const router = express.Router();

// Test endpoint to check backend connectivity
router.get("/test", (req, res) => {
  res.json({
    status: "success",
    message: "Backend is connected successfully!",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
