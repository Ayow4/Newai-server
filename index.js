import express from "express";
import cors from "cors";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
import dotenv from "dotenv";
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

// ✅ MongoDB connection (serverless-safe)
const connect = async () => {
  if (mongoose.connection.readyState >= 1) {
    return; // already connected or connecting
  }
  try {
    await mongoose.connect(process.env.MONGO, {
      dbName: "test", // 👈 use your actual DB name
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
};

// ✅ Middlewares
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// ✅ Root route
app.get("/", (req, res) => {
  res.send("Welcome to the backend!");
});

// ✅ ImageKit setup
const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

// ✅ Create new chat
app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
  await connect();
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    const newChat = new Chat({
      userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    const userChats = await UserChats.find({ userId });

    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId,
        chats: [{ _id: savedChat._id, title: text.substring(0, 40) }],
      });
      await newUserChats.save();
    } else {
      await UserChats.updateOne(
        { userId },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
            },
          },
        }
      );
    }

    res.status(201).send(savedChat._id);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating chat!");
  }
});

// ✅ Get all chats of a user
app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  await connect();
  const userId = req.auth.userId;

  try {
    const userChats = await UserChats.find({ userId });
    res.status(200).send(userChats[0]?.chats || []);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching chat!");
  }
});

// ✅ Get a specific chat
app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  await connect();
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    res.status(200).send(chat);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching chat!");
  }
});

// ✅ Update a chat (add Q/A)
app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  await connect();
  const userId = req.auth.userId;
  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    const updateChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      { $push: { history: { $each: newItems } } }
    );
    res.status(200).send(updateChat);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding conversation!");
  }
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(401).send("Unauthenticated!");
});

// ✅ Start server
app.listen(port, () => {
  console.log("🚀 Server running on port", port);
});
