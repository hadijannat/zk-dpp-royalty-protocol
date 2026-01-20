// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPaymentDistributor } from "./interfaces/IPaymentDistributor.sol";

/**
 * @title PaymentDistributor
 * @notice Handles multi-party payment distribution with protocol and gateway fees
 * @dev Splits payments between supplier, protocol treasury, and gateway operator
 *
 * Fee structure (configurable):
 * - Protocol fee: 2% (200 bps) - goes to protocol treasury
 * - Gateway fee: 0.5% (50 bps) - goes to gateway operator
 * - Supplier: remainder after fees
 */
contract PaymentDistributor is IPaymentDistributor, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The payment token (USDC on Base)
    IERC20 public immutable paymentToken;

    /// @notice Protocol treasury address
    address public protocolTreasury;

    /// @notice Protocol fee in basis points (1 bp = 0.01%)
    uint256 public protocolFeeBps;

    /// @notice Gateway fee in basis points
    uint256 public gatewayFeeBps;

    /// @notice Maximum combined fee: 10% (1000 bps)
    uint256 public constant MAX_TOTAL_FEE_BPS = 1000;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Default protocol fee: 2% (200 bps)
    uint256 public constant DEFAULT_PROTOCOL_FEE_BPS = 200;

    /// @notice Default gateway fee: 0.5% (50 bps)
    uint256 public constant DEFAULT_GATEWAY_FEE_BPS = 50;

    /// @notice Accumulated protocol fees (for batch claiming)
    uint256 public accumulatedProtocolFees;

    /// @notice Accumulated gateway fees per operator
    mapping(address => uint256) public accumulatedGatewayFees;

    error InvalidAddress();
    error InvalidAmount();
    error FeesTooHigh(uint256 combined, uint256 max);
    error InsufficientBalance(uint256 available, uint256 required);
    error NothingToClaim();

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);
    event GatewayFeesClaimed(address indexed gateway, uint256 amount);

    constructor(address _paymentToken, address _protocolTreasury, address _initialOwner) Ownable(_initialOwner) {
        if (_protocolTreasury == address(0)) {
            revert InvalidAddress();
        }

        paymentToken = IERC20(_paymentToken);
        protocolTreasury = _protocolTreasury;
        protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS;
        gatewayFeeBps = DEFAULT_GATEWAY_FEE_BPS;
    }

    /**
     * @notice Distribute payment with fee splits
     * @param supplier The supplier receiving the primary payment
     * @param totalAmount The total amount to distribute
     * @param gateway The gateway operator receiving gateway fees
     */
    function distribute(address supplier, uint256 totalAmount, address gateway) external nonReentrant whenNotPaused {
        if (supplier == address(0)) {
            revert InvalidAddress();
        }
        if (totalAmount == 0) {
            revert InvalidAmount();
        }

        // Calculate fees
        (uint256 supplierAmount, uint256 protocolFee, uint256 gatewayFee) = calculateFees(totalAmount);

        // Transfer from caller to this contract
        paymentToken.safeTransferFrom(msg.sender, address(this), totalAmount);

        // Pay supplier directly
        paymentToken.safeTransfer(supplier, supplierAmount);

        // Accumulate protocol fees
        accumulatedProtocolFees += protocolFee;

        // Accumulate gateway fees (if gateway provided)
        if (gateway != address(0) && gatewayFee > 0) {
            accumulatedGatewayFees[gateway] += gatewayFee;
        } else {
            // If no gateway, protocol gets the gateway fee too
            accumulatedProtocolFees += gatewayFee;
        }

        emit PaymentDistributed(supplier, gateway, supplierAmount, protocolFee, gatewayFee);
    }

    /**
     * @notice Set fee percentages
     * @param _protocolFeeBps New protocol fee in basis points
     * @param _gatewayFeeBps New gateway fee in basis points
     */
    function setFees(uint256 _protocolFeeBps, uint256 _gatewayFeeBps) external onlyOwner {
        uint256 combined = _protocolFeeBps + _gatewayFeeBps;
        if (combined > MAX_TOTAL_FEE_BPS) {
            revert FeesTooHigh(combined, MAX_TOTAL_FEE_BPS);
        }

        protocolFeeBps = _protocolFeeBps;
        gatewayFeeBps = _gatewayFeeBps;

        emit FeesUpdated(_protocolFeeBps, _gatewayFeeBps);
    }

    /**
     * @notice Update protocol treasury address
     * @param newTreasury New treasury address
     */
    function setProtocolTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert InvalidAddress();
        }
        address oldTreasury = protocolTreasury;
        protocolTreasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Claim accumulated protocol fees
     */
    function claimProtocolFees() external nonReentrant {
        uint256 amount = accumulatedProtocolFees;
        if (amount == 0) {
            revert NothingToClaim();
        }

        accumulatedProtocolFees = 0;
        paymentToken.safeTransfer(protocolTreasury, amount);

        emit ProtocolFeesClaimed(protocolTreasury, amount);
    }

    /**
     * @notice Claim accumulated gateway fees
     */
    function claimGatewayFees() external nonReentrant {
        uint256 amount = accumulatedGatewayFees[msg.sender];
        if (amount == 0) {
            revert NothingToClaim();
        }

        accumulatedGatewayFees[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);

        emit GatewayFeesClaimed(msg.sender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get current fee configuration
     * @return _protocolFeeBps Protocol fee in basis points
     * @return _gatewayFeeBps Gateway fee in basis points
     */
    function getFees() external view returns (uint256 _protocolFeeBps, uint256 _gatewayFeeBps) {
        return (protocolFeeBps, gatewayFeeBps);
    }

    /**
     * @notice Calculate fee breakdown for an amount
     * @param totalAmount The total amount
     * @return supplierAmount Amount going to supplier
     * @return protocolFee Amount going to protocol
     * @return gatewayFee Amount going to gateway
     */
    function calculateFees(uint256 totalAmount)
        public
        view
        returns (uint256 supplierAmount, uint256 protocolFee, uint256 gatewayFee)
    {
        protocolFee = (totalAmount * protocolFeeBps) / BPS_DENOMINATOR;
        gatewayFee = (totalAmount * gatewayFeeBps) / BPS_DENOMINATOR;
        supplierAmount = totalAmount - protocolFee - gatewayFee;
    }

    /**
     * @notice Get accumulated protocol fees
     * @return The accumulated amount
     */
    function getAccumulatedProtocolFees() external view returns (uint256) {
        return accumulatedProtocolFees;
    }

    /**
     * @notice Get accumulated gateway fees for an operator
     * @param gateway The gateway operator address
     * @return The accumulated amount
     */
    function getAccumulatedGatewayFees(address gateway) external view returns (uint256) {
        return accumulatedGatewayFees[gateway];
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
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
