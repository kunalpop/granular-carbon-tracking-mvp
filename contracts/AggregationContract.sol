// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {EmissionEventRegistry} from "./EmissionEventRegistry.sol";
import {CarbonToken} from "./CarbonToken.sol";

/// @title AggregationContract
/// @notice Deterministic roll-up of per-stage emission events into a product
///         carbon footprint (FR3; the granularity half of DP1). Every
///         function is a view over public ledger state, so ANY auditor can
///         recompute the same numbers independently — the contract holds no
///         state of its own that could diverge from the events.
contract AggregationContract {
    EmissionEventRegistry public immutable eventRegistry;
    CarbonToken public immutable carbonToken;

    uint8 public constant STAGE_COUNT = 10;

    constructor(EmissionEventRegistry _eventRegistry, CarbonToken _carbonToken) {
        eventRegistry = _eventRegistry;
        carbonToken = _carbonToken;
    }

    /// @notice Total footprint of a product in grams CO2e (signed: recycling
    ///         credits can subtract).
    function productTotal(uint256 productId) public view returns (int256 total) {
        EmissionEventRegistry.EmissionEvent[] memory evs = eventRegistry.getEvents(productId);
        for (uint256 i = 0; i < evs.length; i++) {
            total += evs[i].co2eGrams;
        }
    }

    /// @notice Sub-total for one lifecycle stage.
    function stageTotal(uint256 productId, uint8 stageId) public view returns (int256 total) {
        EmissionEventRegistry.EmissionEvent[] memory evs = eventRegistry.getEvents(productId);
        for (uint256 i = 0; i < evs.length; i++) {
            if (evs[i].stageId == stageId) total += evs[i].co2eGrams;
        }
    }

    /// @notice Which of the 10 lifecycle stages have at least one event
    ///         (completeness check for Study B). Index 0 = stage 1.
    function stagesPresent(uint256 productId) public view returns (bool[10] memory present) {
        EmissionEventRegistry.EmissionEvent[] memory evs = eventRegistry.getEvents(productId);
        for (uint256 i = 0; i < evs.length; i++) {
            uint8 s = evs[i].stageId;
            if (s >= 1 && s <= STAGE_COUNT) present[s - 1] = true;
        }
    }

    function isComplete(uint256 productId) external view returns (bool) {
        bool[10] memory present = stagesPresent(productId);
        for (uint256 i = 0; i < STAGE_COUNT; i++) {
            if (!present[i]) return false;
        }
        return true;
    }

    /// @notice Cross-check the two independent records of the same quantity:
    ///         the sum of event co2eGrams (authoritative) versus the net
    ///         carbon token supply attributed to the product. A mismatch
    ///         means a reconciliation error and must be flagged, not
    ///         silently reported (Study B fault-injection).
    function crossCheck(uint256 productId)
        external
        view
        returns (int256 eventTotal, int256 tokenNet, bool consistent)
    {
        eventTotal = productTotal(productId);
        tokenNet = carbonToken.netCarbon(productId);
        consistent = (eventTotal == tokenNet);
    }
}
