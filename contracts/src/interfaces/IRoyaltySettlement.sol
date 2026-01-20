// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IRoyaltySettlement
 * @notice Interface for the royalty settlement contract
 * @dev Handles submission, dispute, and finalization of settlement statements
 */
interface IRoyaltySettlement {
    enum StatementStatus {
        None,
        Submitted,
        Disputed,
        Finalized,
        Paid
    }

    struct Statement {
        bytes32 statementHash;
        address supplier;
        uint256 totalAmount;
        uint256 submittedAt;
        uint256 finalizedAt;
        StatementStatus status;
    }

    event StatementSubmitted(
        bytes32 indexed statementId, address indexed supplier, uint256 totalAmount, bytes32 statementHash
    );

    event StatementFinalized(bytes32 indexed statementId, address indexed supplier, uint256 totalAmount);

    event StatementDisputed(bytes32 indexed statementId, address indexed supplier, string reason);

    event PaymentClaimed(address indexed supplier, uint256 amount);

    /**
     * @notice Submit a new settlement statement (owner only)
     * @param statementId Unique identifier for the statement
     * @param supplier The supplier's wallet address
     * @param totalAmount Total amount owed to the supplier
     * @param statementHash Hash of the off-chain statement data
     */
    function submitStatement(bytes32 statementId, address supplier, uint256 totalAmount, bytes32 statementHash) external;

    /**
     * @notice Finalize a statement after the dispute window
     * @param statementId The statement to finalize
     */
    function finalizeStatement(bytes32 statementId) external;

    /**
     * @notice Dispute a statement within the dispute window
     * @param statementId The statement to dispute
     * @param reason Reason for the dispute
     */
    function disputeStatement(bytes32 statementId, string calldata reason) external;

    /**
     * @notice Claim accumulated payment balance
     */
    function claimPayment() external;

    /**
     * @notice Get statement details
     * @param statementId The statement ID to query
     * @return The statement struct
     */
    function getStatement(bytes32 statementId) external view returns (Statement memory);

    /**
     * @notice Get claimable balance for a supplier
     * @param supplier The supplier address
     * @return The claimable balance
     */
    function getClaimableBalance(address supplier) external view returns (uint256);

    /**
     * @notice Check if a statement can be finalized
     * @param statementId The statement ID to check
     * @return True if the statement can be finalized
     */
    function isFinalizable(bytes32 statementId) external view returns (bool);
}
