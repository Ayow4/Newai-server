import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
import dotenv from "dotenv";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());

// MongoDB connection
const connect = async () => {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(process.env.MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
};

// Health check
app.get("/", (req, res) => res.send("Backend is running"));

// Temporary route to debug user token
app.get("/api/me", ClerkExpressRequireAuth(), (req, res) => {
  res.json({ userId: req.auth.userId });
});

// Get user chats safely
app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  try {
    const userChats = await UserChats.findOne({ userId });
    if (!userChats) return res.status(200).json([]); // Return empty array if no chats
    res.status(200).json(userChats.chats);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching chats");
  }
});

// Create new chat
app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    const newChat = new Chat({
      userId,
      history: [{ role: "user", parts: [{ text }] }],
    });
    const savedChat = await newChat.save();

    let userChats = await UserChats.findOne({ userId });
    if (!userChats) {
      userChats = new UserChats({
        userId,
        chats: [{ _id: savedChat._id, title: text.substring(0, 40) }],
      });
    } else {
      userChats.chats.push({ _id: savedChat._id, title: text.substring(0, 40) });
    }
    await userChats.save();

    res.status(201).json(savedChat._id);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating chat");
  }
});

connect().then(() => {
  app.listen(port, () => console.log(`Server running on port ${port}`));
});
