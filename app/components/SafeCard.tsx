// --- File: app/components/SafeCard.tsx ---
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Zap, Copy, Trash2, Rocket, Shield, Check
} from 'lucide-react';
import Safe from '@safe-global/protocol-kit';
import { Safe4337Pack } from '@safe-global/relay-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { parseUnits, encodeFunctionData, type EIP1193Provider } from 'viem';
import styles from './SafeCard.module.css';

// ... (Keep SafeData and ERC20_ABI same) ...
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
    const [isExpanded, setIsExpanded] = useState(false);
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
        toast.success('Coordinates copied');
    };

    const handleTransfer = async () => {
        if (!recipient || !amount) {
            toast.error('Target coordinates missing');
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading('Initiating protocol...');

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
                toast.message('Broadcasting...', { id: toastId });
                const userOpHash = await safe4337Pack.executeTransaction({ executable: signedSafeOperation });

                let receipt = null;
                while (!receipt) {
                    await new Promise(r => setTimeout(r, 2000));
                    receipt = await safe4337Pack.getUserOperationReceipt(userOpHash);
                }
                toast.success('Funds extracted successfully!', { id: toastId });
            } else {
                toast.message('Wallet Signature Required...', { id: toastId });
                const protocolKit = await Safe.init({ provider: provider as any, safeAddress: data.address, signer: currentUserAddress });
                const safeTransaction = await protocolKit.createTransaction({ transactions });
                const signedSafeTx = await protocolKit.signTransaction(safeTransaction);
                toast.message('Executing...', { id: toastId });
                await protocolKit.executeTransaction(signedSafeTx);
                toast.success('Funds extracted successfully!', { id: toastId });
            }
            setAmount('');
            setRecipient('');
            setIsExpanded(false);
        } catch (e: any) {
            console.error(e);
            toast.error(`Error: ${e.message.slice(0, 30)}...`, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={styles.card}
        >
            {/* Header */}
            <div className={styles.header}>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div className={styles.iconWrapper} style={{ color: data.is4337Enabled ? '#a855f7' : '#eab308' }}>
                        {data.is4337Enabled ? <Zap size={20} /> : <Shield size={20} />}
                    </div>
                    <div className={styles.info}>
                        <div className={styles.titleRow}>
                            <span className={styles.title}>Asset Vault</span>
                            {data.is4337Enabled &&
                                <span className={styles.badge} style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe' }}>
                                    Gasless
                                </span>
                            }
                        </div>
                        <button onClick={() => copyToClipboard(data.address)} className={styles.copyBtn}>
                            {data.address.slice(0, 6)}...{data.address.slice(-4)}
                            {hasCopied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                        </button>
                    </div>
                </div>
                <button onClick={() => onRemove(data.id)} className={styles.removeBtn}>
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Balance */}
            <div className={styles.balanceSection}>
                <span className={styles.label}>Detected Value</span>
                <div>
                    <span className={styles.value}>{data.balanceUSDC}</span>
                    <span className={styles.currency}>USDC</span>
                </div>
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                <div className={styles.statusRow}>
                    <span className={styles.owners}>
                        {data.threshold}/{data.owners.length} Signers
                    </span>

                    {data.isOwner ? (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`${styles.actionBtn} ${isExpanded ? styles.cancel : ''}`}
                        >
                            {isExpanded ? 'Cancel' : 'Recover Funds'}
                        </button>
                    ) : (
                        <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Read Only</span>
                    )}
                </div>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className={styles.form}
                        >
                            <input
                                value={recipient}
                                onChange={e => setRecipient(e.target.value)}
                                placeholder="Destination Address (0x...)"
                                className={styles.input}
                            />
                            <div style={{ position: 'relative' }}>
                                <input
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="Amount"
                                    type="number"
                                    className={styles.input}
                                />
                                <span style={{ position: 'absolute', right: 12, top: 10, fontSize: '0.8rem', color: '#71717a' }}>USDC</span>
                            </div>
                            <button
                                onClick={handleTransfer}
                                disabled={isLoading}
                                className={styles.fireBtn}
                            >
                                {isLoading ? 'Processing...' : <><Rocket size={18} /> Execute Transfer</>}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}