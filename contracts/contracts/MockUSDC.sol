// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC (tUSDC)
/// @notice Test stablecoin with 6 decimals used to pay for Wayfare bookings on testnets.
/// @dev Anyone can call {faucet} once per hour; the owner can mint arbitrary amounts for seeding.
contract MockUSDC is ERC20, Ownable {
    /// @notice Amount minted per faucet call (1,000 tUSDC).
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e6;
    /// @notice Minimum time between two faucet calls of the same address.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @dev Last faucet timestamp per address.
    mapping(address => uint256) private _lastFaucetAt;

    /// @notice Thrown when {faucet} is called again before the cooldown elapsed.
    /// @param nextAt Unix time from which the caller may use the faucet again.
    error FaucetCooldown(uint256 nextAt);

    /// @notice Emitted when an address receives test tokens from the faucet.
    event FaucetUsed(address indexed to, uint256 amount);

    constructor() ERC20("Test USDC", "tUSDC") Ownable(msg.sender) {}

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint 1,000 tUSDC to the caller. Limited to once per address per hour.
    function faucet() external {
        uint256 nextAt = nextFaucetAt(msg.sender);
        if (block.timestamp < nextAt) revert FaucetCooldown(nextAt);
        _lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetUsed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Unix time from which `account` may call {faucet} (0 if never used).
    function nextFaucetAt(address account) public view returns (uint256) {
        uint256 last = _lastFaucetAt[account];
        return last == 0 ? 0 : last + FAUCET_COOLDOWN;
    }

    /// @notice Owner-only mint for seeding demo accounts.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
