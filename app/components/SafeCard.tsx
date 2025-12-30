'use client';

import { useState } from 'react';
import Safe from '@safe-global/protocol-kit';
import { Safe4337Pack } from '@safe-global/relay-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { parseUnits, encodeFunctionData, type EIP1193Provider } from 'viem';

// Re-use ABI
const ERC20_ABI = [
    {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ type: 'bool' }]
    }
] as const;

export type SafeData = {
    id: string; // unique id for React keys
    address: string;
    version: string;
    threshold: number;
    owners: string[];
    balanceUSDC: string;
    isOwner: boolean;
    modules: string[];
    is4337Enabled: boolean;
};

interface Props {
    data: SafeData;
    currentUserAddress: string;
    config: any;
    getProvider: () => Promise<EIP1193Provider>;
    onRemove: (id: string) => void;
}

export default function SafeCard({ data, currentUserAddress, config, getProvider, onRemove }: Props) {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [txHash, setTxHash] = useState('');

    const handleTransfer = async () => {
        if (!recipient || !amount) return;
        setIsLoading(true);
        setStatus('Preparing...');
        setTxHash('');

        try {
            const provider = await getProvider();

            const transferData = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [recipient as `0x${string}`, parseUnits(amount, 6)]
            });

            const transactions: MetaTransactionData[] = [{
                to: config.usdcAddress,
                value: '0',
                data: transferData,
                operation: OperationType.Call,
            }];

            if (data.is4337Enabled) {
                setStatus('Init Pimlico...');
                const safe4337Pack = await Safe4337Pack.init({
                    provider: provider as any,
                    signer: currentUserAddress,
                    bundlerUrl: config.bundlerUrl,
                    options: { safeAddress: data.address },
                    paymasterOptions: { isSponsored: true, paymasterUrl: config.paymasterUrl }
                });

                setStatus('Signing UserOp...');
                const safeOperation = await safe4337Pack.createTransaction({ transactions });
                const signedSafeOperation = await safe4337Pack.signSafeOperation(safeOperation);

                setStatus('Submitting...');
                const userOpHash = await safe4337Pack.executeTransaction({ executable: signedSafeOperation });

                setStatus('Bundling...');
                let receipt = null;
                while (!receipt) {
                    await new Promise(r => setTimeout(r, 2000));
                    receipt = await safe4337Pack.getUserOperationReceipt(userOpHash);
                }
                setTxHash(receipt.receipt.transactionHash);
                setStatus('Success!');
            } else {
                setStatus('Init Standard...');
                const protocolKit = await Safe.init({
                    provider: provider as any,
                    safeAddress: data.address,
                    signer: currentUserAddress
                });

                const safeTransaction = await protocolKit.createTransaction({ transactions });
                setStatus('Sign in Wallet...');
                const signedSafeTx = await protocolKit.signTransaction(safeTransaction);
                setStatus('Broadcasting...');
                const result = await protocolKit.executeTransaction(signedSafeTx);
                setTxHash(result.hash);
                setStatus('Success!');
            }
        } catch (e: any) {
            console.error(e);
            setStatus(`Error: ${e.message.slice(0, 50)}...`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-full">
            {/* Header */}
            <div className="p-5 border-b border-gray-700 bg-gray-900/50 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-100">Safe</h3>
                        {data.isOwner ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">OWNER</span>
                        ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">WATCH ONLY</span>
                        )}
                    </div>
                    <p className="font-mono text-xs text-gray-500 break-all">{data.address}</p>
                </div>
                <button onClick={() => onRemove(data.id)} className="text-gray-500 hover:text-white transition">
                    ✕
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 divide-x divide-gray-700 border-b border-gray-700">
                <div className="p-4 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Balance</p>
                    <p className="text-xl font-bold text-blue-400">{data.balanceUSDC} <span className="text-sm text-gray-500">USDC</span></p>
                </div>
                <div className="p-4 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Mode</p>
                    <p className={`text-sm font-bold ${data.is4337Enabled ? 'text-purple-400' : 'text-yellow-400'}`}>
                        {data.is4337Enabled ? 'Gasless (4337)' : 'Standard'}
                    </p>
                </div>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-4">
                {/* If NOT Owner: Show Owners List */}
                {!data.isOwner && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-xs text-red-300 font-semibold mb-2">You are not an owner. Owners are:</p>
                        <ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            {data.owners.map(owner => (
                                <li key={owner} className="text-[10px] font-mono text-gray-400 bg-gray-900/50 p-1 rounded flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500"></div>
                                    {owner}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* If Owner: Show Transfer Form */}
                {data.isOwner && (
                    <div className="space-y-3 mt-auto">
                        <div>
                            <input
                                placeholder="Recipient Address (0x...)"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none transition"
                                value={recipient}
                                onChange={e => setRecipient(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <input
                                placeholder="Amount"
                                type="number"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none transition"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                            />
                            <button
                                onClick={handleTransfer}
                                disabled={isLoading}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded text-sm font-bold transition disabled:opacity-50 whitespace-nowrap"
                            >
                                {isLoading ? '...' : 'Send'}
                            </button>
                        </div>
                        {status && <p className="text-xs text-center text-gray-400 animate-pulse">{status}</p>}
                        {txHash && (
                            <a href={`${config.explorer}/tx/${txHash}`} target="_blank" className="block text-center text-xs text-green-400 hover:underline">
                                View Transaction ↗
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Info */}
            <div className="px-5 py-2 bg-gray-900 border-t border-gray-700 flex justify-between text-[10px] text-gray-500">
                <span>v{data.version}</span>
                <span>Threshold: {data.threshold}/{data.owners.length}</span>
            </div>
        </div>
    );
}