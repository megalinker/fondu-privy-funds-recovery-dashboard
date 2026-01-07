import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { addresses } = await request.json(); // Array of strings

    if (!Array.isArray(addresses)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const normalizedAddresses = addresses.map((a: string) => a.toLowerCase());

    const users = await prisma.user.findMany({
      where: {
        walletAddress: { in: normalizedAddresses }
      },
      select: {
        walletAddress: true,
        email: true,
        name: true
      }
    });

    // Create a map: { "0x123...": "John Doe (john@gmail.com)" }
    const userMap: Record<string, string> = {};
    
    users.forEach(u => {
      if (u.email || u.name) {
        userMap[u.walletAddress] = u.email || u.name || '';
      }
    });

    return NextResponse.json({ map: userMap });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}