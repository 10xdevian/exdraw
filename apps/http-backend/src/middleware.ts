import { JWT_SECRET } from "@repo/shared";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "@repo/db/client";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers["token"] || req.headers.authorization;

  if (!token || typeof token !== 'string') {
    return res.status(403).json({ msg: "unauthorized" });
  }

  try {
    const decode = jwt.verify(token, JWT_SECRET);
    if (decode) {
      // @ts-ignore
      const userId = (decode as any).userId;
      const userExists = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!userExists) {
        return res.status(403).json({ msg: "unauthorized - user deleted" });
      }
      // @ts-ignore
      req.userId = userId;
      next();
    } else {
      res.status(403).json({ msg: "unauthorized" });
    }
  } catch (e) {
    res.status(403).json({ msg: "unauthorized" });
  }
};
