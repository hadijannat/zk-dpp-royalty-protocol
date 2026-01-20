// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVerificationEscrow
 * @notice Interface for the verification escrow contract
 * @dev Handles brand deposits and verification fee recording
 */
interface IVerificationEscrow {
    event Deposited(address indexed brand, uint256 amount);
    event VerificationRecorded(address indexed brand, address indexed supplier, uint256 amount, bytes32 receiptId);
    event TransferredToSettlement(address indexed supplier, uint256 amount);
    event Withdrawn(address indexed brand, uint256 amount);

    /**
     * @notice Deposit USDC for verification fees
     * @param amount Amount to deposit
     */
    function deposit(uint256 amount) external;

    /**
     * @notice Record a verification event (owner only)
     * @param brand The brand paying for verification
     * @param supplier The supplier receiving payment
     * @param amount The verification fee amount
     * @param receiptId The verification receipt ID
     */
    function recordVerification(address brand, address supplier, uint256 amount, bytes32 receiptId) external;

    /**
     * @notice Transfer accumulated funds to settlement contract
     * @param supplier The supplier to transfer funds for
     * @param amount The amount to transfer
     */
    function transferToSettlement(address supplier, uint256 amount) external;

    /**
     * @notice Withdraw excess funds
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external;

    /**
     * @notice Get brand balance
     * @param brand The brand address
     * @return The balance
     */
    function getBrandBalance(address brand) external view returns (uint256);

    /**
     * @notice Get pending amount for a supplier from a brand
     * @param brand The brand address
     * @param supplier The supplier address
     * @return The pending amount
     */
    function getPendingAmount(address brand, address supplier) external view returns (uint256);
}
