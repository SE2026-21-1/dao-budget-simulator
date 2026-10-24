import { createContext } from "react";
import type { Address } from "viem";

export type WalletState = {
  account: Address | null;
  chainId: number | null;
  busy: boolean;
  error: string | null;
  balance: bigint | null;
  delegatee: Address | null;
  votingPower: bigint | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const WalletContext = createContext<WalletState | null>(null);
