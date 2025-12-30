'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { base, baseSepolia } from 'viem/chains'; // Import both chains

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Add both chains here
        defaultChain: baseSepolia,
        supportedChains: [base, baseSepolia],
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}