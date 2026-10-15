// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWayfareBooking
/// @notice Shared types and the read interface the ticket contract uses to query bookings.
interface IWayfareBooking {
    /// @notice Lifecycle status of a single ticket (one leg for one passenger).
    enum Status {
        Booked,
        CheckedIn,
        CancelledByOperator,
        CancelledByPassenger,
        NoShowClaimed
    }

    /// @notice Stored information about one ticket.
    struct LegInfo {
        uint256 tripId;
        address operator;
        bytes32 serviceId;
        uint256 price;
        uint64 departAt;
        uint64 refundDeadline;
        uint16 cancelFeeBps;
        Status status;
        string label;
        uint256 paidOut;
        uint256 refunded;
    }

    /// @notice Returns the leg data of a ticket.
    function legOf(uint256 ticketId) external view returns (LegInfo memory);

    /// @notice Returns the registered name and active flag of an operator.
    function operatorInfo(address op) external view returns (string memory name, bool active);

    /// @notice True while the ticket may be transferred (status == Booked).
    function isTransferable(uint256 ticketId) external view returns (bool);
}
