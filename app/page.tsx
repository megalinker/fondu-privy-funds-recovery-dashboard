'use client';

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import Safe from '@safe-global/protocol-kit';
import { Safe4337Pack } from '@safe-global/relay-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import {
  parseUnits,
  formatUnits,
  encodeFunctionData,
  createPublicClient,
  custom,
  type EIP1193Provider
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

// --- Configuration ---
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

// USDC ABI (Only what we need)
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
] as const;

const CHAIN_CONFIG: Record<number, {
  name: string;
  chainObj: any;
  bundlerUrl: string;
  paymasterUrl: string;
  moduleAddress: string;
  explorer: string;
  usdcAddress: `0x${string}`;
}> = {
  // Base Sepolia
  84532: {
    name: 'Base Sepolia',
    chainObj: baseSepolia,
    bundlerUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc9437809C22a8',
    explorer: 'https://sepolia.basescan.org',
    // Official Circle USDC on Base Sepolia
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  },
  // Base Mainnet
  8453: {
    name: 'Base Mainnet',
    chainObj: base,
    bundlerUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    paymasterUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`,
    moduleAddress: '0x75cf11467937ce3F2f357CE24ffc9437809C22a8',
    explorer: 'https://basescan.org',
    // Native USDC on Base
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  }
};

type SafeDetails = {
  address: string;
  version: string;
  threshold: number;
  owners: string[];
  balanceUSDC: string; // Changed from balance to balanceUSDC
  isOwner: boolean;
  modules: string[];
  is4337Enabled: boolean;
};

export default function Home() {
  const { login, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // --- State ---
  const [currentChainId, setCurrentChainId] = useState<number>(84532);
  const [safeAddressInput, setSafeAddressInput] = useState('');
  const [safeDetails, setSafeDetails] = useState<SafeDetails | null>(null);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1.0'); // Default 1 USDC
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState('');

  // --- Helpers ---
  const getProvider = async (): Promise<EIP1193Provider> => {
    const wallet = wallets.find((w) => w.address === user?.wallet?.address);
    if (!wallet) throw new Error('Wallet not found');

    const walletChainId = Number(wallet.chainId.split(':')[1]);
    if (walletChainId !== currentChainId) {
      setStatus(`Switching wallet to ${CHAIN_CONFIG[currentChainId].name}...`);
      await wallet.switchChain(currentChainId);
    }
    return await wallet.getEthereumProvider() as unknown as EIP1193Provider;
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // --- Core Logic ---

  const checkSafeStatus = async () => {
    if (!safeAddressInput || !authenticated) return;
    setStatus('Fetching Safe & USDC Data...');
    setIsLoading(true);
    setSafeDetails(null);

    try {
      const provider = await getProvider();
      const userAddress = user?.wallet?.address as `0x${string}`;
      const config = CHAIN_CONFIG[currentChainId];

      // 1. Init Protocol Kit
      const protocolKit = await Safe.init({
        provider: provider as any,
        safeAddress: safeAddressInput,
        signer: userAddress,
      });

      // 2. Create Viem Client for reading USDC contract
      const publicClient = createPublicClient({
        chain: config.chainObj,
        transport: custom(provider)
      });

      // 3. Fetch Safe Data + USDC Balance in parallel
      const [
        owners,
        threshold,
        version,
        modules,
        isOwner,
        usdcBalanceRaw
      ] = await Promise.all([
        protocolKit.getOwners(),
        protocolKit.getThreshold(),
        protocolKit.getContractVersion(),
        protocolKit.getModules(),
        protocolKit.isOwner(userAddress),
        publicClient.readContract({
          address: config.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [safeAddressInput as `0x${string}`]
        })
      ]);

      const has4337 = modules.some(
        (m) => m.toLowerCase() === config.moduleAddress.toLowerCase()
      );

      setSafeDetails({
        address: safeAddressInput,
        version,
        threshold,
        owners,
        balanceUSDC: formatUnits(usdcBalanceRaw, 6), // USDC has 6 decimals
        modules,
        isOwner,
        is4337Enabled: has4337
      });

      setStatus('✅ Safe Loaded');

    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!safeDetails || !recipient) return;
    setIsLoading(true);
    setTxHash('');
    setStatus('Preparing USDC transaction...');

    try {
      const provider = await getProvider();
      const signerAddress = user?.wallet?.address;
      const config = CHAIN_CONFIG[currentChainId];

      // 1. Encode the ERC-20 Transfer
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [
          recipient as `0x${string}`,
          parseUnits(amount, 6) // USDC = 6 Decimals
        ]
      });

      // 2. Create the Safe Transaction Payload
      const transactions: MetaTransactionData[] = [{
        to: config.usdcAddress, // Interaction target is the USDC Contract
        value: '0',             // 0 ETH sent
        data: transferData,     // Encoded "transfer" call
        operation: OperationType.Call,
      }];

      if (safeDetails.is4337Enabled) {
        setStatus('Initializing 4337 Pack...');

        const safe4337Pack = await Safe4337Pack.init({
          provider: provider as any,
          signer: signerAddress!,
          bundlerUrl: config.bundlerUrl,
          options: { safeAddress: safeDetails.address },
          paymasterOptions: {
            isSponsored: true,
            paymasterUrl: config.paymasterUrl,
          }
        });

        setStatus('Signing USDC UserOp...');
        const safeOperation = await safe4337Pack.createTransaction({ transactions });
        const signedSafeOperation = await safe4337Pack.signSafeOperation(safeOperation);

        setStatus('Submitting to Bundler...');
        const userOpHash = await safe4337Pack.executeTransaction({
          executable: signedSafeOperation
        });

        setStatus('Bundling...');
        let receipt = null;
        while (!receipt) {
          await new Promise(r => setTimeout(r, 2000));
          receipt = await safe4337Pack.getUserOperationReceipt(userOpHash);
        }
        setTxHash(receipt.receipt.transactionHash);
        setStatus('✅ USDC Transfer Complete!');
      }
      else {
        setStatus('Initializing Standard Tx...');
        const protocolKit = await Safe.init({
          provider: provider as any,
          safeAddress: safeDetails.address,
          signer: signerAddress
        });

        const safeTransaction = await protocolKit.createTransaction({ transactions });

        setStatus('Sign in Wallet...');
        const signedSafeTx = await protocolKit.signTransaction(safeTransaction);

        if (safeDetails.threshold > 1) {
          setStatus('⚠️ Warning: Threshold > 1. Tx will likely fail on-chain.');
        }

        setStatus('Broadcasting...');
        const result = await protocolKit.executeTransaction(signedSafeTx);
        setTxHash(result.hash);
        setStatus('✅ USDC Transfer Complete!');
      }

    } catch (error: any) {
      console.error(error);
      setStatus(`Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex flex-col items-center">
      <div className="max-w-2xl w-full space-y-8">

        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold">Safe + USDC + Pimlico</h1>
          {authenticated && (
            <div className="text-right">
              <div className="font-mono text-sm text-blue-400">{truncate(user?.wallet?.address || '')}</div>
              <button onClick={logout} className="text-xs text-red-500 hover:underline">Logout</button>
            </div>
          )}
        </div>

        {!authenticated ? (
          <div className="text-center py-20">
            <button onClick={login} className="px-8 py-4 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition">
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select
                className="bg-gray-900 border border-gray-700 p-3 rounded-lg"
                value={currentChainId}
                onChange={(e) => setCurrentChainId(Number(e.target.value))}
              >
                <option value={84532}>Base Sepolia</option>
                <option value={8453}>Base Mainnet</option>
              </select>

              <div className="md:col-span-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Safe Address (0x...)"
                  className="flex-1 bg-gray-900 border border-gray-700 p-3 rounded-lg font-mono"
                  value={safeAddressInput}
                  onChange={(e) => setSafeAddressInput(e.target.value)}
                />
                <button
                  onClick={checkSafeStatus}
                  disabled={isLoading}
                  className="bg-blue-600 px-6 rounded-lg font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  Load
                </button>
              </div>
            </div>

            {status && (
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 text-center text-sm font-medium">
                {status}
              </div>
            )}

            {safeDetails && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 bg-gray-800/50 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">Safe Dashboard</h2>
                    <p className="text-xs text-gray-400 font-mono mt-1">{safeDetails.address}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-400">{safeDetails.balanceUSDC} USDC</div>
                    <div className="text-xs text-gray-400">Balance</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-gray-800">
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Version</div>
                    <div className="font-semibold">{safeDetails.version}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Threshold</div>
                    <div className="font-semibold">{safeDetails.threshold} / {safeDetails.owners.length}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Mode</div>
                    <div className={`font-bold ${safeDetails.is4337Enabled ? 'text-green-400' : 'text-yellow-400'}`}>
                      {safeDetails.is4337Enabled ? '4337 (Pimlico)' : 'Standard'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">My Status</div>
                    {safeDetails.isOwner ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-200">
                        OWNER
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-200">
                        WATCH ONLY
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-gray-800/30">
                  {!safeDetails.isOwner ? (
                    <div className="text-center text-red-400 py-4">
                      You are not an owner.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg">Send USDC</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-400">Recipient</label>
                          <input
                            className="w-full bg-gray-950 border border-gray-700 p-2 rounded mt-1"
                            value={recipient}
                            onChange={e => setRecipient(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Amount (USDC)</label>
                          <input
                            className="w-full bg-gray-950 border border-gray-700 p-2 rounded mt-1"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleTransfer}
                        disabled={isLoading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold disabled:opacity-50"
                      >
                        {isLoading ? 'Processing...' : 'Send USDC'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {txHash && (
              <div className="text-center p-4 bg-green-900/20 border border-green-800 rounded-xl">
                <div className="font-bold text-green-400 mb-2">Transaction Successfully Submitted!</div>
                <a href={`${CHAIN_CONFIG[currentChainId].explorer}/tx/${txHash}`} target="_blank" className="text-blue-400 hover:underline break-all">
                  View on Explorer
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}