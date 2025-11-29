import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    const username = args[0];
    const password = args[1];

    if (!username || !password) {
        console.error("Usage: tsx scripts/create-user.ts <username> <password>");
        process.exit(1);
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
        console.error(`User '${username}' already exists.`);
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { username, password: hashedPassword },
    });

    console.log(`User '${user.username}' created successfully.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
