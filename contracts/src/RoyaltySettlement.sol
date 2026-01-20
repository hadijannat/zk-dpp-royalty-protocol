// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRoyaltySettlement} from "./interfaces/IRoyaltySettlement.sol";

/**
 * @title RoyaltySettlement
 * @notice Manages settlement statements for ZK-DPP royalty payments
 * @dev Implements a dispute window mechanism before payments become claimable
 *
 * Flow:
 * 1. Protocol owner submits settlement statement with hash
 * 2. 24-hour dispute window allows supplier to dispute
 * 3. After window, anyone can finalize the statement
 * 4. Finalized amounts are added to supplier's claimable balance
 * 5. Supplier calls claimPayment() to withdraw
 */
contract RoyaltySettlement is IRoyaltySettlement, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The payment token (USDC on Base)
    IERC20 public immutable paymentToken;

    /// @notice Dispute window duration in seconds (default: 24 hours)
    uint256 public disputeWindow;

    /// @notice Mapping from statement ID to Statement struct
    mapping(bytes32 => Statement) public statements;

    /// @notice Mapping from supplier address to claimable balance
    mapping(address => uint256) public claimableBalances;

    /// @notice Default dispute window: 24 hours
    uint256 public constant DEFAULT_DISPUTE_WINDOW = 24 hours;

    /// @notice Maximum dispute window: 7 days
    uint256 public constant MAX_DISPUTE_WINDOW = 7 days;

    error StatementAlreadyExists(bytes32 statementId);
    error StatementNotFound(bytes32 statementId);
    error InvalidSupplierAddress();
    error InvalidAmount();
    error StatementNotSubmitted(bytes32 statementId);
    error DisputeWindowNotPassed(bytes32 statementId, uint256 remainingTime);
    error StatementAlreadyFinalized(bytes32 statementId);
    error StatementDisputedError(bytes32 statementId);
    error NotSupplier(bytes32 statementId, address caller);
    error DisputeWindowPassed(bytes32 statementId);
    error NothingToClaim();
    error InvalidDisputeWindow();

    constructor(
        address _paymentToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        paymentToken = IERC20(_paymentToken);
        disputeWindow = DEFAULT_DISPUTE_WINDOW;
    }

    /**
     * @notice Submit a new settlement statement
     * @param statementId Unique identifier for the statement
     * @param supplier The supplier's wallet address
     * @param totalAmount Total amount owed to the supplier (in USDC, 6 decimals)
     * @param statementHash Keccak256 hash of the off-chain statement JSON
     */
    function submitStatement(
        bytes32 statementId,
        address supplier,
        uint256 totalAmount,
        bytes32 statementHash
    ) external onlyOwner whenNotPaused {
        if (statements[statementId].status != StatementStatus.None) {
            revert StatementAlreadyExists(statementId);
        }
        if (supplier == address(0)) {
            revert InvalidSupplierAddress();
        }
        if (totalAmount == 0) {
            revert InvalidAmount();
        }

        statements[statementId] = Statement({
            statementHash: statementHash,
            supplier: supplier,
            totalAmount: totalAmount,
            submittedAt: block.timestamp,
            finalizedAt: 0,
            status: StatementStatus.Submitted
        });

        emit StatementSubmitted(statementId, supplier, totalAmount, statementHash);
    }

    /**
     * @notice Finalize a statement after the dispute window has passed
     * @param statementId The statement ID to finalize
     */
    function finalizeStatement(bytes32 statementId) external whenNotPaused {
        Statement storage statement = statements[statementId];

        if (statement.status == StatementStatus.None) {
            revert StatementNotFound(statementId);
        }
        if (statement.status != StatementStatus.Submitted) {
            if (statement.status == StatementStatus.Finalized || statement.status == StatementStatus.Paid) {
                revert StatementAlreadyFinalized(statementId);
            }
            if (statement.status == StatementStatus.Disputed) {
                revert StatementDisputedError(statementId);
            }
        }

        uint256 windowEnd = statement.submittedAt + disputeWindow;
        if (block.timestamp < windowEnd) {
            revert DisputeWindowNotPassed(statementId, windowEnd - block.timestamp);
        }

        statement.status = StatementStatus.Finalized;
        statement.finalizedAt = block.timestamp;

        // Add to supplier's claimable balance
        claimableBalances[statement.supplier] += statement.totalAmount;

        emit StatementFinalized(statementId, statement.supplier, statement.totalAmount);
    }

    /**
     * @notice Dispute a statement within the dispute window
     * @param statementId The statement ID to dispute
     * @param reason Human-readable reason for the dispute
     */
    function disputeStatement(
        bytes32 statementId,
        string calldata reason
    ) external whenNotPaused {
        Statement storage statement = statements[statementId];

        if (statement.status == StatementStatus.None) {
            revert StatementNotFound(statementId);
        }
        if (statement.supplier != msg.sender) {
            revert NotSupplier(statementId, msg.sender);
        }
        if (statement.status != StatementStatus.Submitted) {
            revert StatementNotSubmitted(statementId);
        }

        uint256 windowEnd = statement.submittedAt + disputeWindow;
        if (block.timestamp >= windowEnd) {
            revert DisputeWindowPassed(statementId);
        }

        statement.status = StatementStatus.Disputed;

        emit StatementDisputed(statementId, statement.supplier, reason);
    }

    /**
     * @notice Claim accumulated payment balance
     * @dev Transfers the full claimable balance to the caller
     */
    function claimPayment() external nonReentrant whenNotPaused {
        uint256 amount = claimableBalances[msg.sender];
        if (amount == 0) {
            revert NothingToClaim();
        }

        claimableBalances[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);

        emit PaymentClaimed(msg.sender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get full statement details
     * @param statementId The statement ID to query
     * @return statement The Statement struct
     */
    function getStatement(bytes32 statementId) external view returns (Statement memory) {
        return statements[statementId];
    }

    /**
     * @notice Get claimable balance for a supplier
     * @param supplier The supplier address
     * @return The claimable balance in USDC
     */
    function getClaimableBalance(address supplier) external view returns (uint256) {
        return claimableBalances[supplier];
    }

    /**
     * @notice Check if a statement can be finalized
     * @param statementId The statement ID to check
     * @return True if the statement is submitted and dispute window has passed
     */
    function isFinalizable(bytes32 statementId) external view returns (bool) {
        Statement storage statement = statements[statementId];
        if (statement.status != StatementStatus.Submitted) {
            return false;
        }
        return block.timestamp >= statement.submittedAt + disputeWindow;
    }

    /**
     * @notice Get remaining time in dispute window
     * @param statementId The statement ID to check
     * @return Remaining seconds, or 0 if window has passed
     */
    function getRemainingDisputeTime(bytes32 statementId) external view returns (uint256) {
        Statement storage statement = statements[statementId];
        if (statement.status != StatementStatus.Submitted) {
            return 0;
        }
        uint256 windowEnd = statement.submittedAt + disputeWindow;
        if (block.timestamp >= windowEnd) {
            return 0;
        }
        return windowEnd - block.timestamp;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the dispute window duration
     * @param newWindow New dispute window in seconds
     */
    function setDisputeWindow(uint256 newWindow) external onlyOwner {
        if (newWindow == 0 || newWindow > MAX_DISPUTE_WINDOW) {
            revert InvalidDisputeWindow();
        }
        disputeWindow = newWindow;
    }

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
