// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console2 } from "forge-std/Script.sol";
import { RoyaltySettlement } from "../src/RoyaltySettlement.sol";
import { VerificationEscrow } from "../src/VerificationEscrow.sol";
import { PaymentDistributor } from "../src/PaymentDistributor.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";

/**
 * @title Deploy
 * @notice Deployment script for ZK-DPP Royalty Protocol contracts
 *
 * Usage:
 *   # Deploy to Base Sepolia testnet
 *   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
 *
 *   # Deploy to Base mainnet
 *   forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify
 *
 *   # Dry run (no broadcast)
 *   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL
 *
 * Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key of the deployer
 *   PROTOCOL_TREASURY    - Address for protocol treasury (optional, defaults to deployer)
 *   USDC_ADDRESS         - USDC token address (optional for testnet, required for mainnet)
 */
contract Deploy is Script {
    // Base Sepolia chain ID
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // Base Mainnet chain ID
    uint256 constant BASE_MAINNET_CHAIN_ID = 8453;

    // Base Mainnet USDC address
    address constant BASE_MAINNET_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Get treasury address (default to deployer)
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);

        console2.log("=== ZK-DPP Royalty Protocol Deployment ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Get or deploy USDC
        address usdcAddress = _getOrDeployUsdc();
        console2.log("USDC Address:", usdcAddress);

        // Step 2: Deploy VerificationEscrow
        VerificationEscrow escrow = new VerificationEscrow(usdcAddress, deployer);
        console2.log("VerificationEscrow deployed:", address(escrow));

        // Step 3: Deploy RoyaltySettlement
        RoyaltySettlement settlement = new RoyaltySettlement(usdcAddress, deployer);
        console2.log("RoyaltySettlement deployed:", address(settlement));

        // Step 4: Deploy PaymentDistributor
        PaymentDistributor distributor = new PaymentDistributor(usdcAddress, treasury, deployer);
        console2.log("PaymentDistributor deployed:", address(distributor));

        // Step 5: Configure escrow to use settlement contract
        escrow.setSettlementContract(address(settlement));
        console2.log("Escrow configured with settlement contract");

        vm.stopBroadcast();

        // Output deployment summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("USDC:               ", usdcAddress);
        console2.log("VerificationEscrow: ", address(escrow));
        console2.log("RoyaltySettlement:  ", address(settlement));
        console2.log("PaymentDistributor: ", address(distributor));
        console2.log("Owner:              ", deployer);
        console2.log("Treasury:           ", treasury);
    }

    function _getOrDeployUsdc() internal returns (address) {
        // Check for environment variable first
        address envUsdc = vm.envOr("USDC_ADDRESS", address(0));
        if (envUsdc != address(0)) {
            console2.log("Using USDC from environment:", envUsdc);
            return envUsdc;
        }

        // Use mainnet USDC if on Base mainnet
        if (block.chainid == BASE_MAINNET_CHAIN_ID) {
            console2.log("Using Base mainnet USDC");
            return BASE_MAINNET_USDC;
        }

        // Deploy mock USDC for testnet
        console2.log("Deploying MockUSDC for testnet...");
        MockUSDC mockUsdc = new MockUSDC();

        // Mint some test USDC to the deployer
        address deployer = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        mockUsdc.mint(deployer, 1_000_000 * 1e6); // 1M USDC
        console2.log("Minted 1,000,000 USDC to deployer");

        return address(mockUsdc);
    }
}

/**
 * @title DeployTestnet
 * @notice Convenience script for testnet deployment with additional setup
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Testnet Deployment with Test Setup ===");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock USDC
        MockUSDC usdc = new MockUSDC();
        console2.log("MockUSDC deployed:", address(usdc));

        // Deploy contracts
        VerificationEscrow escrow = new VerificationEscrow(address(usdc), deployer);
        RoyaltySettlement settlement = new RoyaltySettlement(address(usdc), deployer);
        PaymentDistributor distributor = new PaymentDistributor(address(usdc), deployer, deployer);

        // Configure
        escrow.setSettlementContract(address(settlement));

        // Mint test USDC
        usdc.mint(deployer, 10_000_000 * 1e6); // 10M USDC for testing
        usdc.mint(address(settlement), 1_000_000 * 1e6); // 1M USDC for payouts

        // Create test addresses
        address testBrand = address(0xB12D);
        address testSupplier = address(0x5077);
        address testGateway = address(0x6A7E);

        usdc.mint(testBrand, 100_000 * 1e6);
        console2.log("Test brand funded:", testBrand);

        vm.stopBroadcast();

        // Output
        console2.log("\n=== Testnet Addresses ===");
        console2.log("MockUSDC:           ", address(usdc));
        console2.log("VerificationEscrow: ", address(escrow));
        console2.log("RoyaltySettlement:  ", address(settlement));
        console2.log("PaymentDistributor: ", address(distributor));
        console2.log("\n=== Test Accounts ===");
        console2.log("Test Brand:   ", testBrand);
        console2.log("Test Supplier:", testSupplier);
        console2.log("Test Gateway: ", testGateway);
    }
}
