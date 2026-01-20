// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PaymentDistributor} from "../src/PaymentDistributor.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract PaymentDistributorTest is Test {
    PaymentDistributor public distributor;
    MockUSDC public usdc;

    address public owner = address(1);
    address public treasury = address(2);
    address public supplier = address(3);
    address public gateway = address(4);
    address public payer = address(5);

    uint256 public constant AMOUNT = 10_000 * 1e6; // 10,000 USDC
    uint256 public constant DEFAULT_PROTOCOL_FEE = 200; // 2%
    uint256 public constant DEFAULT_GATEWAY_FEE = 50;   // 0.5%

    event PaymentDistributed(
        address indexed supplier,
        address indexed gateway,
        uint256 supplierAmount,
        uint256 protocolFee,
        uint256 gatewayFee
    );

    event FeesUpdated(uint256 protocolFeeBps, uint256 gatewayFeeBps);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);
    event GatewayFeesClaimed(address indexed gateway, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        distributor = new PaymentDistributor(address(usdc), treasury, owner);

        // Mint USDC to payer and approve
        usdc.mint(payer, AMOUNT * 100);
        vm.prank(payer);
        usdc.approve(address(distributor), type(uint256).max);
    }

    // ============ Calculate Fees Tests ============

    function test_calculateFees() public view {
        (uint256 supplierAmount, uint256 protocolFee, uint256 gatewayFee) = distributor.calculateFees(AMOUNT);

        // 2% protocol fee
        assertEq(protocolFee, AMOUNT * 200 / 10000);
        // 0.5% gateway fee
        assertEq(gatewayFee, AMOUNT * 50 / 10000);
        // Remaining to supplier
        assertEq(supplierAmount, AMOUNT - protocolFee - gatewayFee);

        // Verify totals
        assertEq(supplierAmount + protocolFee + gatewayFee, AMOUNT);
    }

    function test_getFees() public view {
        (uint256 protocolFeeBps, uint256 gatewayFeeBps) = distributor.getFees();

        assertEq(protocolFeeBps, DEFAULT_PROTOCOL_FEE);
        assertEq(gatewayFeeBps, DEFAULT_GATEWAY_FEE);
    }

    // ============ Distribute Tests ============

    function test_distribute_success() public {
        (uint256 expectedSupplier, uint256 expectedProtocol, uint256 expectedGateway) = distributor.calculateFees(AMOUNT);

        vm.prank(payer);
        vm.expectEmit(true, true, false, true);
        emit PaymentDistributed(supplier, gateway, expectedSupplier, expectedProtocol, expectedGateway);
        distributor.distribute(supplier, AMOUNT, gateway);

        // Supplier receives their share immediately
        assertEq(usdc.balanceOf(supplier), expectedSupplier);

        // Fees are accumulated
        assertEq(distributor.getAccumulatedProtocolFees(), expectedProtocol);
        assertEq(distributor.getAccumulatedGatewayFees(gateway), expectedGateway);
    }

    function test_distribute_noGateway() public {
        (uint256 expectedSupplier, uint256 expectedProtocol, uint256 expectedGateway) = distributor.calculateFees(AMOUNT);

        vm.prank(payer);
        distributor.distribute(supplier, AMOUNT, address(0));

        // Supplier receives their share
        assertEq(usdc.balanceOf(supplier), expectedSupplier);

        // Protocol gets both fees when no gateway
        assertEq(distributor.getAccumulatedProtocolFees(), expectedProtocol + expectedGateway);
        assertEq(distributor.getAccumulatedGatewayFees(address(0)), 0);
    }

    function test_distribute_revert_zeroSupplier() public {
        vm.prank(payer);
        vm.expectRevert(PaymentDistributor.InvalidAddress.selector);
        distributor.distribute(address(0), AMOUNT, gateway);
    }

    function test_distribute_revert_zeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(PaymentDistributor.InvalidAmount.selector);
        distributor.distribute(supplier, 0, gateway);
    }

    // ============ Fee Claiming Tests ============

    function test_claimProtocolFees_success() public {
        // Distribute to accumulate fees
        vm.prank(payer);
        distributor.distribute(supplier, AMOUNT, gateway);

        uint256 accumulated = distributor.getAccumulatedProtocolFees();
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);

        vm.expectEmit(true, false, false, true);
        emit ProtocolFeesClaimed(treasury, accumulated);
        distributor.claimProtocolFees();

        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + accumulated);
        assertEq(distributor.getAccumulatedProtocolFees(), 0);
    }

    function test_claimProtocolFees_revert_nothing() public {
        vm.expectRevert(PaymentDistributor.NothingToClaim.selector);
        distributor.claimProtocolFees();
    }

    function test_claimGatewayFees_success() public {
        // Distribute to accumulate fees
        vm.prank(payer);
        distributor.distribute(supplier, AMOUNT, gateway);

        uint256 accumulated = distributor.getAccumulatedGatewayFees(gateway);
        uint256 gatewayBalanceBefore = usdc.balanceOf(gateway);

        vm.prank(gateway);
        vm.expectEmit(true, false, false, true);
        emit GatewayFeesClaimed(gateway, accumulated);
        distributor.claimGatewayFees();

        assertEq(usdc.balanceOf(gateway), gatewayBalanceBefore + accumulated);
        assertEq(distributor.getAccumulatedGatewayFees(gateway), 0);
    }

    function test_claimGatewayFees_revert_nothing() public {
        vm.prank(gateway);
        vm.expectRevert(PaymentDistributor.NothingToClaim.selector);
        distributor.claimGatewayFees();
    }

    // ============ Set Fees Tests ============

    function test_setFees_success() public {
        uint256 newProtocol = 300; // 3%
        uint256 newGateway = 100;  // 1%

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit FeesUpdated(newProtocol, newGateway);
        distributor.setFees(newProtocol, newGateway);

        (uint256 protocol, uint256 gatewayFee) = distributor.getFees();
        assertEq(protocol, newProtocol);
        assertEq(gatewayFee, newGateway);
    }

    function test_setFees_revert_tooHigh() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(PaymentDistributor.FeesTooHigh.selector, 1100, 1000)
        );
        distributor.setFees(600, 500); // 11% total
    }

    function test_setFees_revert_notOwner() public {
        vm.prank(payer);
        vm.expectRevert();
        distributor.setFees(100, 50);
    }

    // ============ Treasury Update Tests ============

    function test_setProtocolTreasury_success() public {
        address newTreasury = address(100);

        vm.prank(owner);
        distributor.setProtocolTreasury(newTreasury);

        assertEq(distributor.protocolTreasury(), newTreasury);
    }

    function test_setProtocolTreasury_revert_zeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PaymentDistributor.InvalidAddress.selector);
        distributor.setProtocolTreasury(address(0));
    }

    // ============ Admin Function Tests ============

    function test_pausable() public {
        vm.prank(owner);
        distributor.pause();

        vm.prank(payer);
        vm.expectRevert();
        distributor.distribute(supplier, AMOUNT, gateway);

        vm.prank(owner);
        distributor.unpause();

        vm.prank(payer);
        distributor.distribute(supplier, AMOUNT, gateway);
    }

    // ============ Fuzz Tests ============

    function testFuzz_calculateFees(uint256 amount) public view {
        vm.assume(amount > 0);
        vm.assume(amount < type(uint128).max);

        (uint256 supplierAmount, uint256 protocolFee, uint256 gatewayFee) = distributor.calculateFees(amount);

        // Verify no rounding overflow
        assertEq(supplierAmount + protocolFee + gatewayFee, amount);

        // Verify fees are proportional
        assertLe(protocolFee, amount * 200 / 10000 + 1); // Allow 1 wei rounding
        assertLe(gatewayFee, amount * 50 / 10000 + 1);
    }

    function testFuzz_distribute(uint256 amount) public {
        vm.assume(amount > 100); // Minimum to avoid dust issues
        vm.assume(amount < type(uint64).max);

        usdc.mint(payer, amount);

        uint256 supplierBalanceBefore = usdc.balanceOf(supplier);
        (uint256 expectedSupplier, , ) = distributor.calculateFees(amount);

        vm.prank(payer);
        distributor.distribute(supplier, amount, gateway);

        assertEq(usdc.balanceOf(supplier), supplierBalanceBefore + expectedSupplier);
    }
}
