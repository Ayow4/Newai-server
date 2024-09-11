import express from "express";
import cors from "cors";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
// import FeedBack from "./models/feedBack.js";
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

app.use(express.json())

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log('Connected to MongoDB!');
  } catch (err) {
    console.error("Failed to connect to MongoDB: ", err);
  }
};

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
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

app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {

    const userChats = await UserChats.find({ userId })

    res.status(200).send(userChats[0].chats);

  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });

    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
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


// feedback
// app.post("/api/feedback", ClerkExpressRequireAuth(), async (req, res) => {
//   const userId = req.auth.userId;
//   const { rating, comment } = req.body;

//   console.log("Received feedback request:", req.body);

//   try {
//     const newFeedback = new FeedBack({
//       userId,
//       rating,
//       comment,
//     });

//     console.log("Saving feedback to database...");

//     await newFeedback.save();

//     console.log("Feedback saved successfully!");

//     res.status(201).send("Feedback submitted successfully!");
//   } catch (err) {
//     console.error("Error submitting feedback:", err);
//     res.status(500).send("Error submitting feedback!");
//   }
// });
// -------------------------------------------------- 
// app.get("/api/feedback", async (req, res) => {
//   try {
//     const feedback = await Feedback.find().exec();

//     res.status(200).send(feedback);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error fetching feedback!");
//   }
// });
// ////

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(401).send('Unauthenticated!')
});
// ---------try------------------
app.get("/read", ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId; // Ensure the user is authenticated
    const userChats = await UserChats.find({ userId }); // Fetch user chats for the authenticated user

    if (!userChats.length) {
      return res.status(404).send("No user chats found.");
    }

    res.status(200).send(userChats);
  } catch (err) {
    console.error("Error fetching user chats:", err);
    res.status(500).send("Error fetching user chats!"); // Send an error message
  }
});

app.listen(port, () => {
  connect()
  console.log("Server running on 3000")
});