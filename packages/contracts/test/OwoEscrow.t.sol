// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OwoEscrow} from "../src/OwoEscrow.sol";
import {MockGoodDollar} from "./mocks/MockGoodDollar.sol";

contract OwoEscrowTest is Test {
    MockGoodDollar internal gd;
    OwoEscrow internal escrow;

    address internal owner = makeAddr("owner");
    address internal signer = makeAddr("confirmationSigner");
    address internal treasury = makeAddr("treasury");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");

    uint16 internal constant FEE_BPS = 100; // 1%
    uint256 internal constant MAX_TRADE = 1_000_000 ether;
    uint64 internal constant LOCK_DURATION = 30 minutes;

    function setUp() public {
        gd = new MockGoodDollar();
        escrow =
            new OwoEscrow(address(gd), signer, treasury, FEE_BPS, MAX_TRADE, LOCK_DURATION, owner);
        gd.mint(seller, 10_000 ether);
    }

    function _fund(uint256 amount) internal returns (uint256 tradeId) {
        vm.prank(seller);
        gd.transferAndCall(address(escrow), amount, "");
        tradeId = escrow.nextTradeId() - 1;
    }

    function test_FundCreatesTrade() public {
        uint256 tradeId = _fund(1000 ether);
        (address s,, uint256 amt,, OwoEscrow.State state) = escrow.trades(tradeId);
        assertEq(s, seller);
        assertEq(amt, 1000 ether);
        assertEq(uint8(state), uint8(OwoEscrow.State.FUNDED));
        assertEq(escrow.totalEscrowed(), 1000 ether);
    }

    function test_HappyPath_LockThenRelease() public {
        uint256 tradeId = _fund(1000 ether);

        vm.prank(owner);
        escrow.lock(tradeId, buyer);

        vm.prank(signer);
        escrow.release(tradeId);

        // 1% fee -> treasury, remainder -> buyer
        assertEq(gd.balanceOf(buyer), 990 ether);
        assertEq(gd.balanceOf(treasury), 10 ether);
        assertEq(escrow.totalEscrowed(), 0);
    }

    function test_RefundOnTimeout() public {
        uint256 tradeId = _fund(1000 ether);
        vm.prank(owner);
        escrow.lock(tradeId, buyer);

        // before deadline: refund reverts
        vm.expectRevert(OwoEscrow.DeadlineNotPassed.selector);
        escrow.refund(tradeId);

        vm.warp(block.timestamp + LOCK_DURATION + 1);
        escrow.refund(tradeId);

        assertEq(gd.balanceOf(seller), 10_000 ether);
        assertEq(escrow.totalEscrowed(), 0);
    }

    function test_SellerCanCancelFundedTrade() public {
        uint256 tradeId = _fund(1000 ether);
        vm.prank(seller);
        escrow.refund(tradeId);
        assertEq(gd.balanceOf(seller), 10_000 ether);
    }

    function test_OnlySignerCanRelease() public {
        uint256 tradeId = _fund(1000 ether);
        vm.prank(owner);
        escrow.lock(tradeId, buyer);

        vm.expectRevert(OwoEscrow.NotConfirmationSigner.selector);
        vm.prank(buyer);
        escrow.release(tradeId);
    }

    function test_DisputeFreezesAndArbiterResolves() public {
        uint256 tradeId = _fund(1000 ether);
        vm.prank(owner);
        escrow.lock(tradeId, buyer);

        vm.prank(buyer);
        escrow.dispute(tradeId);

        // signer can no longer unilaterally release a disputed trade
        vm.expectRevert(
            abi.encodeWithSelector(
                OwoEscrow.WrongState.selector, OwoEscrow.State.LOCKED, OwoEscrow.State.DISPUTED
            )
        );
        vm.prank(signer);
        escrow.release(tradeId);

        vm.prank(owner);
        escrow.resolveDispute(tradeId, true);
        assertEq(gd.balanceOf(buyer), 990 ether);
    }

    function test_RejectsOversizeTrade() public {
        gd.mint(seller, MAX_TRADE + 1);
        vm.prank(seller);
        vm.expectRevert(OwoEscrow.AmountTooLarge.selector);
        gd.transferAndCall(address(escrow), MAX_TRADE + 1, "");
    }

    /// @dev Documented invariant, checked as a fuzz property here: the contract's G$
    ///      balance always covers the sum of escrowed balances across live trades.
    function testFuzz_BalanceCoversEscrowed(uint96 a, uint96 b) public {
        a = uint96(bound(a, 1, uint96(MAX_TRADE)));
        b = uint96(bound(b, 1, uint96(MAX_TRADE)));
        gd.mint(seller, uint256(a) + b);

        vm.startPrank(seller);
        gd.transferAndCall(address(escrow), a, "");
        gd.transferAndCall(address(escrow), b, "");
        vm.stopPrank();

        assertGe(gd.balanceOf(address(escrow)), escrow.totalEscrowed());
    }
}
