// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console2 } from "forge-std/Test.sol";
import { VerificationEscrow } from "../src/VerificationEscrow.sol";
import { RoyaltySettlement } from "../src/RoyaltySettlement.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";

contract VerificationEscrowTest is Test {
    VerificationEscrow public escrow;
    RoyaltySettlement public settlement;
    MockUSDC public usdc;

    address public owner = address(1);
    address public brand = address(2);
    address public brand2 = address(3);
    address public supplier = address(4);
    address public supplier2 = address(5);

    bytes32 public constant RECEIPT_ID = keccak256("receipt-001");
    uint256 public constant DEPOSIT_AMOUNT = 10_000 * 1e6; // 10,000 USDC
    uint256 public constant VERIFICATION_FEE = 5 * 1e4; // 0.05 USDC (5 cents)

    event Deposited(address indexed brand, uint256 amount);
    event VerificationRecorded(address indexed brand, address indexed supplier, uint256 amount, bytes32 receiptId);
    event TransferredToSettlement(address indexed supplier, uint256 amount);
    event Withdrawn(address indexed brand, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new VerificationEscrow(address(usdc), owner);
        settlement = new RoyaltySettlement(address(usdc), owner);

        // Set settlement contract in escrow
        vm.prank(owner);
        escrow.setSettlementContract(address(settlement));

        // Mint USDC to brands
        usdc.mint(brand, DEPOSIT_AMOUNT * 10);
        usdc.mint(brand2, DEPOSIT_AMOUNT * 10);

        // Approve escrow to spend brand's USDC
        vm.prank(brand);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(brand2);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ============ Deposit Tests ============

    function test_deposit_success() public {
        vm.prank(brand);
        vm.expectEmit(true, false, false, true);
        emit Deposited(brand, DEPOSIT_AMOUNT);
        escrow.deposit(DEPOSIT_AMOUNT);

        assertEq(escrow.getBrandBalance(brand), DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT_AMOUNT);
    }

    function test_deposit_multiple() public {
        vm.startPrank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);
        escrow.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        assertEq(escrow.getBrandBalance(brand), DEPOSIT_AMOUNT * 2);
    }

    function test_deposit_revert_zeroAmount() public {
        vm.prank(brand);
        vm.expectRevert(VerificationEscrow.InvalidAmount.selector);
        escrow.deposit(0);
    }

    // ============ Record Verification Tests ============

    function test_recordVerification_success() public {
        // Brand deposits first
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        // Owner records verification
        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit VerificationRecorded(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);

        assertEq(escrow.getBrandBalance(brand), DEPOSIT_AMOUNT - VERIFICATION_FEE);
        assertEq(escrow.getPendingAmount(brand, supplier), VERIFICATION_FEE);
        assertEq(escrow.getSupplierPendingTotal(supplier), VERIFICATION_FEE);
        assertTrue(escrow.isReceiptRecorded(RECEIPT_ID));
    }

    function test_recordVerification_revert_notOwner() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.prank(brand);
        vm.expectRevert();
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);
    }

    function test_recordVerification_revert_duplicateReceipt() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.startPrank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);

        bytes32 duplicateReceipt = RECEIPT_ID;
        vm.expectRevert(abi.encodeWithSelector(VerificationEscrow.ReceiptAlreadyRecorded.selector, duplicateReceipt));
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, duplicateReceipt);
        vm.stopPrank();
    }

    function test_recordVerification_revert_insufficientBalance() public {
        vm.prank(brand);
        escrow.deposit(VERIFICATION_FEE - 1);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                VerificationEscrow.InsufficientBalance.selector, brand, VERIFICATION_FEE - 1, VERIFICATION_FEE
            )
        );
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);
    }

    function test_recordVerification_multipleSuppliers() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        bytes32 receipt1 = keccak256("receipt-1");
        bytes32 receipt2 = keccak256("receipt-2");

        vm.startPrank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, receipt1);
        escrow.recordVerification(brand, supplier2, VERIFICATION_FEE * 2, receipt2);
        vm.stopPrank();

        assertEq(escrow.getSupplierPendingTotal(supplier), VERIFICATION_FEE);
        assertEq(escrow.getSupplierPendingTotal(supplier2), VERIFICATION_FEE * 2);
        assertEq(escrow.getBrandBalance(brand), DEPOSIT_AMOUNT - VERIFICATION_FEE * 3);
    }

    // ============ Transfer to Settlement Tests ============

    function test_transferToSettlement_success() public {
        // Setup: deposit and record verification
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.prank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);

        uint256 settlementBalanceBefore = usdc.balanceOf(address(settlement));

        // Transfer to settlement (owner can do this)
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit TransferredToSettlement(supplier, VERIFICATION_FEE);
        escrow.transferToSettlement(supplier, VERIFICATION_FEE);

        assertEq(escrow.getSupplierPendingTotal(supplier), 0);
        assertEq(usdc.balanceOf(address(settlement)), settlementBalanceBefore + VERIFICATION_FEE);
    }

    function test_transferToSettlement_revert_settlementNotSet() public {
        // Deploy new escrow without settlement set
        VerificationEscrow newEscrow = new VerificationEscrow(address(usdc), owner);

        vm.prank(owner);
        vm.expectRevert(VerificationEscrow.SettlementContractNotSet.selector);
        newEscrow.transferToSettlement(supplier, VERIFICATION_FEE);
    }

    function test_transferToSettlement_revert_insufficientPending() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.prank(owner);
        escrow.recordVerification(brand, supplier, VERIFICATION_FEE, RECEIPT_ID);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                VerificationEscrow.InsufficientPendingAmount.selector, supplier, VERIFICATION_FEE, VERIFICATION_FEE * 2
            )
        );
        escrow.transferToSettlement(supplier, VERIFICATION_FEE * 2);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_success() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        uint256 withdrawAmount = DEPOSIT_AMOUNT / 2;
        uint256 balanceBefore = usdc.balanceOf(brand);

        vm.prank(brand);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(brand, withdrawAmount);
        escrow.withdraw(withdrawAmount);

        assertEq(escrow.getBrandBalance(brand), DEPOSIT_AMOUNT - withdrawAmount);
        assertEq(usdc.balanceOf(brand), balanceBefore + withdrawAmount);
    }

    function test_withdraw_revert_insufficientBalance() public {
        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.prank(brand);
        vm.expectRevert(
            abi.encodeWithSelector(
                VerificationEscrow.InsufficientBalance.selector, brand, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT + 1
            )
        );
        escrow.withdraw(DEPOSIT_AMOUNT + 1);
    }

    // ============ Admin Function Tests ============

    function test_setSettlementContract() public {
        address newSettlement = address(100);

        vm.prank(owner);
        escrow.setSettlementContract(newSettlement);

        assertEq(escrow.settlementContract(), newSettlement);
    }

    function test_setSettlementContract_revert_zeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(VerificationEscrow.InvalidAddress.selector);
        escrow.setSettlementContract(address(0));
    }

    function test_pausable() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(brand);
        vm.expectRevert();
        escrow.deposit(DEPOSIT_AMOUNT);

        vm.prank(owner);
        escrow.unpause();

        vm.prank(brand);
        escrow.deposit(DEPOSIT_AMOUNT);
    }

    // ============ Fuzz Tests ============

    function testFuzz_deposit(uint256 amount) public {
        vm.assume(amount > 0);
        vm.assume(amount < type(uint128).max);

        usdc.mint(brand, amount);

        vm.prank(brand);
        escrow.deposit(amount);

        assertEq(escrow.getBrandBalance(brand), amount);
    }
}
