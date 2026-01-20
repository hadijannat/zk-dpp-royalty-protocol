// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console2 } from "forge-std/Test.sol";
import { RoyaltySettlement } from "../src/RoyaltySettlement.sol";
import { IRoyaltySettlement } from "../src/interfaces/IRoyaltySettlement.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";

contract RoyaltySettlementTest is Test {
    RoyaltySettlement public settlement;
    MockUSDC public usdc;

    address public owner = address(1);
    address public supplier = address(2);
    address public supplier2 = address(3);
    address public anyone = address(4);

    bytes32 public constant STATEMENT_ID = keccak256("statement-001");
    bytes32 public constant STATEMENT_HASH = keccak256("off-chain-data");
    uint256 public constant AMOUNT = 1000 * 1e6; // 1000 USDC

    event StatementSubmitted(bytes32 indexed statementId, address indexed supplier, uint256 totalAmount, bytes32 statementHash);

    event StatementFinalized(bytes32 indexed statementId, address indexed supplier, uint256 totalAmount);

    event StatementDisputed(bytes32 indexed statementId, address indexed supplier, string reason);

    event PaymentClaimed(address indexed supplier, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        settlement = new RoyaltySettlement(address(usdc), owner);

        // Fund the settlement contract with USDC for payouts
        usdc.mint(address(settlement), 100_000 * 1e6);
    }

    // ============ Submit Statement Tests ============

    function test_submitStatement_success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit StatementSubmitted(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(STATEMENT_ID);
        assertEq(stmt.supplier, supplier);
        assertEq(stmt.totalAmount, AMOUNT);
        assertEq(stmt.statementHash, STATEMENT_HASH);
        assertEq(uint256(stmt.status), uint256(IRoyaltySettlement.StatementStatus.Submitted));
        assertGt(stmt.submittedAt, 0);
    }

    function test_submitStatement_revert_notOwner() public {
        vm.prank(anyone);
        vm.expectRevert();
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);
    }

    function test_submitStatement_revert_duplicate() public {
        vm.startPrank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        vm.expectRevert(abi.encodeWithSelector(RoyaltySettlement.StatementAlreadyExists.selector, STATEMENT_ID));
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);
        vm.stopPrank();
    }

    function test_submitStatement_revert_zeroSupplier() public {
        vm.prank(owner);
        vm.expectRevert(RoyaltySettlement.InvalidSupplierAddress.selector);
        settlement.submitStatement(STATEMENT_ID, address(0), AMOUNT, STATEMENT_HASH);
    }

    function test_submitStatement_revert_zeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(RoyaltySettlement.InvalidAmount.selector);
        settlement.submitStatement(STATEMENT_ID, supplier, 0, STATEMENT_HASH);
    }

    // ============ Finalize Statement Tests ============

    function test_finalizeStatement_success() public {
        // Submit statement
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        // Warp past dispute window
        vm.warp(block.timestamp + 25 hours);

        // Finalize (anyone can do this)
        vm.prank(anyone);
        vm.expectEmit(true, true, false, true);
        emit StatementFinalized(STATEMENT_ID, supplier, AMOUNT);
        settlement.finalizeStatement(STATEMENT_ID);

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(STATEMENT_ID);
        assertEq(uint256(stmt.status), uint256(IRoyaltySettlement.StatementStatus.Finalized));
        assertGt(stmt.finalizedAt, 0);

        // Check claimable balance
        assertEq(settlement.getClaimableBalance(supplier), AMOUNT);
    }

    function test_finalizeStatement_revert_beforeWindow() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        // Try to finalize immediately
        vm.prank(anyone);
        vm.expectRevert();
        settlement.finalizeStatement(STATEMENT_ID);
    }

    function test_finalizeStatement_revert_notFound() public {
        bytes32 unknownId = keccak256("unknown");
        vm.prank(anyone);
        vm.expectRevert(abi.encodeWithSelector(RoyaltySettlement.StatementNotFound.selector, unknownId));
        settlement.finalizeStatement(unknownId);
    }

    function test_finalizeStatement_revert_alreadyFinalized() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(STATEMENT_ID);

        vm.expectRevert(abi.encodeWithSelector(RoyaltySettlement.StatementAlreadyFinalized.selector, STATEMENT_ID));
        settlement.finalizeStatement(STATEMENT_ID);
    }

    // ============ Dispute Statement Tests ============

    function test_disputeStatement_success() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        // Supplier disputes within window
        vm.prank(supplier);
        vm.expectEmit(true, true, false, true);
        emit StatementDisputed(STATEMENT_ID, supplier, "Incorrect amount");
        settlement.disputeStatement(STATEMENT_ID, "Incorrect amount");

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(STATEMENT_ID);
        assertEq(uint256(stmt.status), uint256(IRoyaltySettlement.StatementStatus.Disputed));
    }

    function test_disputeStatement_revert_notSupplier() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        vm.prank(anyone);
        vm.expectRevert(abi.encodeWithSelector(RoyaltySettlement.NotSupplier.selector, STATEMENT_ID, anyone));
        settlement.disputeStatement(STATEMENT_ID, "Incorrect amount");
    }

    function test_disputeStatement_revert_windowPassed() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        vm.warp(block.timestamp + 25 hours);

        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(RoyaltySettlement.DisputeWindowPassed.selector, STATEMENT_ID));
        settlement.disputeStatement(STATEMENT_ID, "Incorrect amount");
    }

    // ============ Claim Payment Tests ============

    function test_claimPayment_success() public {
        // Submit and finalize
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);
        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(STATEMENT_ID);

        uint256 balanceBefore = usdc.balanceOf(supplier);

        // Claim
        vm.prank(supplier);
        vm.expectEmit(true, false, false, true);
        emit PaymentClaimed(supplier, AMOUNT);
        settlement.claimPayment();

        assertEq(usdc.balanceOf(supplier), balanceBefore + AMOUNT);
        assertEq(settlement.getClaimableBalance(supplier), 0);
    }

    function test_claimPayment_revert_nothingToClaim() public {
        vm.prank(supplier);
        vm.expectRevert(RoyaltySettlement.NothingToClaim.selector);
        settlement.claimPayment();
    }

    function test_claimPayment_multipleStatements() public {
        bytes32 stmtId1 = keccak256("stmt-1");
        bytes32 stmtId2 = keccak256("stmt-2");
        uint256 amount1 = 500 * 1e6;
        uint256 amount2 = 750 * 1e6;

        // Submit multiple statements
        vm.startPrank(owner);
        settlement.submitStatement(stmtId1, supplier, amount1, STATEMENT_HASH);
        settlement.submitStatement(stmtId2, supplier, amount2, STATEMENT_HASH);
        vm.stopPrank();

        // Finalize both
        vm.warp(block.timestamp + 25 hours);
        settlement.finalizeStatement(stmtId1);
        settlement.finalizeStatement(stmtId2);

        // Check accumulated balance
        assertEq(settlement.getClaimableBalance(supplier), amount1 + amount2);

        // Claim all at once
        vm.prank(supplier);
        settlement.claimPayment();

        assertEq(usdc.balanceOf(supplier), amount1 + amount2);
    }

    // ============ View Function Tests ============

    function test_isFinalizable() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        // Not finalizable immediately
        assertFalse(settlement.isFinalizable(STATEMENT_ID));

        // Finalizable after window
        vm.warp(block.timestamp + 25 hours);
        assertTrue(settlement.isFinalizable(STATEMENT_ID));

        // Not finalizable after finalized
        settlement.finalizeStatement(STATEMENT_ID);
        assertFalse(settlement.isFinalizable(STATEMENT_ID));
    }

    function test_getRemainingDisputeTime() public {
        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        uint256 remaining = settlement.getRemainingDisputeTime(STATEMENT_ID);
        assertEq(remaining, 24 hours);

        vm.warp(block.timestamp + 12 hours);
        remaining = settlement.getRemainingDisputeTime(STATEMENT_ID);
        assertEq(remaining, 12 hours);

        vm.warp(block.timestamp + 13 hours);
        remaining = settlement.getRemainingDisputeTime(STATEMENT_ID);
        assertEq(remaining, 0);
    }

    // ============ Admin Function Tests ============

    function test_setDisputeWindow() public {
        uint256 newWindow = 48 hours;

        vm.prank(owner);
        settlement.setDisputeWindow(newWindow);

        assertEq(settlement.disputeWindow(), newWindow);
    }

    function test_setDisputeWindow_revert_invalid() public {
        vm.prank(owner);
        vm.expectRevert(RoyaltySettlement.InvalidDisputeWindow.selector);
        settlement.setDisputeWindow(0);

        vm.prank(owner);
        vm.expectRevert(RoyaltySettlement.InvalidDisputeWindow.selector);
        settlement.setDisputeWindow(8 days);
    }

    function test_pausable() public {
        vm.prank(owner);
        settlement.pause();

        vm.prank(owner);
        vm.expectRevert();
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);

        vm.prank(owner);
        settlement.unpause();

        vm.prank(owner);
        settlement.submitStatement(STATEMENT_ID, supplier, AMOUNT, STATEMENT_HASH);
    }

    // ============ Fuzz Tests ============

    function testFuzz_submitStatement(bytes32 statementId, address _supplier, uint256 _amount) public {
        vm.assume(_supplier != address(0));
        vm.assume(_amount > 0);
        vm.assume(_amount < type(uint128).max); // Reasonable bounds

        vm.prank(owner);
        settlement.submitStatement(statementId, _supplier, _amount, STATEMENT_HASH);

        IRoyaltySettlement.Statement memory stmt = settlement.getStatement(statementId);
        assertEq(stmt.supplier, _supplier);
        assertEq(stmt.totalAmount, _amount);
    }
}
