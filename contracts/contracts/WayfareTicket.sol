// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IWayfareBooking} from "./IWayfareBooking.sol";

/// @title WayfareTicket (WFT)
/// @notice ERC-721 travel ticket: one token per leg per passenger. Minted only by the booking contract.
/// @dev Transfers are allowed only while the underlying leg is still `Booked`
///      (not after check-in, cancellation or a no-show claim). Metadata and image are fully on-chain.
contract WayfareTicket is ERC721Enumerable, Ownable {
    using Strings for uint256;

    /// @notice The WayfareBooking contract allowed to mint tickets.
    address public booking;
    /// @dev Last minted token id (ids start at 1).
    uint256 private _lastId;

    /// @notice Thrown when a caller other than the booking contract tries to mint.
    error NotBooking();
    /// @notice Thrown when {setBooking} is called after the booking contract was already set.
    error BookingAlreadySet();
    /// @notice Thrown when the zero address is passed where a contract address is required.
    error ZeroAddress();
    /// @notice Thrown when transferring a ticket whose leg is no longer `Booked`.
    /// @param tokenId The locked ticket.
    error TicketLocked(uint256 tokenId);

    /// @notice Emitted once when the booking contract is configured.
    event BookingSet(address indexed booking);

    constructor() ERC721("Wayfare Ticket", "WFT") Ownable(msg.sender) {}

    /// @notice Set the booking contract (one time only).
    /// @param booking_ Address of the deployed WayfareBooking.
    function setBooking(address booking_) external onlyOwner {
        if (booking != address(0)) revert BookingAlreadySet();
        if (booking_ == address(0)) revert ZeroAddress();
        booking = booking_;
        emit BookingSet(booking_);
    }

    /// @notice Mint a new ticket to `to`. Only callable by the booking contract.
    /// @param to Ticket receiver (the passenger).
    /// @return tokenId The id of the new ticket.
    function mint(address to) external returns (uint256 tokenId) {
        if (msg.sender != booking) revert NotBooking();
        tokenId = ++_lastId;
        _mint(to, tokenId);
    }

    /// @notice Total number of tickets ever minted.
    function totalMinted() external view returns (uint256) {
        return _lastId;
    }

    /// @notice All ticket ids currently held by `holder` (includes tickets received by transfer).
    function ticketsOfOwner(address holder) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(holder);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = tokenOfOwnerByIndex(holder, i);
    }

    /// @dev Blocks transfers of tickets whose leg is no longer transferable. Mints are unaffected.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (!IWayfareBooking(booking).isTransferable(tokenId)) revert TicketLocked(tokenId);
        }
        return super._update(to, tokenId, auth);
    }

    // ------------------------------------------------------------------
    // Metadata
    // ------------------------------------------------------------------

    /// @notice On-chain JSON metadata with an embedded SVG ticket image.
    /// @param tokenId The ticket id.
    /// @return A `data:application/json;base64,...` URI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        IWayfareBooking.LegInfo memory leg = IWayfareBooking(booking).legOf(tokenId);
        (string memory opName, ) = IWayfareBooking(booking).operatorInfo(leg.operator);

        string memory status = _statusName(leg.status);
        string memory price = _formatUsdc(leg.price);
        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_svg(tokenId, leg.label, opName, _formatUtc(leg.departAt), status, price)))
        );

        string memory attrs = string.concat(
            '[{"trait_type":"Operator","value":"',
            _escape(opName, false),
            '"},{"trait_type":"Route","value":"',
            _escape(leg.label, false),
            '"},{"trait_type":"Departure","display_type":"date","value":',
            uint256(leg.departAt).toString(),
            '},{"trait_type":"Status","value":"',
            status,
            '"},{"trait_type":"Price (tUSDC)","value":"',
            price,
            '"},{"trait_type":"Trip","value":',
            leg.tripId.toString(),
            "}]"
        );
        string memory json = string.concat(
            '{"name":"Wayfare Ticket #',
            tokenId.toString(),
            '","description":"',
            _escape(leg.label, false),
            ' - Wayfare travel ticket on Avalanche.","image":"',
            image,
            '","attributes":',
            attrs,
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(
        uint256 tokenId,
        string memory label,
        string memory opName,
        string memory when,
        string memory status,
        string memory price
    ) internal pure returns (string memory) {
        string memory head = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240" font-family="Helvetica,Arial,sans-serif">',
            '<rect x="2" y="2" width="396" height="236" rx="24" fill="#ffffff" stroke="#D6E2FF" stroke-width="2"/>',
            '<path d="M2 26a24 24 0 0 1 24-24h348a24 24 0 0 1 24 24v38H2z" fill="#1463FF"/>',
            '<text x="24" y="42" fill="#ffffff" font-size="20" font-weight="700" letter-spacing="3">WAYFARE</text>',
            '<text x="376" y="42" fill="#EAF1FF" font-size="14" text-anchor="end">#',
            tokenId.toString(),
            "</text>"
        );
        string memory body = string.concat(
            '<text x="24" y="94" fill="#0F172A" font-size="15" font-weight="700">',
            _escape(label, true),
            '</text><text x="24" y="122" fill="#475569" font-size="13">',
            _escape(opName, true),
            '</text><line x1="24" y1="140" x2="376" y2="140" stroke="#E2E8F0" stroke-dasharray="6 4"/>',
            '<text x="24" y="166" fill="#64748B" font-size="11">DEPARTURE</text>',
            '<text x="24" y="186" fill="#0F172A" font-size="14" font-weight="600">',
            when,
            '</text><text x="24" y="212" fill="#64748B" font-size="11">',
            price,
            " tUSDC</text>"
        );
        string memory tail = string.concat(
            '<rect x="252" y="166" width="124" height="30" rx="15" fill="',
            _statusColor(status),
            '"/><text x="314" y="186" fill="#ffffff" font-size="12" font-weight="700" text-anchor="middle">',
            status,
            "</text></svg>"
        );
        return string.concat(head, body, tail);
    }

    function _statusName(IWayfareBooking.Status s) internal pure returns (string memory) {
        if (s == IWayfareBooking.Status.Booked) return "BOOKED";
        if (s == IWayfareBooking.Status.CheckedIn) return "CHECKED IN";
        if (s == IWayfareBooking.Status.CancelledByOperator) return "CANCELLED";
        if (s == IWayfareBooking.Status.CancelledByPassenger) return "REFUNDED";
        return "NO SHOW";
    }

    function _statusColor(string memory status) internal pure returns (string memory) {
        bytes32 h = keccak256(bytes(status));
        if (h == keccak256("BOOKED")) return "#1463FF";
        if (h == keccak256("CHECKED IN")) return "#12A150";
        if (h == keccak256("NO SHOW")) return "#64748B";
        if (h == keccak256("REFUNDED")) return "#F59E0B";
        return "#E5484D";
    }

    /// @dev Formats a 6-decimals amount as "123.45".
    function _formatUsdc(uint256 amount) internal pure returns (string memory) {
        uint256 cents = (amount % 1e6) / 1e4;
        return string.concat((amount / 1e6).toString(), ".", cents < 10 ? "0" : "", cents.toString());
    }

    /// @dev Formats a unix timestamp as "YYYY-MM-DD HH:MM UTC".
    function _formatUtc(uint256 ts) internal pure returns (string memory) {
        (uint256 y, uint256 m, uint256 d) = _civilFromDays(ts / 86400);
        uint256 secs = ts % 86400;
        return string.concat(
            y.toString(),
            "-",
            _pad2(m),
            "-",
            _pad2(d),
            " ",
            _pad2(secs / 3600),
            ":",
            _pad2((secs % 3600) / 60),
            " UTC"
        );
    }

    function _pad2(uint256 v) internal pure returns (string memory) {
        return v < 10 ? string.concat("0", v.toString()) : v.toString();
    }

    /// @dev Howard Hinnant's days-to-civil algorithm (days since 1970-01-01, non-negative).
    function _civilFromDays(uint256 z) internal pure returns (uint256 y, uint256 m, uint256 d) {
        z += 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        d = doy - (153 * mp + 2) / 5 + 1;
        m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
    }

    /// @dev Escapes a string for JSON (quote, backslash, control chars) or for XML text (&, <, >).
    function _escape(string memory s, bool xml) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 5);
        uint256 j;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bytes memory rep;
            if (xml) {
                if (c == "&") rep = "&amp;";
                else if (c == "<") rep = "&lt;";
                else if (c == ">") rep = "&gt;";
            } else {
                if (c == '"') rep = '\\"';
                else if (c == "\\") rep = "\\\\";
                else if (uint8(c) < 0x20) rep = " ";
            }
            if (rep.length == 0) {
                out[j++] = c;
            } else {
                for (uint256 k; k < rep.length; ++k) out[j++] = rep[k];
            }
        }
        assembly {
            mstore(out, j)
        }
        return string(out);
    }
}
