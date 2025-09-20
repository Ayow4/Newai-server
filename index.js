import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth, clerkClient } from "@clerk/clerk-sdk-node";
import dotenv from "dotenv";
import ImageKit from "imagekit";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// ------------------- MIDDLEWARE -------------------
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());

// ------------------- IMAGEKIT -------------------
const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

// ------------------- MONGO CONNECTION -------------------
const connectMongo = async () => {
  if (mongoose.connection.readyState >= 1) return;

  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: "test",
    });
    console.log("✅ Connected to MongoDB:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
};

// ------------------- ROUTES -------------------
app.get("/", (req, res) => res.send("Welcome to the backend!"));

// ImageKit auth
app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

// Create chat
app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
  await connectMongo();
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
      await userChats.save();
    } else {
      await UserChats.updateOne(
        { userId },
        { $push: { chats: { _id: savedChat._id, title: text.substring(0, 40) } } }
      );
    }

    res.status(201).json(savedChat._id);
  } catch (err) {
    console.error("Error creating chat:", err);
    res.status(500).send("Error creating chat!");
  }
});

// Get user chats
app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  await connectMongo();
  const userId = req.auth.userId;

  try {
    const userChats = await UserChats.findOne({ userId });
    res.status(200).json(userChats?.chats || []);
  } catch (err) {
    console.error("Error fetching user chats:", err);
    res.status(500).send("Error fetching chat!");
  }
});

// Get single chat
app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  await connectMongo();
  const userId = req.auth.userId;
  const { id } = req.params;

  try {
    const chat = await Chat.findOne({ _id: id, userId });
    if (!chat) return res.status(404).send("Chat not found");
    res.status(200).json(chat);
  } catch (err) {
    console.error("Error fetching chat:", err);
    res.status(500).send("Error fetching chat!");
  }
});

// Update chat
app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  await connectMongo();
  const userId = req.auth.userId;
  const { id } = req.params;
  const { question, answer, img } = req.body;

  const newItems = [
    ...(question ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }] : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    const update = await Chat.updateOne(
      { _id: id, userId },
      { $push: { history: { $each: newItems } } }
    );
    res.status(200).json(update);
  } catch (err) {
    console.error("Error updating chat:", err);
    res.status(500).send("Error adding conversation!");
  }
});

// ------------------- ERROR HANDLER -------------------
app.use((err, req, res, next) => {
  console.error("❌ Error middleware:", err.stack);
  if (err.name === "ClerkAuthError") return res.status(401).send("Unauthenticated");
  res.status(500).send("Internal server error");
});

// ------------------- START SERVER -------------------
connectMongo()
  .then(() => {
    app.listen(port, () => console.log(`✅ Server running on port ${port}`));
  })
  .catch(err => console.error("❌ Failed to start server:", err));
