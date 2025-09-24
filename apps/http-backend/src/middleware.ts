import { JWT_SECRET } from "@repo/shared";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers["token"];

  // @ts-ignore
  const decode = jwt.verify(token, JWT_SECRET);

  if (decode) {
    // @ts-ignore
    req.userId = decode.userId;
    next();
  } else {
    res.status(403).json({
      msg: "unauthorized",
    });
  }
};
