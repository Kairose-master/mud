import { MUDChain, mudFoundry, redstone, garnet } from "@latticexyz/common/chains";
import { baseSepolia } from "viem/chains";

/**
 * Chains the client knows how to reach. Base Sepolia is here because that is
 * where Handsel's V2 rehearsal market lives; the Frontier world does not have
 * to share a chain with the market, but a single RPC and faucet is simpler.
 */
export const supportedChains: MUDChain[] = [mudFoundry, redstone, garnet, baseSepolia];
