// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {OwoEscrow} from "../src/OwoEscrow.sol";
import {OwoTreasury} from "../src/OwoTreasury.sol";
import {OwoRewards} from "../src/OwoRewards.sol";

/// @notice Deploys the Owo contract suite. Configure via env (see .env.example).
///         Targets Alfajores in Sprint 1; mainnet deploy is gated behind manual
///         approval + external audit (Section 4.5).
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url alfajores --broadcast
contract Deploy is Script {
    function run() external {
        address gdollar = vm.envAddress("GDOLLAR_TOKEN_ADDRESS");
        address stable = vm.envAddress("STABLE_TOKEN_ADDRESS");
        address owner = vm.envAddress("OWO_MULTISIG_OWNER");
        address confirmationSigner = vm.envAddress("CONFIRMATION_SIGNER_ADDRESS");
        address treasuryOperator = vm.envAddress("TREASURY_OPERATOR_ADDRESS");
        address rewardsGranter = vm.envAddress("REWARDS_GRANTER_ADDRESS");

        // Conservative Sprint-1 / testnet defaults — ratchet up post-audit.
        uint16 feeBps = 100; // 1%
        uint256 maxTrade = 1_000_000 ether;
        uint64 lockDuration = 30 minutes;

        vm.startBroadcast();

        OwoTreasury treasury = new OwoTreasury(
            gdollar, stable, treasuryOperator, 100_000 ether, 1_000_000 ether, owner
        );

        OwoEscrow escrow = new OwoEscrow(
            gdollar, confirmationSigner, address(treasury), feeBps, maxTrade, lockDuration, owner
        );

        OwoRewards rewards = new OwoRewards(gdollar, rewardsGranter, 1000 ether, owner);

        vm.stopBroadcast();

        console2.log("OwoTreasury:", address(treasury));
        console2.log("OwoEscrow:  ", address(escrow));
        console2.log("OwoRewards: ", address(rewards));
    }
}
