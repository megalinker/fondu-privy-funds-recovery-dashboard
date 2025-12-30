# 🧪 The Fondu-Funds-Back-Inator 3000

> *"Ah, behold my latest invention! The machine that will recover all the frozen assets trapped in the blockchain dimension! It's sleek, it's purple, and it handles ERC-4337 UserOperations effortlessly!"* — Dr. Heinz Doofenshmirtz

## 📖 The Backstory
During the great **Fondu Migration**, we removed the Privy integration, inadvertently trapping assets inside various Safe Smart Accounts. These funds were frozen in the "Fondu Dimension."

This application—**The Inator**—is a specialized recovery dashboard designed to locate these Safe contracts, verify ownership via your wallet, and execute extraction transactions to move funds back to safety.

## ✨ Features

*   **Multi-Mode Extraction:**
    *   ⚡ **Turbo Mode (ERC-4337):** Uses **Pimlico** and **Safe 4337 Module** for gasless, sponsored transactions.
    *   🛡️ **Classic Mode:** Uses standard Safe Protocol Kit signatures for legacy vaults.
*   **Dual Frequency Scanning:** Toggle instantly between **Base Sepolia** (Simulation) and **Base Mainnet** (Real World Domination).
*   **Secure Access:** powered by **Privy** and **Viem**.
*   **Sleek Villain UI:** A custom "Corporate Evil" aesthetic built with pure CSS Modules (No Tailwind dependencies).
*   **Real-time Data:** Live polling of USDC balances and transaction statuses.

## 🛠️ Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Auth:** Privy
*   **Blockchain SDKs:**
    *   Safe {Core} SDK (Protocol Kit & Relay Kit)
    *   Viem
*   **Account Abstraction:** Pimlico (Bundler & Paymaster)
*   **Styling:** CSS Modules & Framer Motion
*   **Icons:** Lucide React

## 🚀 Getting Started

### Prerequisites

*   Node.js 18+
*   A **Privy** App ID
*   A **Pimlico** API Key (supports Base & Base Sepolia)

### 1. Clone the Repository
```bash
git clone https://github.com/evil-inc/fondu-funds-back-inator.git
cd fondu-funds-back-inator
```

### 2. Install Dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory and add your keys:

```env
# Get this from https://dashboard.privy.io/
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Get this from https://dashboard.pimlico.io/
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key
```

### 4. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## 🕹️ How to Use

1.  **Connect Wallet:** Click "Activate Machine" to sign in via Privy.
2.  **Select Network:** Use the dropdown in the top right to choose between **Sepolia** (Test) or **Base** (Mainnet).
3.  **Locate Target:** Paste the Safe Address (0x...) into the input bar and click the **+** button.
4.  **Analyze Target:**
    *   The card will display the USDC balance.
    *   If you are a signer on the Safe, the "Recover Funds" button will appear.
    *   If you are not a signer, it will show "Read Only".
5.  **Execute Transfer:**
    *   Click "Recover Funds".
    *   Enter the destination address and amount.
    *   Click **"Execute Transfer"**.
    *   *Note: If the Safe has the 4337 module enabled, the app automatically handles the gas fees.*

## 📂 Project Structure

```
app/
├── components/
│   ├── SafeCard.tsx        # The individual vault interface
│   └── SafeCard.module.css # Styles for the card (Glass/Matte effect)
├── globals.css             # Global variables (Colors, Fonts)
├── layout.tsx              # Providers (Privy) wrapper
├── page.module.css         # Dashboard layout styles
└── page.tsx                # Main logic (State, Fetching, Network Switching)
```

## ⚠️ Self-Destruct Warning

Please ensure you are connected to the correct network before executing transactions. While this Inator is designed for good (mostly), blockchain transactions are irreversible. Don't let a Platypus distract you while clicking "Execute".

## 📜 License

Property of **Doofenshmirtz Evil Incorporated**.
*(Actually MIT License, feel free to fork).*