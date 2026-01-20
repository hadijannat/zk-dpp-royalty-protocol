// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVerificationEscrow} from "./interfaces/IVerificationEscrow.sol";

/**
 * @title VerificationEscrow
 * @notice Manages brand deposits and verification fee recording for ZK-DPP
 * @dev Brands deposit USDC, protocol records verifications, funds flow to settlement
 *
 * Flow:
 * 1. Brand deposits USDC to cover verification fees
 * 2. When verification occurs, owner records it (brand -> supplier)
 * 3. Recorded amounts accumulate in pendingRecords
 * 4. Settlement contract can draw funds via transferToSettlement
 * 5. Brands can withdraw unused balance
 */
contract VerificationEscrow is IVerificationEscrow, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The payment token (USDC on Base)
    IERC20 public immutable paymentToken;

    /// @notice The settlement contract that can withdraw funds
    address public settlementContract;

    /// @notice Mapping from brand address to deposited balance
    mapping(address => uint256) public brandBalances;

    /// @notice Mapping from brand -> supplier -> pending amount
    mapping(address => mapping(address => uint256)) public pendingRecords;

    /// @notice Total pending amount per supplier across all brands
    mapping(address => uint256) public supplierPendingTotals;

    /// @notice Set of recorded receipt IDs to prevent duplicates
    mapping(bytes32 => bool) public recordedReceipts;

    error InsufficientBalance(address brand, uint256 available, uint256 required);
    error InvalidAmount();
    error InvalidAddress();
    error ReceiptAlreadyRecorded(bytes32 receiptId);
    error NotSettlementContract(address caller);
    error SettlementContractNotSet();
    error InsufficientPendingAmount(address supplier, uint256 available, uint256 required);

    constructor(
        address _paymentToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        paymentToken = IERC20(_paymentToken);
    }

    /**
     * @notice Set the settlement contract address
     * @param _settlementContract The RoyaltySettlement contract address
     */
    function setSettlementContract(address _settlementContract) external onlyOwner {
        if (_settlementContract == address(0)) {
            revert InvalidAddress();
        }
        settlementContract = _settlementContract;
    }

    /**
     * @notice Deposit USDC for verification fees
     * @param amount Amount to deposit (USDC, 6 decimals)
     */
    function deposit(uint256 amount) external whenNotPaused {
        if (amount == 0) {
            revert InvalidAmount();
        }

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        brandBalances[msg.sender] += amount;

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Record a verification event
     * @param brand The brand paying for verification
     * @param supplier The supplier receiving payment
     * @param amount The verification fee amount
     * @param receiptId The verification receipt ID (for deduplication)
     */
    function recordVerification(
        address brand,
        address supplier,
        uint256 amount,
        bytes32 receiptId
    ) external onlyOwner whenNotPaused {
        if (brand == address(0) || supplier == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (recordedReceipts[receiptId]) {
            revert ReceiptAlreadyRecorded(receiptId);
        }
        if (brandBalances[brand] < amount) {
            revert InsufficientBalance(brand, brandBalances[brand], amount);
        }

        // Mark receipt as recorded
        recordedReceipts[receiptId] = true;

        // Deduct from brand balance
        brandBalances[brand] -= amount;

        // Add to pending records
        pendingRecords[brand][supplier] += amount;
        supplierPendingTotals[supplier] += amount;

        emit VerificationRecorded(brand, supplier, amount, receiptId);
    }

    /**
     * @notice Transfer accumulated funds to the settlement contract
     * @param supplier The supplier to transfer funds for
     * @param amount The amount to transfer
     */
    function transferToSettlement(
        address supplier,
        uint256 amount
    ) external whenNotPaused {
        if (settlementContract == address(0)) {
            revert SettlementContractNotSet();
        }
        if (msg.sender != settlementContract && msg.sender != owner()) {
            revert NotSettlementContract(msg.sender);
        }
        if (supplier == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (supplierPendingTotals[supplier] < amount) {
            revert InsufficientPendingAmount(supplier, supplierPendingTotals[supplier], amount);
        }

        // Reduce supplier's pending total
        supplierPendingTotals[supplier] -= amount;

        // Transfer to settlement contract
        paymentToken.safeTransfer(settlementContract, amount);

        emit TransferredToSettlement(supplier, amount);
    }

    /**
     * @notice Withdraw unused funds
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (brandBalances[msg.sender] < amount) {
            revert InsufficientBalance(msg.sender, brandBalances[msg.sender], amount);
        }

        brandBalances[msg.sender] -= amount;
        paymentToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get brand's deposited balance
     * @param brand The brand address
     * @return The available balance
     */
    function getBrandBalance(address brand) external view returns (uint256) {
        return brandBalances[brand];
    }

    /**
     * @notice Get pending amount for a supplier from a specific brand
     * @param brand The brand address
     * @param supplier The supplier address
     * @return The pending amount
     */
    function getPendingAmount(
        address brand,
        address supplier
    ) external view returns (uint256) {
        return pendingRecords[brand][supplier];
    }

    /**
     * @notice Get total pending amount for a supplier across all brands
     * @param supplier The supplier address
     * @return The total pending amount
     */
    function getSupplierPendingTotal(address supplier) external view returns (uint256) {
        return supplierPendingTotals[supplier];
    }

    /**
     * @notice Check if a receipt has been recorded
     * @param receiptId The receipt ID to check
     * @return True if already recorded
     */
    function isReceiptRecorded(bytes32 receiptId) external view returns (bool) {
        return recordedReceipts[receiptId];
    }

    // ============ Admin Functions ============

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw tokens (owner only)
     * @param token Token to withdraw
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
