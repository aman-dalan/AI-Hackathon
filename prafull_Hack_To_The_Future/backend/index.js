// src/server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const problemRoutes = require("./routes/problemRoutes");
const agentRoutes = require("./routes/agentRoutes");
const userRoutes = require("./routes/userRoutes");
const testRoutes = require("./testRoutes");
const mongoDB = require("./config/db");
const codeExecutionRoutes = require("./routes/codeExecutionRoutes");
mongoDB();

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  cors({
    origin: [
      "timely-bunny-326f98.netlify.app",
      // "http://localhost:5173", // Frontend URL (development)
      // "https://your-frontend-domain.netlify.app", // Replace with your actual Netlify domain
      // "https://your-frontend-domain.vercel.app", // Alternative deployment
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin,X-Requested-With,Content-Type,Accept"
  );
  next();
});

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "DSA Coach API is running" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;

app.use("/api/problems", problemRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/users", userRoutes);
app.use("/api", testRoutes);
app.use("/api/code", codeExecutionRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
