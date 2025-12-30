// app/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import Safe from '@safe-global/protocol-kit';
import { formatUnits, createPublicClient, custom, type EIP1193Provider } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import SafeCard, { SafeData } from './components/SafeCard';
import { toast } from 'sonner';
import { Plus, Power, Search, LayoutDashboard, ChevronDown } from 'lucide-react'; // Added ChevronDown
import { AnimatePresence, motion } from 'framer-motion';
import styles from './page.module.css';

// ... (Keep Constants, Config, and Helper Functions exactly as they were) ...
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const ERC20_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const;

const CHAIN_CONFIG: any = {
  84532: {
    name: 'Base Sepolia',
    chainObj: baseSepolia,
    bundlerUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
    explorer: 'https://sepolia.basescan.org',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  },
  8453: {
    name: 'Base Mainnet',
    chainObj: base,
    bundlerUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
    explorer: 'https://basescan.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  }
};

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

  // ... (Keep logic: getProvider, fetchSafeData, hydrate, actions same) ...
  const getProvider = useCallback(async (targetChainId: number = currentChainId): Promise<EIP1193Provider> => {
    const wallet = wallets.find((w) => w.address === user?.wallet?.address);
    if (!wallet) throw new Error('Wallet not found');
    const walletChainId = Number(wallet.chainId.split(':')[1]);
    if (walletChainId !== targetChainId) await wallet.switchChain(targetChainId);
    return await wallet.getEthereumProvider() as unknown as EIP1193Provider;
  }, [wallets, user, currentChainId]);

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
        toast.error('Initialization failed');
      } finally {
        setIsInitializing(false);
      }
    };
    hydrateSafes();
  }, [currentChainId, authenticated, user?.wallet?.address]);

  const handleAddSafe = async () => {
    if (!safeAddressInput || !authenticated) return;
    if (!safeAddressInput.startsWith('0x') || safeAddressInput.length !== 42) {
      toast.error('Invalid coordinates format!');
      return;
    }
    if (safes.find(s => s.address.toLowerCase() === safeAddressInput.toLowerCase())) {
      toast.error('Already tracking this vault!');
      return;
    }
    setLoadingSafe(true);
    try {
      const provider = await getProvider();
      const newSafe = await fetchSafeData(safeAddressInput, currentChainId, provider);
      setSafes(prev => [...prev, newSafe]);
      addAddressToStorage(currentChainId, newSafe.address);
      setSafeAddressInput('');
      toast.success('Vault targeted successfully');
    } catch (e: any) {
      console.error(e);
      toast.error('Target not found on this frequency');
    } finally {
      setLoadingSafe(false);
    }
  };

  const removeSafe = (safeId: string) => {
    const safeToRemove = safes.find(s => s.id === safeId);
    if (safeToRemove) {
      setSafes(prev => prev.filter(s => s.id !== safeId));
      removeAddressFromStorage(currentChainId, safeToRemove.address);
      toast.info('Target removed from Inator');
    }
  };

  const totalBalance = useMemo(() => {
    return safes.reduce((acc, safe) => acc + parseFloat(safe.balanceUSDC), 0);
  }, [safes]);

  return (
    <div className="layout-root">

      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <span style={{ color: '#9333ea' }}>FONDU</span>-FUNDS-BACK-<span style={{ color: '#22c55e' }}>INATOR</span>
          </div>

          {authenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

              {/* NEW: Interactive Network Switcher */}
              <div className={styles.networkControl}>
                <select
                  className={styles.networkSelect}
                  value={currentChainId}
                  onChange={(e) => setCurrentChainId(Number(e.target.value))}
                >
                  <option value={84532}>Sepolia (Sim)</option>
                  <option value={8453}>Base (Real)</option>
                </select>
                <ChevronDown size={14} className={styles.selectIcon} />
              </div>

              <button onClick={logout} className={styles.logoutBtn} title="Self Destruct">
                <Power size={20} />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className={styles.main}>
        {!authenticated ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.hero}>
            <h1 className={styles.heroTitle}>FONDU-FUNDS-BACK-INATOR</h1>
            <p className={styles.heroSubtitle}>
              Ah, behold my latest invention! The machine that will recover all the frozen assets
              trapped in the blockchain dimension!
            </p>
            <button onClick={login} className={styles.heroBtn}>
              Activate Machine
            </button>
          </motion.div>
        ) : (
          <div>
            <div className={styles.dashboardControls}>
              <div>
                <span className={styles.totalLabel}>TOTAL RECOVERABLE ASSETS</span>
                <span className={styles.totalAmount}>${totalBalance.toLocaleString()}</span>
              </div>
              <div className={styles.searchBar}>
                <input
                  className={styles.searchInput}
                  placeholder="Import Contract Coordinates (0x...)"
                  value={safeAddressInput}
                  onChange={(e) => setSafeAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSafe()}
                />
                <button
                  onClick={handleAddSafe}
                  disabled={loadingSafe}
                  className={styles.addBtn}
                >
                  {loadingSafe ? <div className="spin-anim"><Search size={16} /></div> : <Plus size={20} />}
                </button>
              </div>
            </div>

            <section>
              {isInitializing ? (
                <div style={{ textAlign: 'center', padding: 80, color: '#71717a' }}>
                  <p>Calibrating sensors...</p>
                </div>
              ) : safes.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={styles.empty}
                >
                  <LayoutDashboard size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                  <p>No targets found. Import a contract address to begin recovery.</p>
                </motion.div>
              ) : (
                <div className={styles.grid}>
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