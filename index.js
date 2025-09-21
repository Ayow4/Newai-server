import express from "express";
import cors from "cors";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node'
import dotenv from "dotenv";
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();


app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
})
);

// Hybrid auth: try Clerk, fallback to demo
const requireAuthSafe = (req, res, next) => {
  ClerkExpressRequireAuth()(req, res, (err) => {
    if (err) {
      console.warn("⚠️ Clerk auth failed, falling back to demo user");
      req.auth = { userId: "demo-user" }; // fallback user
    }
    next();
  });
};

app.use(express.json())

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log('Connected to MongoDB!');
  } catch (err) {
    console.error("Failed to connect to MongoDB: ", err);
  }
};

app.get('/', (req, res) => {
  res.send('Welcome to the backend!');
});

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

app.post("/api/chats", requireAuthSafe, async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    // CREATE A NEW CHAT
    const newChat = new Chat({
      userId: userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    // CHECK IF THE USERCHATS EXISTS
    const userChats = await UserChats.find({ userId: userId });

    // IF DOESN'T EXISTS CREATE A NEW ONE AND ADD THE CHAT IN THE CHATS ARRAY
    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [
          {
            _id: savedChat._id,
            title: text.substring(0, 40),
          },
        ],
      });

      await newUserChats.save();
    } else {
      // IF EXISTS, PUSH THE CHAT TO THE EXISTING ARRAY
      await UserChats.updateOne(
        { userId: userId },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
            },
          },
        }
      );

      res.status(201).send(newChat._id);
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating chat!");
  }
});

app.get("/api/userchats", requireAuthSafe, async (req, res) => {
  const userId = req.auth.userId;

  try {
    let userChats = await UserChats.findOne({ userId });

    // ✅ Auto-create if missing
    if (!userChats) {
      userChats = new UserChats({
        userId,
        chats: [],
      });
      await userChats.save();
    }

    res.status(200).send(userChats.chats);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.get("/api/chats/:id", requireAuthSafe, async (req, res) => {
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });

    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.put("/api/chats/:id", requireAuthSafe, async (req, res) => {
  const userId = req.auth.userId;

  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {

    const updateChat = await Chat.updateOne({ _id: req.params.id, userId },{
      $push:{
        history:{
          $each: newItems,
        },
      }
    });
    res.status(200).send(updateChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding conversation!");
  }
})

app.listen(port, () => {
  connect()
  console.log("Server running on 3000")
});
