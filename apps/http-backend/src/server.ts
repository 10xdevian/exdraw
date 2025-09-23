import express from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { JWT_SECRET } from "@repo/shared";
const app = express();

app.use(express.json());

const users: any = [];

app.post("/singup", (req, res) => {
  const { username, email, password } = req.body;

  const newUser = { username, email, password };

  users.push(newUser);

  res.status(200).json({ message: "User created successfully", user: newUser });
});

app.post("/signin", (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u: any) => u.username === username);

  if (!user) {
    return res.status(404).json({
      msg: "User not found",
    });
  }

  if (user.password !== password) {
    return res.status(401).json({
      msg: "Invalid password",
    });
  }

  //  generate token
  const token = jwt.sign({ email: user.email }, JWT_SECRET);

  res.status(201).json({
    msg: "User logged in successfully",
    token,
  });
});

app.post("/create-room", authMiddleware, (req, res) => {
  res.send("Hy bro");
});

app.listen(3001, () => {
  console.log(`server is running on port http://localhost:3001 `);
});
console.log("Hello http y");
