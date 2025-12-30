'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
    Wallet, Shield, Zap, ExternalLink, Copy,
    Trash2, Send, Users, Activity
} from 'lucide-react';
import Safe from '@safe-global/protocol-kit';
import { Safe4337Pack } from '@safe-global/relay-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { parseUnits, encodeFunctionData, type EIP1193Provider } from 'viem';

// ... (Keep your ERC20_ABI and SafeData types same as before) ...
const ERC20_ABI = [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const;

export type SafeData = {
    id: string;
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
    const [isLoading, setIsLoading] = useState(false);

    // Helper for clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Address copied');
    };

    const handleTransfer = async () => {
        if (!recipient || !amount) {
            toast.error('Please fill in all fields');
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading('Initializing transaction...');

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
                toast.message('Signing UserOperation...', { id: toastId });

                const safe4337Pack = await Safe4337Pack.init({
                    provider: provider as any,
                    signer: currentUserAddress,
                    bundlerUrl: config.bundlerUrl,
                    options: { safeAddress: data.address },
                    paymasterOptions: { isSponsored: true, paymasterUrl: config.paymasterUrl }
                });

                const safeOperation = await safe4337Pack.createTransaction({ transactions });
                const signedSafeOperation = await safe4337Pack.signSafeOperation(safeOperation);

                toast.message('Submitting to Pimlico...', { id: toastId });
                const userOpHash = await safe4337Pack.executeTransaction({ executable: signedSafeOperation });

                // Polling
                let receipt = null;
                while (!receipt) {
                    await new Promise(r => setTimeout(r, 2000));
                    receipt = await safe4337Pack.getUserOperationReceipt(userOpHash);
                }

                toast.success('Gasless Transfer Successful!', {
                    id: toastId,
                    action: {
                        label: 'View',
                        onClick: () => window.open(`${config.explorer}/tx/${receipt.receipt.transactionHash}`, '_blank')
                    }
                });
            } else {
                // Standard Flow
                toast.message('Signing in Wallet...', { id: toastId });
                const protocolKit = await Safe.init({
                    provider: provider as any,
                    safeAddress: data.address,
                    signer: currentUserAddress
                });

                const safeTransaction = await protocolKit.createTransaction({ transactions });
                const signedSafeTx = await protocolKit.signTransaction(safeTransaction);

                toast.message('Broadcasting...', { id: toastId });
                const result = await protocolKit.executeTransaction(signedSafeTx);

                toast.success('Transaction Broadcasted!', {
                    id: toastId,
                    action: {
                        label: 'View',
                        onClick: () => window.open(`${config.explorer}/tx/${result.hash}`, '_blank')
                    }
                });
            }
            setAmount('');
            setRecipient('');
        } catch (e: any) {
            console.error(e);
            toast.error(`Failed: ${e.message.slice(0, 50)}...`, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-zinc-900/50 backdrop-blur-md border border-zinc-800 hover:border-zinc-700 rounded-2xl overflow-hidden shadow-2xl transition-all"
        >
            {/* Top Gradient Line */}
            <div className={`h-1 w-full bg-gradient-to-r ${data.is4337Enabled ? 'from-purple-500 to-blue-500' : 'from-yellow-500 to-orange-500'}`} />

            {/* Header */}
            <div className="p-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                        {data.is4337Enabled ? <Zap className="w-5 h-5 text-purple-400" /> : <Shield className="w-5 h-5 text-yellow-400" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                            Safe Wallet
                            {data.isOwner && <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Owner</span>}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-zinc-500">{data.address.slice(0, 6)}...{data.address.slice(-4)}</span>
                            <button onClick={() => copyToClipboard(data.address)} className="text-zinc-600 hover:text-zinc-300"><Copy className="w-3 h-3" /></button>
                            <a href={`${config.explorer}/address/${data.address}`} target="_blank" className="text-zinc-600 hover:text-zinc-300"><ExternalLink className="w-3 h-3" /></a>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => onRemove(data.id)}
                    className="text-zinc-600 hover:text-red-400 transition p-1 hover:bg-zinc-800 rounded"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Balance Card */}
            <div className="px-5 pb-5">
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">USDC Balance</p>
                        <p className="text-2xl font-bold text-white mt-1">{data.balanceUSDC}</p>
                    </div>
                    <div className="h-10 w-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                        <span className="font-bold text-blue-500">$</span>
                    </div>
                </div>
            </div>

            {/* Metadata Grid */}
            <div className="px-5 py-3 border-t border-zinc-800 grid grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                    <Activity className="w-3 h-3" />
                    <span>Threshold: <span className="text-zinc-200">{data.threshold}/{data.owners.length}</span></span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                    <Shield className="w-3 h-3" />
                    <span>v{data.version}</span>
                </div>
            </div>

            {/* Dynamic Content Area */}
            <div className="p-5 bg-zinc-950/30 border-t border-zinc-800 min-h-[140px] flex flex-col">
                {!data.isOwner ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-center space-y-2 opacity-60">
                        <Users className="w-8 h-8 text-zinc-600" />
                        <p className="text-sm text-zinc-400">Read-only view</p>
                        <div className="flex -space-x-2">
                            {data.owners.map((o, i) => (
                                <div key={o} className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-900 flex items-center justify-center text-[8px] text-zinc-500" title={o}>
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Execute Transfer</p>
                        <div className="relative">
                            <input
                                value={recipient}
                                onChange={e => setRecipient(e.target.value)}
                                placeholder="Recipient Address (0x...)"
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    type="number"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                                />
                                <span className="absolute right-3 top-2 text-xs text-zinc-500 font-bold">USDC</span>
                            </div>
                            <button
                                onClick={handleTransfer}
                                disabled={isLoading}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 rounded-lg flex items-center justify-center transition-colors shadow-lg shadow-blue-900/20"
                            >
                                {isLoading ? <Activity className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}