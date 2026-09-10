// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EmissionEventRegistry} from "./EmissionEventRegistry.sol";

/// @title GovernanceModule
/// @notice DP4 "governed immutability" and DP5 "automated escalation".
///
///         The EmissionEventRegistry is append-only and stays byte-identical
///         forever. Corrections therefore live HERE, as their own append-only
///         records: each names the original event by index AND by hash
///         (cross-reference), carries a reason and evidence, is written only
///         by an authorised corrector, and is announced by CorrectionLogged.
///         A correction can itself be superseded, forming a visible chain.
///         "Effective" views apply the latest correction; the raw record is
///         never touched — exactly the property whose absence broke the
///         Toucan/KlimaDAO cases in the corpus.
///
///         The module is UUPS-upgradeable, and the ONLY account allowed to
///         upgrade it is the ConsortiumMultisig — a regulator override is
///         demonstrable, but only as a joint, logged act (never unilateral).
contract GovernanceModule is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant CORRECTOR_ROLE = keccak256("CORRECTOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    EmissionEventRegistry public eventRegistry;

    struct Correction {
        uint256 productId;
        uint256 originalIndex;        // which event in the product's chain
        bytes32 originalEventHash;    // cross-reference: hash of the original
        uint256 correctedActivityData;
        int256 correctedEmissionFactor;
        int256 correctedCo2eGrams;    // recomputed on-chain, same formula
        string reason;
        bytes32 evidenceHash;         // evidence supporting the correction
        address correctedBy;
        uint64 timestamp;
        uint256 supersedesCorrectionId; // 0 = corrects the original; else 1-based id
    }

    /// Correction ids are 1-based so that 0 can mean "none".
    Correction[] private _corrections;
    mapping(uint256 => mapping(uint256 => uint256)) public latestCorrectionId;

    // ------------------------------ DP5 ------------------------------
    mapping(uint8 => uint256) public stageThresholdGrams; // 0 = no threshold
    struct Escalation {
        uint256 productId;
        uint256 eventIndex;
        int256 co2eGrams;
        uint256 thresholdGrams; // 0 for manual escalations
        string reason;
        address raisedBy;
        uint64 timestamp;
    }
    Escalation[] private _escalations;
    mapping(uint256 => mapping(uint256 => bool)) private _autoEscalated;

    event CorrectionLogged(
        uint256 indexed productId,
        uint256 indexed originalIndex,
        bytes32 originalEventHash,
        uint256 correctionId,
        uint256 supersedesCorrectionId,
        int256 originalCo2eGrams,
        int256 correctedCo2eGrams,
        string reason,
        address indexed correctedBy
    );
    event EscalationRaised(
        uint256 indexed productId,
        uint256 indexed eventIndex,
        int256 co2eGrams,
        uint256 thresholdGrams,
        string reason,
        address indexed raisedBy
    );
    event StageThresholdSet(uint8 indexed stageId, uint256 maxAbsGrams);

    error InvalidStage(uint8 stageId);
    error NoCorrection(uint256 correctionId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        EmissionEventRegistry _eventRegistry,
        address upgrader
    ) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        eventRegistry = _eventRegistry;
    }

    /// @dev The heart of the multisig control: only the consortium multisig
    ///      holds UPGRADER_ROLE, so no single account can swap the logic.
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // --------------------- DP4: governed correction ---------------------

    /// @notice Append a superseding correction for a recorded event. The
    ///         original record is NOT modified — it cannot be; the registry
    ///         has no write path — this record supersedes it for reporting.
    function correctEvent(
        uint256 productId,
        uint256 originalIndex,
        uint256 correctedActivityData,
        int256 correctedEmissionFactor,
        string calldata reason,
        bytes32 evidenceHash
    ) external onlyRole(CORRECTOR_ROLE) returns (uint256 correctionId) {
        // Reverts if the event does not exist:
        EmissionEventRegistry.EmissionEvent memory original =
            eventRegistry.eventAt(productId, originalIndex);

        int256 correctedCo2e =
            (int256(correctedActivityData) * correctedEmissionFactor) / 1_000_000;
        uint256 supersedes = latestCorrectionId[productId][originalIndex];

        _corrections.push(
            Correction(
                productId,
                originalIndex,
                original.eventHash,
                correctedActivityData,
                correctedEmissionFactor,
                correctedCo2e,
                reason,
                evidenceHash,
                msg.sender,
                uint64(block.timestamp),
                supersedes
            )
        );
        correctionId = _corrections.length; // 1-based
        latestCorrectionId[productId][originalIndex] = correctionId;

        emit CorrectionLogged(
            productId,
            originalIndex,
            original.eventHash,
            correctionId,
            supersedes,
            original.co2eGrams,
            correctedCo2e,
            reason,
            msg.sender
        );
    }

    function correctionCount() external view returns (uint256) {
        return _corrections.length;
    }

    function correctionAt(uint256 correctionId) public view returns (Correction memory) {
        if (correctionId == 0 || correctionId > _corrections.length) revert NoCorrection(correctionId);
        return _corrections[correctionId - 1];
    }

    function hasCorrection(uint256 productId, uint256 eventIndex) external view returns (bool) {
        return latestCorrectionId[productId][eventIndex] != 0;
    }

    /// @notice The CO2e that reporting should use for one event: the latest
    ///         correction if any, otherwise the original.
    function effectiveCo2e(uint256 productId, uint256 eventIndex) public view returns (int256) {
        uint256 id = latestCorrectionId[productId][eventIndex];
        if (id != 0) return _corrections[id - 1].correctedCo2eGrams;
        return eventRegistry.eventAt(productId, eventIndex).co2eGrams;
    }

    /// @notice Product total with the latest corrections applied. Compare
    ///         with AggregationContract.productTotal (the uncorrected raw
    ///         record): both are deterministic and auditable; the DIFFERENCE
    ///         between them is exactly the sum of logged corrections.
    function effectiveProductTotal(uint256 productId) external view returns (int256 total) {
        uint256 n = eventRegistry.eventCount(productId);
        for (uint256 i = 0; i < n; i++) {
            total += effectiveCo2e(productId, i);
        }
    }

    // --------------------- DP5: automated escalation ---------------------

    function setStageThreshold(uint8 stageId, uint256 maxAbsGrams) external onlyRole(GOVERNOR_ROLE) {
        if (stageId < 1 || stageId > 10) revert InvalidStage(stageId);
        stageThresholdGrams[stageId] = maxAbsGrams;
        emit StageThresholdSet(stageId, maxAbsGrams);
    }

    /// @notice Screen every event of a product against the stage thresholds.
    ///         Callable by ANYONE (screening is transparency, not privilege);
    ///         each breach is logged and emitted once.
    function screenProduct(uint256 productId) external returns (uint256 flagged) {
        uint256 n = eventRegistry.eventCount(productId);
        for (uint256 i = 0; i < n; i++) {
            EmissionEventRegistry.EmissionEvent memory e = eventRegistry.eventAt(productId, i);
            uint256 threshold = stageThresholdGrams[e.stageId];
            if (threshold == 0 || _autoEscalated[productId][i]) continue;
            uint256 magnitude = e.co2eGrams < 0 ? uint256(-e.co2eGrams) : uint256(e.co2eGrams);
            if (magnitude > threshold) {
                _autoEscalated[productId][i] = true;
                _escalations.push(
                    Escalation(productId, i, e.co2eGrams, threshold, "threshold breach", msg.sender, uint64(block.timestamp))
                );
                emit EscalationRaised(productId, i, e.co2eGrams, threshold, "threshold breach", msg.sender);
                flagged++;
            }
        }
    }

    /// @notice Manual escalation by an auditor (anomalies thresholds miss).
    function raiseEscalation(
        uint256 productId,
        uint256 eventIndex,
        string calldata reason
    ) external onlyRole(AUDITOR_ROLE) {
        EmissionEventRegistry.EmissionEvent memory e = eventRegistry.eventAt(productId, eventIndex);
        _escalations.push(
            Escalation(productId, eventIndex, e.co2eGrams, 0, reason, msg.sender, uint64(block.timestamp))
        );
        emit EscalationRaised(productId, eventIndex, e.co2eGrams, 0, reason, msg.sender);
    }

    function escalationCount() external view returns (uint256) {
        return _escalations.length;
    }

    function escalationAt(uint256 index) external view returns (Escalation memory) {
        return _escalations[index];
    }
}
