// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWayfareBooking} from "./IWayfareBooking.sol";
import {WayfareTicket} from "./WayfareTicket.sol";

/// @title WayfareBooking
/// @notice Books a whole multi-leg trip in a single transaction: verifies a server-signed EIP-712 quote,
///         pulls the total once, escrows funds per ticket and mints one NFT ticket per leg per passenger.
/// @dev Escrow per ticket is released to the operator on check-in or no-show claim, refunded in full to the
///      current ticket holder when the operator cancels, or refunded minus a fee when the passenger cancels
///      before the refund deadline. Invariant per trip: paid out to operators + refunded + outstanding escrow
///      == total pulled from the passenger.
contract WayfareBooking is IWayfareBooking, ReentrancyGuard, EIP712, Ownable {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // EIP-712 types (signed by the Wayfare web server with viem signTypedData)
    // ------------------------------------------------------------------

    /// @notice One bookable leg of a quote.
    struct Leg {
        address operator;
        bytes32 serviceId;
        uint256 price;
        uint64 departAt;
        uint64 refundDeadline;
        uint16 cancelFeeBps;
        string label;
    }

    /// @notice A signed price quote for a whole trip.
    struct Quote {
        bytes32 quoteId;
        address passenger;
        uint8 pax;
        uint64 expiresAt;
        Leg[] legs;
    }

    /// @notice A booked trip.
    struct Trip {
        address passenger;
        bytes32 quoteId;
        uint8 pax;
        uint256 total;
        uint64 createdAt;
        uint256[] ticketIds;
    }

    /// @notice Registered operator data.
    struct Operator {
        string name;
        bool active;
        bool registered;
    }

    bytes32 public constant LEG_TYPEHASH = keccak256(
        "Leg(address operator,bytes32 serviceId,uint256 price,uint64 departAt,uint64 refundDeadline,uint16 cancelFeeBps,string label)"
    );
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 quoteId,address passenger,uint8 pax,uint64 expiresAt,Leg[] legs)Leg(address operator,bytes32 serviceId,uint256 price,uint64 departAt,uint64 refundDeadline,uint16 cancelFeeBps,string label)"
    );

    /// @notice Maximum passengers per booking.
    uint8 public constant MAX_PAX = 9;
    /// @notice Maximum legs per booking.
    uint256 public constant MAX_LEGS = 5;
    /// @notice Grace period after departure before an operator may claim a no-show.
    uint64 public constant NO_SHOW_GRACE = 2 hours;

    /// @notice Payment token (tUSDC, 6 decimals).
    IERC20 public immutable usdc;
    /// @notice Ticket NFT contract.
    WayfareTicket public immutable ticket;

    /// @notice Address whose EIP-712 signature authorizes quotes.
    address public quoteSigner;

    mapping(address => Operator) private _operators;
    address[] private _operatorList;

    mapping(bytes32 => bool) public quoteUsed;
    mapping(uint256 => Trip) private _trips;
    mapping(address => uint256[]) private _tripsOf;
    mapping(uint256 => LegInfo) private _legs;
    mapping(bytes32 => uint256[]) private _ticketsOfService;
    mapping(address => uint256[]) private _ticketsOfOperator;

    uint256 private _tripCount;
    uint256 private _ticketsIssued;
    uint256 private _totalRefunded;
    uint256 private _totalPaidToOperators;

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    /// @notice The quote signature was not produced by the configured quote signer.
    error InvalidSignature();
    /// @notice The quote expired (`block.timestamp > expiresAt`).
    error QuoteExpired();
    /// @notice The quote id was already used for a booking.
    error QuoteAlreadyUsed();
    /// @notice The caller is not the passenger named in the quote.
    error NotPassenger();
    /// @notice A leg operator is not registered or has been deactivated.
    error OperatorInactive(address operator);
    /// @notice The operator to update is not registered.
    error OperatorNotRegistered(address operator);
    /// @notice The caller is not the operator of the ticket's leg.
    error NotLegOperator();
    /// @notice The caller does not hold the ticket.
    error NotTicketHolder();
    /// @notice The ticket is not in the status required by the action (must be `Booked`).
    error InvalidStatus();
    /// @notice The passenger refund deadline has passed.
    error RefundDeadlinePassed();
    /// @notice A no-show can only be claimed `NO_SHOW_GRACE` after departure.
    error NoShowTooEarly();
    /// @notice The quote is malformed (pax, leg count, fee bps or deadline out of range).
    error BadQuote();
    /// @notice The ticket id does not exist.
    error UnknownTicket();
    /// @notice The trip id does not exist.
    error UnknownTrip();
    /// @notice A required address argument was zero.
    error ZeroAddress();

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event OperatorRegistered(address indexed operator, string name);
    event OperatorStatusChanged(address indexed operator, bool active);
    event QuoteSignerChanged(address indexed previousSigner, address indexed newSigner);
    event TripBooked(
        uint256 indexed tripId, address indexed passenger, bytes32 indexed quoteId, uint8 pax, uint256 total
    );
    event TicketIssued(
        uint256 indexed ticketId, uint256 indexed tripId, address indexed operator, bytes32 serviceId, uint256 price
    );
    event CheckedIn(uint256 indexed ticketId, address indexed operator, uint256 amount);
    event CancelledByOperator(uint256 indexed ticketId, address indexed holder, uint256 refund);
    event CancelledByPassenger(uint256 indexed ticketId, address indexed holder, uint256 refund, uint256 fee);
    event NoShowClaimed(uint256 indexed ticketId, address indexed operator, uint256 amount);

    /// @param usdc_ Payment token.
    /// @param ticket_ Ticket NFT contract (its `setBooking` must point here).
    /// @param quoteSigner_ Initial quote signer.
    constructor(IERC20 usdc_, WayfareTicket ticket_, address quoteSigner_)
        EIP712("WayfareBooking", "1")
        Ownable(msg.sender)
    {
        if (address(usdc_) == address(0) || address(ticket_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
        ticket = ticket_;
        quoteSigner = quoteSigner_;
        emit QuoteSignerChanged(address(0), quoteSigner_);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /// @notice Register (or rename) an operator and mark it active.
    /// @param op Operator payout/admin address.
    /// @param name Display name shown on tickets.
    function registerOperator(address op, string calldata name) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        Operator storage o = _operators[op];
        if (!o.registered) {
            o.registered = true;
            _operatorList.push(op);
        }
        o.name = name;
        o.active = true;
        emit OperatorRegistered(op, name);
        emit OperatorStatusChanged(op, true);
    }

    /// @notice Enable or disable a registered operator. Disabled operators cannot be booked.
    function setOperatorActive(address op, bool active) external onlyOwner {
        Operator storage o = _operators[op];
        if (!o.registered) revert OperatorNotRegistered(op);
        o.active = active;
        emit OperatorStatusChanged(op, active);
    }

    /// @notice Change the address that signs quotes.
    function setQuoteSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        emit QuoteSignerChanged(quoteSigner, signer);
        quoteSigner = signer;
    }

    // ------------------------------------------------------------------
    // Booking
    // ------------------------------------------------------------------

    /// @notice Book every leg of a signed quote in one transaction.
    /// @dev Caller must have approved `total = sum(leg.price) * pax` tUSDC. Pulls funds once.
    /// @param q The quote, exactly as signed by the quote signer.
    /// @param signature EIP-712 signature of `q` by {quoteSigner}.
    /// @return tripId The new trip id (starting at 1).
    function bookTrip(Quote calldata q, bytes calldata signature) external nonReentrant returns (uint256 tripId) {
        if (block.timestamp > q.expiresAt) revert QuoteExpired();
        if (quoteUsed[q.quoteId]) revert QuoteAlreadyUsed();
        if (msg.sender != q.passenger) revert NotPassenger();
        uint256 legCount = q.legs.length;
        if (q.pax == 0 || q.pax > MAX_PAX || legCount == 0 || legCount > MAX_LEGS) revert BadQuote();

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashQuote(q), signature);
        if (err != ECDSA.RecoverError.NoError || recovered == address(0) || recovered != quoteSigner) {
            revert InvalidSignature();
        }

        uint256 total;
        for (uint256 i; i < legCount; ++i) {
            Leg calldata l = q.legs[i];
            Operator storage o = _operators[l.operator];
            if (!o.registered || !o.active) revert OperatorInactive(l.operator);
            if (l.cancelFeeBps > 10_000 || l.refundDeadline > l.departAt) revert BadQuote();
            total += l.price * q.pax;
        }

        quoteUsed[q.quoteId] = true;
        tripId = ++_tripCount;
        Trip storage t = _trips[tripId];
        t.passenger = q.passenger;
        t.quoteId = q.quoteId;
        t.pax = q.pax;
        t.total = total;
        t.createdAt = uint64(block.timestamp);
        _tripsOf[q.passenger].push(tripId);

        usdc.safeTransferFrom(msg.sender, address(this), total);

        for (uint256 i; i < legCount; ++i) {
            Leg calldata l = q.legs[i];
            for (uint256 p; p < q.pax; ++p) {
                uint256 ticketId = ticket.mint(q.passenger);
                LegInfo storage info = _legs[ticketId];
                info.tripId = tripId;
                info.operator = l.operator;
                info.serviceId = l.serviceId;
                info.price = l.price;
                info.departAt = l.departAt;
                info.refundDeadline = l.refundDeadline;
                info.cancelFeeBps = l.cancelFeeBps;
                info.status = Status.Booked;
                info.label = l.label;
                t.ticketIds.push(ticketId);
                _ticketsOfService[l.serviceId].push(ticketId);
                _ticketsOfOperator[l.operator].push(ticketId);
                emit TicketIssued(ticketId, tripId, l.operator, l.serviceId, l.price);
            }
        }
        _ticketsIssued += legCount * q.pax;

        emit TripBooked(tripId, q.passenger, q.quoteId, q.pax, total);
    }

    /// @notice Operator checks a passenger in; the ticket's escrow is paid to the operator immediately.
    function checkIn(uint256 ticketId) external nonReentrant {
        LegInfo storage l = _operatorLeg(ticketId);
        l.status = Status.CheckedIn;
        uint256 amount = l.price;
        l.paidOut = amount;
        _totalPaidToOperators += amount;
        usdc.safeTransfer(l.operator, amount);
        emit CheckedIn(ticketId, l.operator, amount);
    }

    /// @notice Operator cancels one ticket; the current holder is refunded in full immediately.
    function cancelByOperator(uint256 ticketId) external nonReentrant {
        _cancelByOperator(ticketId);
    }

    /// @notice Operator cancels many tickets (e.g. a whole departure); every holder is refunded in full.
    function cancelManyByOperator(uint256[] calldata ticketIds) external nonReentrant {
        for (uint256 i; i < ticketIds.length; ++i) {
            _cancelByOperator(ticketIds[i]);
        }
    }

    /// @notice Ticket holder cancels before the refund deadline; refund = price - fee, fee goes to the operator.
    function cancelByPassenger(uint256 ticketId) external nonReentrant {
        LegInfo storage l = _existingLeg(ticketId);
        if (ticket.ownerOf(ticketId) != msg.sender) revert NotTicketHolder();
        if (l.status != Status.Booked) revert InvalidStatus();
        if (block.timestamp >= l.refundDeadline) revert RefundDeadlinePassed();

        l.status = Status.CancelledByPassenger;
        uint256 fee = (l.price * l.cancelFeeBps) / 10_000;
        uint256 refund = l.price - fee;
        l.paidOut = fee;
        l.refunded = refund;
        _totalPaidToOperators += fee;
        _totalRefunded += refund;
        if (refund > 0) usdc.safeTransfer(msg.sender, refund);
        if (fee > 0) usdc.safeTransfer(l.operator, fee);
        emit CancelledByPassenger(ticketId, msg.sender, refund, fee);
    }

    /// @notice Operator claims the escrow of a ticket that was not checked in by `departAt + 2 hours`.
    function claimNoShow(uint256 ticketId) external nonReentrant {
        LegInfo storage l = _operatorLeg(ticketId);
        if (block.timestamp < uint256(l.departAt) + NO_SHOW_GRACE) revert NoShowTooEarly();
        l.status = Status.NoShowClaimed;
        uint256 amount = l.price;
        l.paidOut = amount;
        _totalPaidToOperators += amount;
        usdc.safeTransfer(l.operator, amount);
        emit NoShowClaimed(ticketId, l.operator, amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice EIP-712 digest of a quote (what the quote signer signs).
    function hashQuote(Quote calldata q) public view returns (bytes32) {
        uint256 n = q.legs.length;
        bytes32[] memory legHashes = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            Leg calldata l = q.legs[i];
            legHashes[i] = keccak256(
                abi.encode(
                    LEG_TYPEHASH,
                    l.operator,
                    l.serviceId,
                    l.price,
                    l.departAt,
                    l.refundDeadline,
                    l.cancelFeeBps,
                    keccak256(bytes(l.label))
                )
            );
        }
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH, q.quoteId, q.passenger, q.pax, q.expiresAt, keccak256(abi.encodePacked(legHashes))
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice EIP-712 domain separator.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @inheritdoc IWayfareBooking
    function isTransferable(uint256 ticketId) external view returns (bool) {
        return _legs[ticketId].tripId != 0 && _legs[ticketId].status == Status.Booked;
    }

    /// @inheritdoc IWayfareBooking
    function legOf(uint256 ticketId) external view returns (LegInfo memory) {
        return _existingLeg(ticketId);
    }

    /// @notice Trip data including all ticket ids.
    function tripOf(uint256 tripId) external view returns (Trip memory) {
        if (tripId == 0 || tripId > _tripCount) revert UnknownTrip();
        return _trips[tripId];
    }

    /// @notice All trip ids booked by `passenger`.
    function tripsOf(address passenger) external view returns (uint256[] memory) {
        return _tripsOf[passenger];
    }

    /// @notice All ticket ids of a departure.
    function ticketsOfService(bytes32 serviceId) external view returns (uint256[] memory) {
        return _ticketsOfService[serviceId];
    }

    /// @notice All ticket ids sold by an operator.
    function ticketsOfOperator(address op) external view returns (uint256[] memory) {
        return _ticketsOfOperator[op];
    }

    /// @inheritdoc IWayfareBooking
    function operatorInfo(address op) external view returns (string memory name, bool active) {
        Operator storage o = _operators[op];
        return (o.name, o.active);
    }

    /// @notice Every operator ever registered (active or not).
    function operatorList() external view returns (address[] memory) {
        return _operatorList;
    }

    /// @notice Number of trips booked so far.
    function tripCount() external view returns (uint256) {
        return _tripCount;
    }

    /// @notice Aggregate stats for the landing page.
    function stats()
        external
        view
        returns (uint256 tripsBooked, uint256 ticketsIssued, uint256 totalRefunded, uint256 totalPaidToOperators)
    {
        return (_tripCount, _ticketsIssued, _totalRefunded, _totalPaidToOperators);
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _existingLeg(uint256 ticketId) internal view returns (LegInfo storage l) {
        l = _legs[ticketId];
        if (l.tripId == 0) revert UnknownTicket();
    }

    /// @dev Loads a leg that the caller operates and that is still `Booked`.
    function _operatorLeg(uint256 ticketId) internal view returns (LegInfo storage l) {
        l = _existingLeg(ticketId);
        if (l.operator != msg.sender) revert NotLegOperator();
        if (l.status != Status.Booked) revert InvalidStatus();
    }

    function _cancelByOperator(uint256 ticketId) internal {
        LegInfo storage l = _operatorLeg(ticketId);
        l.status = Status.CancelledByOperator;
        uint256 refund = l.price;
        l.refunded = refund;
        _totalRefunded += refund;
        address holder = ticket.ownerOf(ticketId);
        usdc.safeTransfer(holder, refund);
        emit CancelledByOperator(ticketId, holder, refund);
    }
}
