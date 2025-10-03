// server.js

// 1. Load environment variables first (CRUCIAL for JWT_SECRET and MONGODB_URI)
import 'dotenv/config'; 

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import cors from "cors";
// 🎯 Import the default router and the named utility function from the integrated API file
import apiRoutes, { fetchAndSaveCalls } from "./routes/api.js";
import Call from "./models/models.js"; // Ensure this path is correct

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 4000; 

// --- MIDDLEWARE ---
// Configure CORS
app.use(cors({
    origin: ['http://localhost:3000', 'https://d-igital-bot.vercel.app'], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI) 
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// 🎯 Use the single, integrated API router
// Authentication routes are now accessible via /api/auth/...
app.use("/api", apiRoutes);

app.get("/", (req, res) => res.send("Backend running"));

// --- REAL-TIME UPDATES VIA WEBSOCKETS ---
let clients = [];
wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('Client connected to WebSocket.');
  // ... (rest of WebSocket logic)
  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    console.log('Client disconnected from WebSocket.');
  });
});

const sendUpdatesToClients = async () => {
  try {
    const newTranscribedCalls = await Call.find({
      transcription: { $exists: true, $ne: null, $ne: "" },
      is_processed: false
    });

    if (newTranscribedCalls.length > 0) {
      console.log(`Found ${newTranscribedCalls.length} new transcribed calls to broadcast.`);
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(newTranscribedCalls));
        }
      });
      await Call.updateMany(
        { _id: { $in: newTranscribedCalls.map(call => call._id) } },
        { $set: { is_processed: true } }
      );
      console.log('Broadcasted and marked as processed.');
    }
  } catch (error) {
    console.error("Error broadcasting updates:", error);
  }
};

const POLLING_INTERVAL = 5 * 1000;
setInterval(sendUpdatesToClients, POLLING_INTERVAL);

// --- AUTO FETCH FROM EXOTEL API ---
const EXOTEL_FETCH_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  console.log("Auto-fetching calls from Exotel...");
  // 🎯 Calls the named function imported from apiRoutes
  fetchAndSaveCalls();
}, EXOTEL_FETCH_INTERVAL);

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));