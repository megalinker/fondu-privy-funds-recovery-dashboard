// app/page.tsx
'use client';

// ... (Imports and CHAIN_CONFIG same as previous step) ...
import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import Safe from '@safe-global/protocol-kit';
import { formatUnits, createPublicClient, custom, type EIP1193Provider } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import SafeCard, { SafeData } from './components/SafeCard';
import { toast } from 'sonner';
import { Plus, Wallet, LogOut, ChevronDown, Loader2, Shield } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// --- Configuration ---
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
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

// ... (Keep Storage Helpers getStoredAddresses, addAddressToStorage, removeAddressFromStorage same as before) ...
const getStoredAddresses = (chainId: number): string[] => {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(`safes_${chainId}`);
  return raw ? JSON.parse(raw) : [];
};

const addAddressToStorage = (chainId: number, address: string) => {
  const current = getStoredAddresses(chainId);
  if (!current.includes(address)) {
    localStorage.setItem(`safes_${chainId}`, JSON.stringify([...current, address]));
  }
};

const removeAddressFromStorage = (chainId: number, address: string) => {
  const current = getStoredAddresses(chainId);
  const updated = current.filter(a => a !== address);
  localStorage.setItem(`safes_${chainId}`, JSON.stringify(updated));
};

export default function Home() {
  const { login, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const [currentChainId, setCurrentChainId] = useState<number>(84532);
  const [safeAddressInput, setSafeAddressInput] = useState('');
  const [safes, setSafes] = useState<SafeData[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);

  // 1. Get Provider Helper
  const getProvider = useCallback(async (targetChainId: number = currentChainId): Promise<EIP1193Provider> => {
    const wallet = wallets.find((w) => w.address === user?.wallet?.address);
    if (!wallet) throw new Error('Wallet not found');
    const walletChainId = Number(wallet.chainId.split(':')[1]);
    if (walletChainId !== targetChainId) await wallet.switchChain(targetChainId);
    return await wallet.getEthereumProvider() as unknown as EIP1193Provider;
  }, [wallets, user, currentChainId]);

  // 2. Fetcher
  const fetchSafeData = async (address: string, chainId: number, provider: any): Promise<SafeData> => {
    const config = CHAIN_CONFIG[chainId];
    const userAddress = user?.wallet?.address as `0x${string}`;

    const protocolKit = await Safe.init({ provider: provider, safeAddress: address, signer: userAddress });
    const publicClient = createPublicClient({ chain: config.chainObj, transport: custom(provider) });

    const [owners, threshold, version, modules, isOwner, usdcBalanceRaw] = await Promise.all([
      protocolKit.getOwners(),
      protocolKit.getThreshold(),
      protocolKit.getContractVersion(),
      protocolKit.getModules(),
      protocolKit.isOwner(userAddress),
      publicClient.readContract({ address: config.usdcAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] })
    ]);

    const has4337 = modules.some((m: string) => m.toLowerCase() === config.moduleAddress.toLowerCase());

    return {
      id: `${chainId}-${address}`,
      address, version, threshold, owners,
      balanceUSDC: formatUnits(usdcBalanceRaw, 6),
      isOwner, modules, is4337Enabled: has4337
    };
  };

  // 3. Hydrate
  useEffect(() => {
    const hydrateSafes = async () => {
      if (!authenticated || !user?.wallet) return;
      setIsInitializing(true);
      setSafes([]);

      try {
        const storedAddresses = getStoredAddresses(currentChainId);
        if (storedAddresses.length === 0) {
          setIsInitializing(false);
          return;
        }
        const provider = await getProvider(currentChainId);
        const results = await Promise.allSettled(storedAddresses.map(addr => fetchSafeData(addr, currentChainId, provider)));
        const loadedSafes: SafeData[] = [];
        results.forEach((res) => {
          if (res.status === 'fulfilled') loadedSafes.push(res.value);
        });
        setSafes(loadedSafes);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load saved Safes');
      } finally {
        setIsInitializing(false);
      }
    };
    hydrateSafes();
  }, [currentChainId, authenticated, user?.wallet?.address]); // Removed getProvider to avoid cycles

  // 4. Add Safe
  const handleAddSafe = async () => {
    if (!safeAddressInput || !authenticated) return;
    if (safes.find(s => s.address.toLowerCase() === safeAddressInput.toLowerCase())) {
      toast.error('Safe already added');
      return;
    }
    setLoadingSafe(true);
    try {
      const provider = await getProvider();
      const newSafe = await fetchSafeData(safeAddressInput, currentChainId, provider);
      setSafes(prev => [...prev, newSafe]);
      addAddressToStorage(currentChainId, newSafe.address);
      setSafeAddressInput('');
      toast.success('Safe added successfully');
    } catch (e: any) {
      console.error(e);
      toast.error('Could not find Safe. Check address/network.');
    } finally {
      setLoadingSafe(false);
    }
  };

  // 5. Remove Safe
  const removeSafe = (safeId: string) => {
    const safeToRemove = safes.find(s => s.id === safeId);
    if (safeToRemove) {
      setSafes(prev => prev.filter(s => s.id !== safeId));
      removeAddressFromStorage(currentChainId, safeToRemove.address);
      toast.info('Safe removed from list');
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-blue-500/30">

      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 left-0 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Shield className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Safe<span className="text-blue-500">Manager</span></span>
          </div>

          {authenticated && (
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full pl-4 pr-2 py-1.5 transition hover:border-zinc-700">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <select
                    className="bg-transparent text-sm text-zinc-300 outline-none appearance-none cursor-pointer pr-6"
                    value={currentChainId}
                    onChange={(e) => setCurrentChainId(Number(e.target.value))}
                  >
                    <option value={84532}>Base Sepolia</option>
                    <option value={8453}>Base Mainnet</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-3 pointer-events-none" />
                </div>
              </div>
              <button onClick={logout} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Layout */}
      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto min-h-screen">
        {!authenticated ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-[70vh] text-center"
          >
            <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-900/30">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight mb-4">
              Next-Gen <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Safe Management</span>
            </h1>
            <p className="text-xl text-zinc-400 max-w-lg mb-10 leading-relaxed">
              Manage your Safe accounts with the power of Account Abstraction. Gasless transfers, instant updates, and a beautiful interface.
            </p>
            <button
              onClick={login}
              className="group relative px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:bg-zinc-200 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
            >
              <span className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Connect Wallet
              </span>
            </button>
          </motion.div>
        ) : (
          <div className="space-y-12">

            {/* Input Hero Section */}
            <section className="max-w-3xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-2xl">
                  <div className="pl-4 text-zinc-500">
                    <Shield className="w-6 h-6" />
                  </div>
                  <input
                    type="text"
                    placeholder="Paste Safe Address (0x...)"
                    className="w-full bg-transparent border-none text-white text-lg px-4 py-4 focus:ring-0 placeholder-zinc-600 font-mono"
                    value={safeAddressInput}
                    onChange={(e) => setSafeAddressInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSafe()}
                  />
                  <button
                    onClick={handleAddSafe}
                    disabled={loadingSafe || !safeAddressInput}
                    className="bg-zinc-100 hover:bg-white text-black px-6 py-3 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loadingSafe ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    <span className="hidden sm:inline">Add Safe</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Content Grid */}
            <section>
              {isInitializing ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <p className="text-zinc-500">Syncing your Safes...</p>
                </div>
              ) : safes.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
                  <p className="text-zinc-500 text-lg">No Safes loaded on {CHAIN_CONFIG[currentChainId].name}</p>
                  <p className="text-zinc-600 text-sm mt-2">Paste an address above to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <AnimatePresence>
                    {safes.map(safe => (
                      <SafeCard
                        key={safe.id}
                        data={safe}
                        currentUserAddress={user?.wallet?.address!}
                        config={CHAIN_CONFIG[currentChainId]}
                        getProvider={() => getProvider(currentChainId)}
                        onRemove={removeSafe}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}