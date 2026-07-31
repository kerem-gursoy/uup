import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/jwtSecret.js";
import { hashPassword, verifyPassword } from "../services/passwordHash.js";

export const register = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        const existingUser = await req.prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: "Username already exists" });
        }

        const hashedPassword = await hashPassword(password);
        const user = await req.prisma.user.create({
            data: { username, password: hashedPassword },
        });

        // Auto-login after register
        const token = jwt.sign({ userId: user.id, username: user.username }, getJwtSecret(), {
            expiresIn: "7d",
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: "lax",
        });

        return res.status(201).json({ user: { id: user.id, username: user.username } });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({ error: "Registration failed" });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        console.log(`Login attempt for user: ${username}`);

        const user = await req.prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const validPassword = await verifyPassword(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, getJwtSecret(), {
            expiresIn: "7d",
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: "lax",
        });

        return res.json({ user: { id: user.id, username: user.username } });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ error: "Login failed" });
    }
};

export const logout = (req: Request, res: Response) => {
    res.clearCookie("token");
    return res.json({ message: "Logged out" });
};

export const me = async (req: Request, res: Response) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const decoded = jwt.verify(token, getJwtSecret()) as { userId: number };
        const user = await req.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, username: true },
        });

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        return res.json({ user });
    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
};
