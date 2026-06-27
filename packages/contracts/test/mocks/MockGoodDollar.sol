// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC677Receiver} from "../../src/interfaces/IERC677.sol";

/// @notice Minimal ERC-677 stand-in for G$ used in tests: standard ERC-20 plus
///         `transferAndCall` that invokes the receiver hook (the funding path).
contract MockGoodDollar is ERC20 {
    constructor() ERC20("Mock GoodDollar", "G$") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferAndCall(address to, uint256 value, bytes calldata data)
        external
        returns (bool)
    {
        _transfer(msg.sender, to, value);
        if (to.code.length > 0) {
            require(
                IERC677Receiver(to).onTokenTransfer(msg.sender, value, data),
                "onTokenTransfer failed"
            );
        }
        return true;
    }
}
