#!/usr/bin/env python3
import argparse
import csv
import os
import sys
import time
from decimal import Decimal

from web3 import Web3

USDC_BASE = Web3.to_checksum_address("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
MULTICALL3_BASE = Web3.to_checksum_address("0xcA11bde05977b3631167028862bE2a173976CA11")
DEFAULT_RPC = "https://base-mainnet.g.alchemy.com/v2/w7o212MPLP8oZ1CN95Sqc"

# Minimal ERC20 ABI
ERC20_ABI = [
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
    {
        "name": "symbol",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "string"}],
    },
]

# Multicall3 aggregate3 ABI
MULTICALL3_ABI = [
    {
        "name": "aggregate3",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "calls",
                "type": "tuple[]",
                "components": [
                    {"name": "target", "type": "address"},
                    {"name": "allowFailure", "type": "bool"},
                    {"name": "callData", "type": "bytes"},
                ],
            }
        ],
        "outputs": [
            {
                "name": "returnData",
                "type": "tuple[]",
                "components": [
                    {"name": "success", "type": "bool"},
                    {"name": "returnData", "type": "bytes"},
                ],
            }
        ],
    }
]

def load_addresses(path: str) -> list[str]:
    addrs = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # allow comma-separated too (first column is address)
            addr = line.split(",")[0].strip()
            addrs.append(addr)
    return addrs

def to_checksum_addresses(w3: Web3, addrs: list[str]) -> tuple[list[str], list[str]]:
    ok, bad = [], []
    for a in addrs:
        if w3.is_address(a):
            ok.append(Web3.to_checksum_address(a))
        else:
            bad.append(a)
    return ok, bad

def rpc_retry(fn, retries=6, base_delay=0.4):
    last_err = None
    for i in range(retries):
        try:
            return fn()
        except Exception as e:
            last_err = e
            # backoff (helps with public RPC rate limits)
            time.sleep(base_delay * (2 ** i))
    raise last_err

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]

def get_usdc_nonzero_multicall(w3: Web3, addresses: list[str], chunk_size: int = 250):
    usdc = w3.eth.contract(address=USDC_BASE, abi=ERC20_ABI)
    mc3 = w3.eth.contract(address=MULTICALL3_BASE, abi=MULTICALL3_ABI)

    # fetch decimals + symbol once
    decimals = int(rpc_retry(lambda: usdc.functions.decimals().call()))
    try:
        symbol = rpc_retry(lambda: usdc.functions.symbol().call())
    except Exception:
        symbol = "USDC"

    nonzero = []

    for batch in chunked(addresses, chunk_size):
        calls = []
        for addr in batch:
            calldata = usdc.functions.balanceOf(addr)._encode_transaction_data()
            calls.append((USDC_BASE, True, calldata))

        results = rpc_retry(lambda: mc3.functions.aggregate3(calls).call())

        for addr, (success, ret) in zip(batch, results):
            if not success or not ret:
                continue
            raw = int.from_bytes(ret[-32:], byteorder="big")
            if raw > 0:
                human = (Decimal(raw) / (Decimal(10) ** decimals))
                nonzero.append((addr, raw, str(human), symbol))

    return nonzero

def main():
    p = argparse.ArgumentParser(
        description="Filter Base addresses that have non-zero Base USDC balance."
    )
    p.add_argument("addresses_file", help="Path to a .txt/.csv with one address per line (or address as first column).")
    p.add_argument("--rpc", default=os.getenv("BASE_RPC_URL", DEFAULT_RPC), help="Base RPC URL (default: https://mainnet.base.org)")
    p.add_argument("--chunk", type=int, default=250, help="Multicall chunk size (default: 250)")
    p.add_argument("--out", default="", help="Optional CSV output path")
    args = p.parse_args()

    w3 = Web3(Web3.HTTPProvider(args.rpc, request_kwargs={"timeout": 30}))
    if not w3.is_connected():
        print(f"ERROR: Could not connect to RPC: {args.rpc}", file=sys.stderr)
        sys.exit(2)

    raw_addrs = load_addresses(args.addresses_file)
    addrs, bad = to_checksum_addresses(w3, raw_addrs)

    if bad:
        print(f"Warning: skipped {len(bad)} invalid address(es).", file=sys.stderr)

    nonzero = get_usdc_nonzero_multicall(w3, addrs, chunk_size=args.chunk)

    # Print results
    for addr, raw, human, symbol in nonzero:
        print(f"{addr},{human} {symbol}")

    # Optional CSV
    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["address", "usdc_raw", "usdc", "symbol"])
            for row in nonzero:
                w.writerow(row)

if __name__ == "__main__":
    main()
