// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ParticipantRegistry} from "./ParticipantRegistry.sol";

/// @title EmissionEventRegistry / ProductPassport
/// @notice The authoritative, append-only store of granular emission events.
///         Each product's events form a hash-linked chain: every event embeds
///         the hash of the previous event, so any post-hoc alteration breaks
///         every later link. Instantiates DP1 (granularity, hybrid hash
///         architecture via evidenceHash) and DP5; FR1, FR4, FR6, FR7.
///
///         Units: co2eGrams is grams of CO2e (signed; negative = credit).
///         activityData and emissionFactor are scaled by 1000 (fixed-point,
///         3 decimals). emissionFactor is in gCO2e per activity unit.
///         co2eGrams is computed ON-CHAIN as activityData * emissionFactor
///         / 1_000_000, so a reported value can never contradict its inputs.
contract EmissionEventRegistry {
    struct EmissionEvent {
        uint256 productId;
        uint8 stageId;          // 1..10 lifecycle stage
        address actor;          // the permissioned account that wrote it
        uint256 activityData;   // x1000, e.g. 5_500 = 5.5 kWh
        string activityUnit;    // "kWh", "tkm", "kg", ...
        int256 emissionFactor;  // gCO2e per unit, x1000; negative = credit
        string efSource;        // e.g. "DEFRA-2026-freight-sea v1.0"
        int256 co2eGrams;       // computed on-chain
        string methodology;     // e.g. "GHG Protocol Scope 3 Cat 1"
        bytes32 evidenceHash;   // keccak256 of off-chain evidence file
        bytes32 prevEventHash;  // hash-link to this product's previous event
        uint64 timestamp;       // block time (caller cannot backdate)
        string schemaVersion;   // OntologyRegistry version (Phase 3)
        bytes32 eventHash;      // keccak256 over all fields above
    }

    struct Product {
        string description;
        address createdBy;
        uint64 createdAt;
        bool exists;
    }

    ParticipantRegistry public immutable participantRegistry;

    mapping(uint256 => Product) private _products;
    mapping(uint256 => EmissionEvent[]) private _eventsByProduct;
    mapping(uint256 => bytes32) public lastEventHash;

    event ProductCreated(uint256 indexed productId, address indexed createdBy, string description);
    event EmissionEventRecorded(
        uint256 indexed productId,
        uint8 indexed stageId,
        address indexed actor,
        int256 co2eGrams,
        bytes32 evidenceHash,
        bytes32 prevEventHash,
        bytes32 eventHash,
        uint256 eventIndex
    );

    error ProductAlreadyExists(uint256 productId);
    error UnknownProduct(uint256 productId);
    error NotAuthorisedForStage(address actor, uint8 stageId);
    error NotRegisteredParticipant(address actor);

    constructor(ParticipantRegistry registry) {
        participantRegistry = registry;
    }

    /// @notice Open a product passport. Any active registered participant may
    ///         do this (typically the genesis-stage actor).
    function createProduct(uint256 productId, string calldata description) external {
        if (!participantRegistry.isRegistered(msg.sender)) revert NotRegisteredParticipant(msg.sender);
        if (_products[productId].exists) revert ProductAlreadyExists(productId);
        _products[productId] = Product(description, msg.sender, uint64(block.timestamp), true);
        emit ProductCreated(productId, msg.sender, description);
    }

    /// @notice Append one emission event to a product's chain. There is
    ///         deliberately NO function to edit or delete an event: the
    ///         registry is append-only (FR4/FR5; corrections are a governed
    ///         superseding record, added by the GovernanceModule phase).
    function recordEvent(
        uint256 productId,
        uint8 stageId,
        uint256 activityData,
        string calldata activityUnit,
        int256 emissionFactor,
        string calldata efSource,
        string calldata methodology,
        bytes32 evidenceHash,
        string calldata schemaVersion
    ) external returns (bytes32) {
        if (!_products[productId].exists) revert UnknownProduct(productId);
        if (!participantRegistry.canWriteStage(msg.sender, stageId)) {
            revert NotAuthorisedForStage(msg.sender, stageId);
        }

        EmissionEvent memory e;
        e.productId = productId;
        e.stageId = stageId;
        e.actor = msg.sender;
        e.activityData = activityData;
        e.activityUnit = activityUnit;
        e.emissionFactor = emissionFactor;
        e.efSource = efSource;
        e.co2eGrams = (int256(activityData) * emissionFactor) / 1_000_000;
        e.methodology = methodology;
        e.evidenceHash = evidenceHash;
        e.prevEventHash = lastEventHash[productId];
        e.timestamp = uint64(block.timestamp);
        e.schemaVersion = schemaVersion;
        e.eventHash = _hashEvent(e);

        _eventsByProduct[productId].push(e);
        lastEventHash[productId] = e.eventHash;

        emit EmissionEventRecorded(
            productId,
            stageId,
            msg.sender,
            e.co2eGrams,
            evidenceHash,
            e.prevEventHash,
            e.eventHash,
            _eventsByProduct[productId].length - 1
        );
        return e.eventHash;
    }

    /// @dev Canonical event hash: keccak256 over every field except eventHash
    ///      itself. An auditor can recompute this off-chain from public data.
    function _hashEvent(EmissionEvent memory e) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                e.productId,
                e.stageId,
                e.actor,
                e.activityData,
                e.activityUnit,
                e.emissionFactor,
                e.efSource,
                e.co2eGrams,
                e.methodology,
                e.evidenceHash,
                e.prevEventHash,
                e.timestamp,
                e.schemaVersion
            )
        );
    }

    // ---------------- views for auditors and the aggregator ----------------

    function productExists(uint256 productId) external view returns (bool) {
        return _products[productId].exists;
    }

    function getProduct(uint256 productId) external view returns (Product memory) {
        if (!_products[productId].exists) revert UnknownProduct(productId);
        return _products[productId];
    }

    function eventCount(uint256 productId) external view returns (uint256) {
        return _eventsByProduct[productId].length;
    }

    // Named eventAt (not getEvent) to avoid colliding with ethers.js's
    // built-in Contract.getEvent helper in client code.
    function eventAt(uint256 productId, uint256 index) external view returns (EmissionEvent memory) {
        return _eventsByProduct[productId][index];
    }

    function getEvents(uint256 productId) external view returns (EmissionEvent[] memory) {
        return _eventsByProduct[productId];
    }

    /// @notice Recompute the whole hash chain for a product from stored data.
    /// @return ok true if every link verifies
    /// @return firstBrokenIndex index of the first bad event (max uint if ok)
    function verifyChain(uint256 productId) external view returns (bool ok, uint256 firstBrokenIndex) {
        EmissionEvent[] storage evs = _eventsByProduct[productId];
        bytes32 prev = bytes32(0);
        for (uint256 i = 0; i < evs.length; i++) {
            EmissionEvent memory e = evs[i];
            if (e.prevEventHash != prev || _hashEvent(e) != e.eventHash) {
                return (false, i);
            }
            prev = e.eventHash;
        }
        if (prev != lastEventHash[productId]) return (false, evs.length);
        return (true, type(uint256).max);
    }
}
