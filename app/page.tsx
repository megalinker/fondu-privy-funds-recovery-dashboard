'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import Safe from '@safe-global/protocol-kit';
import { formatUnits, createPublicClient, custom, type EIP1193Provider } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import SafeCard, { SafeData } from './components/SafeCard';

// --- Configuration ---
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

// USDC ABI (Partial)
const ERC20_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const;

const CHAIN_CONFIG: any = {
  84532: {
    name: 'Base Sepolia',
    chainObj: baseSepolia,
    bundlerUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc9437809C22a8',
    explorer: 'https://sepolia.basescan.org',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  },
  8453: {
    name: 'Base Mainnet',
    chainObj: base,
    bundlerUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc9437809C22a8',
    explorer: 'https://basescan.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  }
};

export default function Home() {
  const { login, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const [currentChainId, setCurrentChainId] = useState<number>(84532);
  const [safeAddressInput, setSafeAddressInput] = useState('');
  const [safes, setSafes] = useState<SafeData[]>([]);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [error, setError] = useState('');

  const getProvider = async (): Promise<EIP1193Provider> => {
    const wallet = wallets.find((w) => w.address === user?.wallet?.address);
    if (!wallet) throw new Error('Wallet not found');
    const walletChainId = Number(wallet.chainId.split(':')[1]);
    if (walletChainId !== currentChainId) await wallet.switchChain(currentChainId);
    return await wallet.getEthereumProvider() as unknown as EIP1193Provider;
  };

  const handleAddSafe = async () => {
    if (!safeAddressInput || !authenticated) return;
    // Check duplicates
    if (safes.find(s => s.address.toLowerCase() === safeAddressInput.toLowerCase())) {
      setError('Safe already added.');
      return;
    }

    setLoadingSafe(true);
    setError('');

    try {
      const provider = await getProvider();
      const config = CHAIN_CONFIG[currentChainId];
      const userAddress = user?.wallet?.address as `0x${string}`;

      // 1. Init Safe
      const protocolKit = await Safe.init({
        provider: provider as any,
        safeAddress: safeAddressInput,
        signer: userAddress,
      });

      // 2. Data Fetching
      const publicClient = createPublicClient({ chain: config.chainObj, transport: custom(provider) });
      const [owners, threshold, version, modules, isOwner, usdcBalanceRaw] = await Promise.all([
        protocolKit.getOwners(),
        protocolKit.getThreshold(),
        protocolKit.getContractVersion(),
        protocolKit.getModules(),
        protocolKit.isOwner(userAddress),
        publicClient.readContract({ address: config.usdcAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [safeAddressInput as `0x${string}`] })
      ]);

      const has4337 = modules.some(m => m.toLowerCase() === config.moduleAddress.toLowerCase());

      const newSafe: SafeData = {
        id: Math.random().toString(36).substr(2, 9),
        address: safeAddressInput,
        version,
        threshold,
        owners,
        balanceUSDC: formatUnits(usdcBalanceRaw, 6),
        isOwner,
        modules,
        is4337Enabled: has4337
      };

      setSafes(prev => [...prev, newSafe]);
      setSafeAddressInput(''); // Clear input on success
    } catch (e: any) {
      console.error(e);
      setError('Could not load Safe. Check network or address.');
    } finally {
      setLoadingSafe(false);
    }
  };

  const removeSafe = (id: string) => {
    setSafes(prev => prev.filter(s => s.id !== id));
  };

  const handleChainChange = (chainId: number) => {
    setCurrentChainId(chainId);
    setSafes([]); // Clear safes on chain switch to avoid errors
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">S</div>
            <h1 className="font-bold text-lg tracking-tight">Safe Manager</h1>
          </div>

          {authenticated && (
            <div className="flex items-center gap-4">
              <select
                className="bg-gray-800 border border-gray-700 text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                value={currentChainId}
                onChange={(e) => handleChainChange(Number(e.target.value))}
              >
                <option value={84532}>Base Sepolia</option>
                <option value={8453}>Base Mainnet</option>
              </select>
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-400">Connected</span>
                <span className="text-sm font-mono font-bold text-blue-400">
                  {user?.wallet?.address.slice(0, 6)}...{user?.wallet?.address.slice(-4)}
                </span>
              </div>
              <button onClick={logout} className="text-sm text-gray-500 hover:text-red-400 transition">Logout</button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {!authenticated ? (
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <h2 className="text-3xl font-bold mb-4">Manage Safes with AA</h2>
            <p className="text-gray-400 mb-8 text-center max-w-md">Connect your Privy wallet to manage multiple Safes, check ownership, and execute gasless transfers via Pimlico.</p>
            <button onClick={login} className="px-8 py-3 bg-blue-600 rounded-full font-bold hover:bg-blue-500 transition shadow-lg shadow-blue-900/20">
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Add Safe Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2 relative">
                <input
                  type="text"
                  placeholder="Enter Safe Address (0x...)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-5 py-4 focus:ring-2 focus:ring-blue-600 outline-none text-lg font-mono shadow-xl placeholder-gray-600 transition"
                  value={safeAddressInput}
                  onChange={(e) => setSafeAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSafe()}
                />
                <button
                  onClick={handleAddSafe}
                  disabled={loadingSafe}
                  className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {loadingSafe ? 'Loading...' : 'Add Safe'}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
            </div>

            {/* Grid of Safes */}
            {safes.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl">
                <p className="text-gray-600">No Safes loaded yet. Enter an address above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {safes.map(safe => (
                  <SafeCard
                    key={safe.id}
                    data={safe}
                    currentUserAddress={user?.wallet?.address!}
                    config={CHAIN_CONFIG[currentChainId]}
                    getProvider={getProvider}
                    onRemove={removeSafe}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}