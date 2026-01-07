import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { user } = await request.json();

    if (!user || !user.wallet) {
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    // Extract Google Info
    const googleAccount = user.linkedAccounts.find((a: any) => a.type === 'google_oauth');
    const walletAddress = user.wallet.address.toLowerCase();

    // Upsert User
    const record = await prisma.user.upsert({
      where: { walletAddress },
      update: {
        privyId: user.id,
        email: googleAccount?.email || null,
        name: googleAccount?.name || null,
        updatedAt: new Date(),
      },
      create: {
        privyId: user.id,
        walletAddress,
        email: googleAccount?.email || null,
        name: googleAccount?.name || null,
      },
    });

    return NextResponse.json({ success: true, user: record });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}