// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaymentDistributor
 * @notice Interface for the payment distribution contract
 * @dev Handles fee splits between protocol, gateway, and supplier
 */
interface IPaymentDistributor {
    event PaymentDistributed(
        address indexed supplier,
        address indexed gateway,
        uint256 supplierAmount,
        uint256 protocolFee,
        uint256 gatewayFee
    );

    event FeesUpdated(uint256 protocolFeeBps, uint256 gatewayFeeBps);

    /**
     * @notice Distribute payment with fee splits
     * @param supplier The supplier receiving payment
     * @param totalAmount The total amount to distribute
     * @param gateway The gateway operator address
     */
    function distribute(address supplier, uint256 totalAmount, address gateway) external;

    /**
     * @notice Set fee percentages (owner only)
     * @param protocolFeeBps Protocol fee in basis points
     * @param gatewayFeeBps Gateway fee in basis points
     */
    function setFees(uint256 protocolFeeBps, uint256 gatewayFeeBps) external;

    /**
     * @notice Get current fee configuration
     * @return protocolFeeBps Protocol fee in basis points
     * @return gatewayFeeBps Gateway fee in basis points
     */
    function getFees() external view returns (uint256 protocolFeeBps, uint256 gatewayFeeBps);

    /**
     * @notice Calculate fee breakdown for an amount
     * @param totalAmount The total amount
     * @return supplierAmount Amount going to supplier
     * @return protocolFee Amount going to protocol
     * @return gatewayFee Amount going to gateway
     */
    function calculateFees(uint256 totalAmount)
        external
        view
        returns (uint256 supplierAmount, uint256 protocolFee, uint256 gatewayFee);
}
