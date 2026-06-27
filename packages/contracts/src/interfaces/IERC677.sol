// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IERC677
/// @notice ERC-677 extends ERC-20 with `transferAndCall`, the pattern G$ uses
///         to fund a contract in a single transaction (no separate approve).
interface IERC677 is IERC20 {
    function transferAndCall(address to, uint256 value, bytes calldata data)
        external
        returns (bool);
}

/// @notice The receiver hook an ERC-677 `transferAndCall` invokes on `to`.
interface IERC677Receiver {
    function onTokenTransfer(address from, uint256 amount, bytes calldata data)
        external
        returns (bool);
}
