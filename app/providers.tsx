'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { base, baseSepolia } from 'viem/chains';
import { Toaster } from 'sonner';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        appearance: { 
            theme: 'dark', 
            accentColor: '#3b82f6',
            showWalletLoginFirst: false,
        },
        embeddedWallets: {
            // FIX: 'createOnLogin' must be nested inside 'ethereum'
            ethereum: {
                createOnLogin: 'users-without-wallets',
            },
            // 'noPromptOnSignature' is deprecated. 
            // Use 'showWalletUIs: true' (default) to show prompts, or 'false' to hide them.
            showWalletUIs: true, 
        }
      }}
    >
      {children}
      <Toaster position="bottom-right" theme="dark" richColors />
    </PrivyProvider>
  );
}