'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Zap, Copy, Trash2, Rocket, Shield, Check, Users, User
} from 'lucide-react';
import Safe from '@safe-global/protocol-kit';
import { Safe4337Pack } from '@safe-global/relay-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { parseUnits, encodeFunctionData, type EIP1193Provider } from 'viem';
import styles from './SafeCard.module.css';

// Standard ERC20 Transfer ABI
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
    knownOwners: Record<string, string>; // Map of address -> Name/Email
    getProvider: () => Promise<EIP1193Provider>;
    onRemove: (id: string) => void;
}

export default function SafeCard({ data, currentUserAddress, config, knownOwners, getProvider, onRemove }: Props) {
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
            
            // Prepare ERC20 transfer data
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
                // --- GASLESS PATH (Relay Kit) ---
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

                // Wait for receipt
                let receipt = null;
                while (!receipt) {
                    await new Promise(r => setTimeout(r, 2000));
                    receipt = await safe4337Pack.getUserOperationReceipt(userOpHash);
                }
                
                toast.success('Funds extracted successfully!', { id: toastId });

            } else {
                // --- STANDARD PATH (Protocol Kit) ---
                toast.message('Wallet Signature Required...', { id: toastId });
                
                const protocolKit = await Safe.init({ 
                    provider: provider as any, 
                    safeAddress: data.address, 
                    signer: currentUserAddress 
                });

                const safeTransaction = await protocolKit.createTransaction({ transactions });
                const signedSafeTx = await protocolKit.signTransaction(safeTransaction);
                
                toast.message('Executing...', { id: toastId });
                await protocolKit.executeTransaction(signedSafeTx);
                
                toast.success('Funds extracted successfully!', { id: toastId });
            }

            // Cleanup
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

            {/* NEW: Owner List Area */}
            <div style={{ padding: '0 20px 20px' }}>
                <span className={styles.label} style={{ marginBottom: 8, display: 'block' }}>
                    Identified Signers ({data.threshold}/{data.owners.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {data.owners.map(owner => {
                        const normalizedOwner = owner.toLowerCase();
                        const knownIdentity = knownOwners[normalizedOwner];
                        
                        return (
                            <div key={owner} style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                fontSize: '0.8rem', 
                                color: '#e4e4e7',
                                background: '#27272a', 
                                padding: '8px 10px', 
                                borderRadius: '6px',
                                border: knownIdentity ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid transparent'
                            }}>
                                <User size={14} color={knownIdentity ? '#22c55e' : '#71717a'} />
                                
                                {knownIdentity ? (
                                    <div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.2}}>
                                        <span style={{fontWeight: 600, color: '#f4f4f5'}}>{knownIdentity}</span>
                                        <span style={{fontSize: '0.7rem', color: '#71717a', fontFamily: 'var(--font-mono)'}}>
                                            {owner.slice(0, 6)}...{owner.slice(-4)}
                                        </span>
                                    </div>
                                ) : (
                                    <span style={{fontFamily: 'var(--font-mono)', color: '#a1a1aa'}}>
                                        {owner.slice(0, 8)}...{owner.slice(-6)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                <div className={styles.statusRow}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                        <Users size={14} color="#71717a" />
                        <span style={{fontSize: '0.75rem', color: '#71717a'}}>
                            Vault Status
                        </span>
                    </div>

                    {data.isOwner ? (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`${styles.actionBtn} ${isExpanded ? styles.cancel : ''}`}
                        >
                            {isExpanded ? 'Cancel' : 'Recover Funds'}
                        </button>
                    ) : (
                        <span style={{ fontSize: '0.8rem', color: '#71717a', background: '#27272a', padding: '4px 8px', borderRadius: '4px' }}>
                            Read Only
                        </span>
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