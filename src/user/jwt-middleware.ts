import { NextFunction, Request, Response } from "express";
import { createDecorator } from "../../lib/decorators/middleware";

export const checkAuth = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // const token = req.headers.authorization?.split(" ")[1];
    // if (!token) {
    //   return res
    //     .status(401)
    //     .json({ message: "Unauthorized", error: "No token provided" });
    // }
    try {
      (req as any).user = { id: 1, name: "Test User" };
      next();
    } catch (error) {
      return res
        .status(401)
        .json({ message: "Unauthorized", error: "Error validating token" });
    }
  };
};

export const IsAuthenticated = () => createDecorator(checkAuth());
