// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {RoyaltySettlement} from "../src/RoyaltySettlement.sol";
import {VerificationEscrow} from "../src/VerificationEscrow.sol";
import {PaymentDistributor} from "../src/PaymentDistributor.sol";
import {IRoyaltySettlement} from "../src/interfaces/IRoyaltySettlement.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/**
 * @title IntegrationTest
 * @notice End-to-end tests for the ZK-DPP Royalty Protocol contracts
 * @dev Tests the full flow: deposit → verify → settle → claim
 */
contract IntegrationTest is Test {
    RoyaltySettlement public settlement;
    VerificationEscrow public escrow;
    PaymentDistributor public distributor;
    MockUSDC public usdc;

    address public owner = address(1);
    address public treasury = address(2);
    address public brand = address(3);
    address public supplier = address(4);
    address public gateway = address(5);

    // Test amounts (USDC has 6 decimals)
    uint256 public constant BRAND_DEPOSIT = 100_000 * 1e6; // 100,000 USDC
    uint256 public constant VERIFICATION_FEE = 5 * 1e4;    // 0.05 USDC per verification

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy contracts
        settlement = new RoyaltySettlement(address(usdc), owner);
        escrow = new VerificationEscrow(address(usdc), owner);
        distributor = new PaymentDistributor(address(usdc), treasury, owner);

        // Configure escrow to work with settlement
        vm.prank(owner);
        escrow.setSettlementContract(address(settlement));

        // Fund brand and approve escrow
        usdc.mint(brand, BRAND_DEPOSIT * 10);
        vm.prank(brand);
        usdc.approve(address(escrow), type(uint256).max);

        // Fund settlement contract for payouts
        usdc.mint(address(settlement), 1_000_000 * 1e6);
    }

    /**
     * @notice Test the complete verification and settlement flow
     *
     * Flow:
     * 1. Brand deposits USDC to escrow
     * 2. Protocol records multiple verifications (brand → supplier)
     * 3. Protocol creates settlement statement for monthly period
     * 4. Wait for dispute window
     * 5. Finalize settlement
     * 6. Supplier claims payment
     */
    function test_fullFlow_singleSupplier() public {
        // 1. Brand deposits for verification fees
        vm.prank(brand);
        escrow.deposit(BRAND_DEPOSIT);

        assertEq(escrow.getBrandBalance(brand), BRAND_DEPOSIT);

        // 2. Simulate 100 verifications over a month
        uint256 numVerifications = 100;
        uint256 totalFees = numVerifications * VERIFICATION_FEE;

        vm.startPrank(owner);
        for (uint256 i = 0; i < numVerifications; i++) {
            bytes32 receiptId = keccak256(abi.encodePacked("receipt-", i));
            escrow.recordVerification(brand, supplier, VERIFICATION_FEE, receiptId);
        }
        vm.stopPrank();

        assertEq(escrow.getSupplierPendingTotal(supplier), totalFees);
        assertEq(escrow.getBrandBalance(brand), BRAND_DEPOSIT - totalFees);

        // 3. Transfer accumulated funds to settlement contract
        vm.prank(owner);
        escrow.transferToSettlement(supplier, totalFees);

        assertEq(usdc.balanceOf(address(settlement)) - 1_000_000 * 1e6, totalFees);

        // 4. Create settlement statement
        bytes32 statementId = keccak256("statement-jan-2024-supplier");
        bytes32 statementHash = keccak256(abi.encodePacked(
            supplier,
            totalFees,
            block.timestamp
        ));

        vm.prank(owner);
        settlement.submitStatement(statementId, supplier, totalFees, statementHash);

        // 5. Fast-forward past dispute window
        vm.warp(block.timestamp + 25 hours);

        // 6. Finalize statement (anyone can do this)
        settlement.finalizeStatement(statementId);

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(statementId);
        assertEq(uint256(stmt.status), uint256(IRoyaltySettlement.StatementStatus.Finalized));
        assertEq(settlement.getClaimableBalance(supplier), totalFees);

        // 7. Supplier claims payment
        uint256 supplierBalanceBefore = usdc.balanceOf(supplier);

        vm.prank(supplier);
        settlement.claimPayment();

        assertEq(usdc.balanceOf(supplier), supplierBalanceBefore + totalFees);
        assertEq(settlement.getClaimableBalance(supplier), 0);
    }

    /**
     * @notice Test dispute flow
     */
    function test_disputeFlow() public {
        // Setup: deposit and record verifications
        vm.prank(brand);
        escrow.deposit(BRAND_DEPOSIT);

        bytes32 receiptId = keccak256("receipt-1");
        vm.prank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE * 100, receiptId);

        // Transfer and create statement
        vm.prank(owner);
        escrow.transferToSettlement(supplier, VERIFICATION_FEE * 100);

        bytes32 statementId = keccak256("disputed-statement");
        vm.prank(owner);
        settlement.submitStatement(statementId, supplier, VERIFICATION_FEE * 100, bytes32(0));

        // Supplier disputes within window
        vm.prank(supplier);
        settlement.disputeStatement(statementId, "Amount is incorrect");

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(statementId);
        assertEq(uint256(stmt.status), uint256(IRoyaltySettlement.StatementStatus.Disputed));

        // Cannot finalize disputed statement
        vm.warp(block.timestamp + 25 hours);
        vm.expectRevert();
        settlement.finalizeStatement(statementId);
    }

    /**
     * @notice Test multiple suppliers in one period
     */
    function test_multipleSuppliers() public {
        address supplier1 = address(10);
        address supplier2 = address(11);
        address supplier3 = address(12);

        uint256 fees1 = 1000 * 1e6;
        uint256 fees2 = 2500 * 1e6;
        uint256 fees3 = 500 * 1e6;

        // Brand deposits
        vm.prank(brand);
        escrow.deposit(BRAND_DEPOSIT);

        // Record verifications for each supplier
        vm.startPrank(owner);
        escrow.recordVerification(brand, supplier1, fees1, keccak256("r1"));
        escrow.recordVerification(brand, supplier2, fees2, keccak256("r2"));
        escrow.recordVerification(brand, supplier3, fees3, keccak256("r3"));

        // Transfer to settlement
        escrow.transferToSettlement(supplier1, fees1);
        escrow.transferToSettlement(supplier2, fees2);
        escrow.transferToSettlement(supplier3, fees3);

        // Create statements for each
        settlement.submitStatement(keccak256("s1"), supplier1, fees1, bytes32(0));
        settlement.submitStatement(keccak256("s2"), supplier2, fees2, bytes32(0));
        settlement.submitStatement(keccak256("s3"), supplier3, fees3, bytes32(0));
        vm.stopPrank();

        // Finalize all
        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(keccak256("s1"));
        settlement.finalizeStatement(keccak256("s2"));
        settlement.finalizeStatement(keccak256("s3"));

        // Verify balances
        assertEq(settlement.getClaimableBalance(supplier1), fees1);
        assertEq(settlement.getClaimableBalance(supplier2), fees2);
        assertEq(settlement.getClaimableBalance(supplier3), fees3);

        // All suppliers claim
        vm.prank(supplier1);
        settlement.claimPayment();
        vm.prank(supplier2);
        settlement.claimPayment();
        vm.prank(supplier3);
        settlement.claimPayment();

        assertEq(usdc.balanceOf(supplier1), fees1);
        assertEq(usdc.balanceOf(supplier2), fees2);
        assertEq(usdc.balanceOf(supplier3), fees3);
    }

    /**
     * @notice Test PaymentDistributor integration for direct payments with fee splits
     */
    function test_paymentDistribution() public {
        uint256 paymentAmount = 10_000 * 1e6;

        // Fund payer and approve distributor
        address payer = address(100);
        usdc.mint(payer, paymentAmount);
        vm.prank(payer);
        usdc.approve(address(distributor), paymentAmount);

        // Calculate expected amounts
        (uint256 expectedSupplier, uint256 expectedProtocol, uint256 expectedGateway) = distributor.calculateFees(paymentAmount);

        // Distribute payment
        vm.prank(payer);
        distributor.distribute(supplier, paymentAmount, gateway);

        // Supplier receives immediately
        assertEq(usdc.balanceOf(supplier), expectedSupplier);

        // Fees accumulated
        assertEq(distributor.getAccumulatedProtocolFees(), expectedProtocol);
        assertEq(distributor.getAccumulatedGatewayFees(gateway), expectedGateway);

        // Claim fees
        distributor.claimProtocolFees();
        assertEq(usdc.balanceOf(treasury), expectedProtocol);

        vm.prank(gateway);
        distributor.claimGatewayFees();
        assertEq(usdc.balanceOf(gateway), expectedGateway);
    }

    /**
     * @notice Test brand withdrawal of unused funds
     */
    function test_brandWithdrawal() public {
        vm.prank(brand);
        escrow.deposit(BRAND_DEPOSIT);

        // Some verifications
        vm.prank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE * 50, keccak256("r1"));

        uint256 remainingBalance = escrow.getBrandBalance(brand);
        uint256 brandUsdcBefore = usdc.balanceOf(brand);

        // Brand withdraws remaining
        vm.prank(brand);
        escrow.withdraw(remainingBalance);

        assertEq(usdc.balanceOf(brand), brandUsdcBefore + remainingBalance);
        assertEq(escrow.getBrandBalance(brand), 0);
    }

    /**
     * @notice Test accumulating multiple statements before claiming
     */
    function test_accumulatedClaims() public {
        vm.prank(brand);
        escrow.deposit(BRAND_DEPOSIT);

        // Month 1
        vm.prank(owner);
        escrow.recordVerification(brand, supplier, 1000 * 1e6, keccak256("jan"));
        vm.prank(owner);
        escrow.transferToSettlement(supplier, 1000 * 1e6);
        vm.prank(owner);
        settlement.submitStatement(keccak256("jan-stmt"), supplier, 1000 * 1e6, bytes32(0));

        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(keccak256("jan-stmt"));

        // Month 2 (time passes)
        vm.warp(block.timestamp + 30 days);
        vm.prank(owner);
        escrow.recordVerification(brand, supplier, 1500 * 1e6, keccak256("feb"));
        vm.prank(owner);
        escrow.transferToSettlement(supplier, 1500 * 1e6);
        vm.prank(owner);
        settlement.submitStatement(keccak256("feb-stmt"), supplier, 1500 * 1e6, bytes32(0));

        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(keccak256("feb-stmt"));

        // Supplier has accumulated both months
        assertEq(settlement.getClaimableBalance(supplier), 2500 * 1e6);

        // Single claim gets all
        vm.prank(supplier);
        settlement.claimPayment();

        assertEq(usdc.balanceOf(supplier), 2500 * 1e6);
    }
}
