import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import cors from "cors";
import apiRoutes, { fetchAndSaveCalls } from "./routes/api.js";
import Call from "./models/models.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect("mongodb+srv://mransh1911:cNSfRzK07rQGKZWr@cluster0.rbzvilx.mongodb.net/" , {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Use API routes
app.use("/api", apiRoutes);

app.get("/", (req, res) => res.send("Backend running"));

// --- REAL-TIME UPDATES VIA WEBSOCKETS ---
let clients = [];
wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('Client connected to WebSocket.');

  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    console.log('Client disconnected from WebSocket.');
  });
});

// Function to send new data to all connected clients
const sendUpdatesToClients = async () => {
  try {
    // Find calls with a transcription that haven't been processed yet
    const newTranscribedCalls = await Call.find({
      transcription: { $exists: true, $ne: null, $ne: "" },
      is_processed: false
    });

    if (newTranscribedCalls.length > 0) {
      console.log(`Found ${newTranscribedCalls.length} new transcribed calls to broadcast.`);
      // Send the data to all connected clients
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(newTranscribedCalls));
        }
      });
      // Mark the calls as processed to avoid re-sending them
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

// Polling interval to check for new transcriptions (e.g., every 5 seconds)
const POLLING_INTERVAL = 5 * 1000;
setInterval(sendUpdatesToClients, POLLING_INTERVAL);

// --- AUTO FETCH FROM EXOTEL API ---
const EXOTEL_FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes in ms
setInterval(() => {
  console.log("Auto-fetching calls from Exotel...");
  fetchAndSaveCalls();
}, EXOTEL_FETCH_INTERVAL);

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));