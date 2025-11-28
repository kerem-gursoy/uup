import { Request, Response } from "express";

export const check = (_req: Request, res: Response) => {
  res.json({ message: "Backend running" });
};
