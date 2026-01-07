'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import Safe from '@safe-global/protocol-kit';
import { formatUnits, createPublicClient, custom, type EIP1193Provider } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import SafeCard, { SafeData } from './components/SafeCard';
import { toast } from 'sonner';
import { Plus, Power, Search, LayoutDashboard, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './page.module.css';

// --- CONSTANTS ---

const DEFAULT_SAFES = [
  "0xeAB30A69AC1384e7b88b6210E1ea9caC50FaEB6e",
  "0xc8eC161985773Bcc8Ba4548325c1afc6e7133983",
  "0x2eC614Ea50185011F05Fa872E8f533B990BD0967",
  "0xc219Cc527520d4336Ff0D8B06F6628f7cc30c67e",
  "0xe3f7c935A90542e92FEF0f335BC451A3f3af8655",
  "0x53Ae2424ADC0f3b576C5E968e2F20803cFF71cC6",
  "0x308A3405A5061d0369CB9eaeB37cd946F75B3e37",
  "0xCd3aA4ed72089dA7c7af02163dbD370F6e922eBF"
];

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

// --- HELPERS ---

const getStoredAddresses = (chainId: number): string[] => {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(`safes_${chainId}`);
  const stored = raw ? JSON.parse(raw) : [];
  
  // Only include defaults for Base Mainnet (8453)
  const defaults = chainId === 8453 ? DEFAULT_SAFES : [];
  
  // Return unique list
  return Array.from(new Set([...defaults, ...stored]));
};

const addAddressToStorage = (chainId: number, address: string) => {
  const current = getStoredAddresses(chainId);
  // Case insensitive check
  if (!current.some(a => a.toLowerCase() === address.toLowerCase())) {
    localStorage.setItem(`safes_${chainId}`, JSON.stringify([...current, address]));
  }
};

const removeAddressFromStorage = (chainId: number, address: string) => {
  const current = getStoredAddresses(chainId);
  const updated = current.filter(a => a.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(`safes_${chainId}`, JSON.stringify(updated));
};

// --- COMPONENT ---

export default function Home() {
  const { login, authenticated, logout, user, ready } = usePrivy();
  const { wallets } = useWallets();

  // Default to Base Mainnet (8453)
  const [currentChainId, setCurrentChainId] = useState<number>(8453);
  const [safeAddressInput, setSafeAddressInput] = useState('');
  const [safes, setSafes] = useState<SafeData[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);
  
  // Store resolved names: { "0x123": "John" }
  const [knownOwners, setKnownOwners] = useState<Record<string, string>>({});
  const syncedRef = useRef(false);

  // --- 1. SYNC USER TO DB ON LOGIN ---
  useEffect(() => {
    const syncUserToDB = async () => {
      if (ready && authenticated && user && !syncedRef.current) {
        syncedRef.current = true;
        try {
          await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
          });
          console.log("User Synced to DB");
        } catch (e) {
          console.error("Sync failed", e);
        }
      }
    };
    syncUserToDB();
  }, [ready, authenticated, user]);

  // --- 2. ROBUST PROVIDER GETTER ---
  const getProvider = useCallback(async (targetChainId: number = currentChainId): Promise<EIP1193Provider> => {
    const userAddress = user?.wallet?.address?.toLowerCase();
    if (!userAddress) throw new Error('User address not found');

    // Robust check: find wallet case-insensitively
    const wallet = wallets.find((w) => w.address.toLowerCase() === userAddress);
    
    if (!wallet) {
      // If called before wallet is ready, throw specific error
      throw new Error('Wallet interface not ready yet');
    }

    const walletChainId = Number(wallet.chainId.split(':')[1]);
    if (walletChainId !== targetChainId) await wallet.switchChain(targetChainId);
    
    return await wallet.getEthereumProvider() as unknown as EIP1193Provider;
  }, [wallets, user, currentChainId]);

  // --- 3. FETCH DATA LOGIC ---
  const fetchSafeData = async (address: string, chainId: number, provider: any): Promise<SafeData> => {
    const config = CHAIN_CONFIG[chainId];
    const userAddress = user?.wallet?.address as `0x${string}`;
    
    // Init Safe SDK
    const protocolKit = await Safe.init({ provider: provider, safeAddress: address, signer: userAddress });
    
    // Init Public Client for Balance
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

  // --- 4. HYDRATE SAFES (Wait for Wallet) ---
  useEffect(() => {
    const hydrateSafes = async () => {
      // CRITICAL: Wait until the specific wallet is found in the wallets array
      const currentWallet = wallets.find(w => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase());
      
      if (!authenticated || !user?.wallet || !currentWallet) return;

      setIsInitializing(true);
      setSafes([]);
      setKnownOwners({});

      try {
        const storedAddresses = getStoredAddresses(currentChainId);
        
        if (storedAddresses.length === 0) {
          setIsInitializing(false);
          return;
        }

        const provider = await getProvider(currentChainId);
        
        // Fetch all Safes in parallel
        const results = await Promise.allSettled(storedAddresses.map(addr => fetchSafeData(addr, currentChainId, provider)));
        
        const loadedSafes: SafeData[] = [];
        let allOwners: string[] = [];

        results.forEach((res) => {
          if (res.status === 'fulfilled') {
            loadedSafes.push(res.value);
            allOwners = [...allOwners, ...res.value.owners];
          } else {
            console.error("Failed to load safe:", res.reason);
          }
        });

        setSafes(loadedSafes);

        // Batch Resolve Owners via API
        if (allOwners.length > 0) {
            const uniqueOwners = Array.from(new Set(allOwners));
            try {
                const resp = await fetch('/api/users/resolve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ addresses: uniqueOwners })
                });
                const data = await resp.json();
                if (data.map) {
                    setKnownOwners(data.map);
                }
            } catch (err) {
                console.error("Failed to resolve owners", err);
            }
        }

      } catch (err: any) {
        console.error(err);
        // Ignore "not ready" errors, they will resolve on next render
        if (err.message !== 'Wallet interface not ready yet') {
             toast.error('Initialization failed');
        }
      } finally {
        setIsInitializing(false);
      }
    };

    hydrateSafes();
  // DEPENDENCIES: Include wallets.length so it re-runs when wallet initializes
  }, [currentChainId, authenticated, user?.wallet?.address, wallets.length, getProvider]); 

  // --- ACTIONS ---

  const handleAddSafe = async () => {
    if (!safeAddressInput || !authenticated) return;
    if (!safeAddressInput.startsWith('0x') || safeAddressInput.length !== 42) {
      toast.error('Invalid coordinates format!');
      return;
    }
    // Case insensitive check
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
      
      // Resolve new owners immediately
      const resp = await fetch('/api/users/resolve', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ addresses: newSafe.owners })
      });
      const data = await resp.json();
      if(data.map) setKnownOwners(prev => ({...prev, ...data.map}));

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
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <span style={{ color: '#9333ea' }}>FONDU</span>-FUNDS-BACK-<span style={{ color: '#22c55e' }}>INATOR</span>
          </div>
          {authenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={styles.networkControl}>
                <select
                  className={styles.networkSelect}
                  value={currentChainId}
                  onChange={(e) => setCurrentChainId(Number(e.target.value))}
                >
                  <option value={8453}>Base (Real)</option>
                  <option value={84532}>Sepolia (Sim)</option>
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
                        knownOwners={knownOwners}
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